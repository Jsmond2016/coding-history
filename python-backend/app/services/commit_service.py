"""Commit service – async SQLAlchemy port of CommitService.ts."""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.commit import Commit
from app.models.repository import Repository
from app.services.data_metrics_config_service import DataMetricsConfigService

# ---------------------------------------------------------------------------
# Work-status calculator (mirrors workStatus.config.ts)
# ---------------------------------------------------------------------------


def calculate_work_status(
    total_commits: int,
    has_overtime: bool,
    thresholds: dict[str, int] | None = None,
) -> str:
    if thresholds is None:
        thresholds = {"relaxed": 6, "normal": 10, "busy": 15, "superCrazy": 20}

    if has_overtime:
        if total_commits >= thresholds["superCrazy"]:
            return "superCrazyOvertime"
        return "overtime"

    if total_commits < thresholds["relaxed"]:
        return "relaxed"
    elif total_commits < thresholds["normal"]:
        return "normal"
    elif total_commits < thresholds["busy"]:
        return "busy"
    elif total_commits < thresholds["superCrazy"]:
        return "crazy"
    else:
        return "crazy"


# ---------------------------------------------------------------------------
# Gap-fill resolver (mirrors resolveScanFromDateWithGapFill)
# ---------------------------------------------------------------------------


def resolve_scan_from_date_with_gap_fill(
    planned_start: datetime,
    db_latest_ms: int | None,
    max_lookback_days: int = 365,
) -> datetime:
    now = datetime.now(tz=timezone.utc)
    floor = (now - timedelta(days=max_lookback_days)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    if planned_start < floor:
        return floor

    if db_latest_ms is None or db_latest_ms >= int(planned_start.timestamp() * 1000):
        return planned_start

    extended = datetime.fromtimestamp(db_latest_ms / 1000, tz=timezone.utc)
    extended = (extended - timedelta(days=2)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    if extended < floor:
        return floor
    return extended


# ---------------------------------------------------------------------------
# CommitService
# ---------------------------------------------------------------------------


class CommitService:
    """Query and insert commits, compute statistics and by-date groupings."""

    # ------------------------------------------------------------------
    # max commit date
    # ------------------------------------------------------------------

    @staticmethod
    async def get_max_commit_date_ms(db: AsyncSession, repo_id: str) -> int | None:
        stmt = select(func.max(Commit.commit_date)).where(Commit.repo_id == repo_id)
        val = (await db.execute(stmt)).scalar_one_or_none()
        return int(val) if val is not None else None

    # ------------------------------------------------------------------
    # commit date range
    # ------------------------------------------------------------------

    @staticmethod
    async def get_commit_date_range(
        db: AsyncSession, repo_id: str
    ) -> dict[str, int] | None:
        stmt = select(
            func.min(Commit.commit_date).label("earliest"),
            func.max(Commit.commit_date).label("latest"),
        ).where(Commit.repo_id == repo_id)
        row = (await db.execute(stmt)).one()
        if row.earliest is None or row.latest is None:
            return None
        return {"earliest": int(row.earliest), "latest": int(row.latest)}

    # ------------------------------------------------------------------
    # batch insert
    # ------------------------------------------------------------------

    @staticmethod
    async def batch_insert_commits(
        db: AsyncSession,
        repo_id: str,
        commits: list[dict[str, Any]],
    ) -> dict[str, int]:
        if not commits:
            return {"inserted": 0, "skipped": 0}

        now = int(time.time() * 1000)

        # deduplicate by hash from input
        unique_hashes = list({c["hash"]: True for c in commits}.keys())

        # find existing hashes
        stmt = select(Commit.commit_hash).where(
            Commit.repo_id == repo_id,
            Commit.commit_hash.in_(unique_hashes),
        )
        existing_rows = (await db.execute(stmt)).scalars().all()
        existing_set = set(existing_rows)

        new_commits = [c for c in commits if c["hash"] not in existing_set]
        if not new_commits:
            return {"inserted": 0, "skipped": len(commits)}

        # keep first occurrence per hash
        by_hash: dict[str, dict] = {}
        for c in new_commits:
            if c["hash"] not in by_hash:
                by_hash[c["hash"]] = c
        to_insert = list(by_hash.values())

        def _branch_for_db(branch: str | None) -> str | None:
            if not branch or branch in ("release", "master"):
                return None
            return branch

        try:
            for commit in to_insert:
                db.add(
                    Commit(
                        repo_id=repo_id,
                        commit_hash=commit["hash"],
                        author_name=commit["authorName"],
                        author_email=commit["authorEmail"],
                        commit_date=commit["date"],
                        message=commit["message"],
                        files_changed=commit.get("filesChanged", 0),
                        insertions=commit.get("insertions", 0),
                        deletions=commit.get("deletions", 0),
                        branch=_branch_for_db(commit.get("branch")),
                        created_at=now,
                    )
                )
            await db.flush()
        except Exception:
            # fallback to individual inserts
            await db.rollback()
            inserted = 0
            for commit in to_insert:
                try:
                    db.add(
                        Commit(
                            repo_id=repo_id,
                            commit_hash=commit["hash"],
                            author_name=commit["authorName"],
                            author_email=commit["authorEmail"],
                            commit_date=commit["date"],
                            message=commit["message"],
                            files_changed=commit.get("filesChanged", 0),
                            insertions=commit.get("insertions", 0),
                            deletions=commit.get("deletions", 0),
                            branch=_branch_for_db(commit.get("branch")),
                            created_at=now,
                        )
                    )
                    await db.flush()
                    inserted += 1
                except Exception:
                    pass
            return {"inserted": inserted, "skipped": len(commits) - inserted}

        return {"inserted": len(to_insert), "skipped": len(commits) - len(to_insert)}

    # ------------------------------------------------------------------
    # helpers – overtime & time formatting
    # ------------------------------------------------------------------

    @staticmethod
    def _is_overtime(commit_date_ms: int, overtime_hour: int) -> bool:
        dt = datetime.fromtimestamp(commit_date_ms / 1000)
        return dt.hour >= overtime_hour

    @staticmethod
    def _format_time(commit_date_ms: int) -> str:
        dt = datetime.fromtimestamp(commit_date_ms / 1000)
        return dt.strftime("%H:%M")

    # ------------------------------------------------------------------
    # commits by date
    # ------------------------------------------------------------------

    @staticmethod
    async def get_commits_by_date(
        db: AsyncSession,
        start_date: int,
        end_date: int,
        repository_ids: list[str] | None = None,
        author_emails: list[str] | None = None,
        is_overtime: bool | None = None,
    ) -> dict[str, Any]:
        conditions = [
            Commit.commit_date >= start_date,
            Commit.commit_date <= end_date,
        ]
        if repository_ids:
            conditions.append(Commit.repo_id.in_(repository_ids))
        if author_emails:
            conditions.append(Commit.author_email.in_(author_emails))
        where = and_(*conditions)

        stmt = (
            select(Commit, Repository.name.label("repo_name"))
            .join(Commit.repository)
            .where(where)
            .order_by(Commit.commit_date.desc())
        )
        rows = (await db.execute(stmt)).all()

        # fetch config
        metrics_config = await DataMetricsConfigService.get_config(db)
        overtime_hour = metrics_config["overtimeHour"]
        thresholds = metrics_config["thresholds"]

        # build commit dicts
        commits_list: list[dict] = []
        for row in rows:
            commit: Commit = row[0]
            repo_name: str = row[1]
            commit_date_ms = int(commit.commit_date)
            ot = CommitService._is_overtime(commit_date_ms, overtime_hour)
            commits_list.append(
                {
                    "id": commit.id,
                    "repoId": commit.repo_id,
                    "repoName": repo_name,
                    "commitHash": commit.commit_hash,
                    "authorName": commit.author_name,
                    "authorEmail": commit.author_email,
                    "commitDate": commit_date_ms,
                    "message": commit.message,
                    "filesChanged": commit.files_changed,
                    "insertions": commit.insertions,
                    "deletions": commit.deletions,
                    "branch": commit.branch,
                    "createdAt": int(commit.created_at),
                    "isOvertime": ot,
                    "overtimeCommitTimes": [CommitService._format_time(commit_date_ms)] if ot else None,
                }
            )

        # group by date, dedup by repoId:commitHash
        date_map: dict[str, list[dict]] = {}
        seen_in_date: dict[str, dict[str, dict]] = {}

        for c in commits_list:
            dt = datetime.fromtimestamp(c["commitDate"] / 1000)
            date_str = dt.strftime("%Y-%m-%d")
            key = f"{c['repoId']}:{c['commitHash']}"

            if date_str not in seen_in_date:
                seen_in_date[date_str] = {}

            dm = seen_in_date[date_str]
            if key in dm:
                existing = dm[key]
                if not existing.get("branch") and c.get("branch"):
                    existing["branch"] = c["branch"]
                continue

            dm[key] = c
            date_map.setdefault(date_str, []).append(c)

        # build per-day summaries
        data: list[dict] = []
        for date_str, day_commits in date_map.items():
            overtime_commits = [c for c in day_commits if c["isOvertime"]]
            overtime_times = sorted(
                [
                    {
                        "time": CommitService._format_time(c["commitDate"]),
                        "ts": c["commitDate"],
                    }
                    for c in overtime_commits
                ],
                key=lambda x: x["ts"],
                reverse=True,
            )[:5]
            overtime_times_str = [o["time"] for o in overtime_times]

            sorted_commits = sorted(day_commits, key=lambda x: x["commitDate"], reverse=True)

            has_release = any(
                "chore(release)" in c["message"].lower() or "chore: release" in c["message"].lower()
                for c in day_commits
            )

            work_status = calculate_work_status(
                len(day_commits),
                len(overtime_commits) > 0,
                thresholds,
            )

            repositories = sorted({c["repoName"] for c in day_commits})
            branches_set: set[str] = set()
            for c in day_commits:
                if c.get("branch"):
                    branches_set.add(c["branch"])
            branches = sorted(branches_set)

            data.append(
                {
                    "date": date_str,
                    "commits": sorted_commits,
                    "totalCommits": len(day_commits),
                    "overtimeCount": len(overtime_commits),
                    "latestOvertimeCommits": overtime_times_str,
                    "workStatus": work_status,
                    "hasRelease": has_release,
                    "repositories": repositories,
                    "branches": branches,
                }
            )

        # sort descending
        data.sort(key=lambda d: d["date"], reverse=True)

        # filter by overtime flag
        if is_overtime is not None:
            data = [
                d for d in data if (d["overtimeCount"] > 0) == is_overtime
            ]

        total_commits = sum(d["totalCommits"] for d in data)
        return {"data": data, "total": total_commits}

    # ------------------------------------------------------------------
    # commits (paginated)
    # ------------------------------------------------------------------

    @staticmethod
    async def get_commits(
        db: AsyncSession,
        start_date: int,
        end_date: int,
        repository_ids: list[str] | None = None,
        author_emails: list[str] | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        conditions = [
            Commit.commit_date >= start_date,
            Commit.commit_date <= end_date,
        ]
        if repository_ids:
            conditions.append(Commit.repo_id.in_(repository_ids))
        if author_emails:
            conditions.append(Commit.author_email.in_(author_emails))
        where = and_(*conditions)

        # total
        count_q = select(func.count()).select_from(Commit).where(where)
        total = (await db.execute(count_q)).scalar_one()

        # data
        data_q = (
            select(Commit, Repository.name.label("repo_name"))
            .join(Commit.repository)
            .where(where)
            .order_by(Commit.commit_date.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        rows = (await db.execute(data_q)).all()

        data = [
            {
                "id": row.Commit.id,
                "repoId": row.Commit.repo_id,
                "repoName": row.repo_name,
                "commitHash": row.Commit.commit_hash,
                "authorName": row.Commit.author_name,
                "authorEmail": row.Commit.author_email,
                "commitDate": int(row.Commit.commit_date),
                "message": row.Commit.message,
                "filesChanged": row.Commit.files_changed,
                "insertions": row.Commit.insertions,
                "deletions": row.Commit.deletions,
                "branch": row.Commit.branch,
                "createdAt": int(row.Commit.created_at),
            }
            for row in rows
        ]

        return {
            "data": data,
            "total": total,
            "page": page,
            "pageSize": page_size,
        }

    # ------------------------------------------------------------------
    # statistics
    # ------------------------------------------------------------------

    @staticmethod
    async def get_statistics(
        db: AsyncSession,
        start_date: int,
        end_date: int,
        repository_ids: list[str] | None = None,
        author_emails: list[str] | None = None,
    ) -> dict[str, Any]:
        conditions = [
            Commit.commit_date >= start_date,
            Commit.commit_date <= end_date,
        ]
        if repository_ids:
            conditions.append(Commit.repo_id.in_(repository_ids))
        if author_emails:
            conditions.append(Commit.author_email.in_(author_emails))
        where = and_(*conditions)

        # aggregates
        agg_q = select(
            func.count().label("cnt"),
            func.coalesce(func.sum(Commit.insertions), 0).label("total_ins"),
            func.coalesce(func.sum(Commit.deletions), 0).label("total_del"),
            func.coalesce(func.sum(Commit.files_changed), 0).label("total_files"),
        ).where(where)
        agg = (await db.execute(agg_q)).one()

        # by repository
        by_repo_q = (
            select(
                Commit.repo_id,
                func.count().label("cnt"),
                func.coalesce(func.sum(Commit.insertions), 0).label("ins"),
                func.coalesce(func.sum(Commit.deletions), 0).label("dels"),
            )
            .where(where)
            .group_by(Commit.repo_id)
        )
        by_repo_rows = (await db.execute(by_repo_q)).all()
        repo_ids = [r.repo_id for r in by_repo_rows]

        repo_names: dict[str, str] = {}
        if repo_ids:
            rn_q = select(Repository.id, Repository.name).where(Repository.id.in_(repo_ids))
            for rr in (await db.execute(rn_q)).all():
                repo_names[rr.id] = rr.name

        by_repository = [
            {
                "repoId": r.repo_id,
                "repoName": repo_names.get(r.repo_id, r.repo_id),
                "commits": r.cnt,
                "insertions": int(r.ins),
                "deletions": int(r.dels),
            }
            for r in by_repo_rows
        ]

        # by date – raw SQL for SQLite date formatting
        params: dict[str, Any] = {"start_date": start_date, "end_date": end_date}
        by_date_sql = (
            "SELECT "
            "  DATE(commit_date / 1000, 'unixepoch') as date, "
            "  COUNT(*) as commits, "
            "  SUM(insertions) as insertions, "
            "  SUM(deletions) as deletions "
            "FROM commits "
            "WHERE commit_date >= :start_date AND commit_date <= :end_date"
        )
        if repository_ids:
            placeholders = ",".join([f":repo_{i}" for i in range(len(repository_ids))])
            by_date_sql += f" AND repo_id IN ({placeholders})"
            for i, rid in enumerate(repository_ids):
                params[f"repo_{i}"] = rid
        if author_emails:
            placeholders = ",".join([f":author_{i}" for i in range(len(author_emails))])
            by_date_sql += f" AND author_email IN ({placeholders})"
            for i, email in enumerate(author_emails):
                params[f"author_{i}"] = email
        by_date_sql += " GROUP BY date ORDER BY date DESC"

        by_date_rows = (await db.execute(text(by_date_sql), params)).mappings().all()
        by_date = [
            {
                "date": row["date"],
                "commits": int(row["commits"]),
                "insertions": int(row["insertions"]) if row["insertions"] is not None else 0,
                "deletions": int(row["deletions"]) if row["deletions"] is not None else 0,
            }
            for row in by_date_rows
        ]

        return {
            "totalCommits": agg.cnt,
            "totalInsertions": int(agg.total_ins),
            "totalDeletions": int(agg.total_del),
            "totalFilesChanged": int(agg.total_files),
            "byRepository": by_repository,
            "byDate": by_date,
        }
