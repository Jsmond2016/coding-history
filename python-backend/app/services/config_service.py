"""Config service – async SQLAlchemy port of ConfigService.ts.

All response keys use camelCase (matching the TS API surface).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.author import Author
from app.models.commit import Commit
from app.models.repository import Repository


class ConfigService:
    """Higher-level repository + author configuration queries."""

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------

    @staticmethod
    async def _get_commit_date_range(
        db: AsyncSession, repo_id: str
    ) -> dict[str, int] | None:
        stmt = (
            select(
                func.min(Commit.commit_date).label("earliest"),
                func.max(Commit.commit_date).label("latest"),
            )
            .where(Commit.repo_id == repo_id)
        )
        row = (await db.execute(stmt)).one()
        if row.earliest is None or row.latest is None:
            return None
        return {"earliest": int(row.earliest), "latest": int(row.latest)}

    # ------------------------------------------------------------------
    # repo config
    # ------------------------------------------------------------------

    @staticmethod
    async def get_repo_config(db: AsyncSession, repo_id: str) -> dict[str, Any] | None:
        stmt = (
            select(Repository)
            .where(Repository.id == repo_id)
        )
        result = await db.execute(stmt)
        repo = result.scalar_one_or_none()
        if repo is None:
            return None

        # authors
        a_stmt = select(Author).where(Author.repo_id == repo_id).order_by(Author.created_at.asc())
        authors = (await db.execute(a_stmt)).scalars().all()

        commit_date_range = await ConfigService._get_commit_date_range(db, repo_id)

        return {
            "id": repo.id,
            "name": repo.name,
            "path": repo.path,
            "enabled": repo.enabled,
            "authors": [
                {
                    "id": a.id,
                    "name": a.name,
                    "email": a.email,
                    "isDefault": a.is_default,
                }
                for a in authors
            ],
            "lastScanTime": int(repo.last_scan_time) if repo.last_scan_time is not None else None,
            "totalCommits": repo.total_commits,
            "commitDateRange": commit_date_range,
            "createdAt": int(repo.created_at),
            "updatedAt": int(repo.updated_at),
        }

    @staticmethod
    async def get_all_repos_config(db: AsyncSession) -> list[dict[str, Any]]:
        stmt = select(Repository).order_by(Repository.name.asc())
        repos = (await db.execute(stmt)).scalars().all()

        results: list[dict[str, Any]] = []
        for repo in repos:
            a_stmt = (
                select(Author)
                .where(Author.repo_id == repo.id)
                .order_by(Author.created_at.asc())
            )
            authors = (await db.execute(a_stmt)).scalars().all()
            commit_date_range = await ConfigService._get_commit_date_range(db, repo.id)

            results.append(
                {
                    "id": repo.id,
                    "name": repo.name,
                    "path": repo.path,
                    "enabled": repo.enabled,
                    "authors": [
                        {
                            "id": a.id,
                            "name": a.name,
                            "email": a.email,
                            "isDefault": a.is_default,
                        }
                        for a in authors
                    ],
                    "lastScanTime": int(repo.last_scan_time)
                    if repo.last_scan_time is not None
                    else None,
                    "totalCommits": repo.total_commits,
                    "commitDateRange": commit_date_range,
                    "createdAt": int(repo.created_at),
                    "updatedAt": int(repo.updated_at),
                }
            )
        return results

    # ------------------------------------------------------------------
    # authors
    # ------------------------------------------------------------------

    @staticmethod
    async def get_authors_by_repo_id(db: AsyncSession, repo_id: str) -> list[dict[str, Any]]:
        stmt = select(Author).where(Author.repo_id == repo_id).order_by(Author.created_at.asc())
        authors = (await db.execute(stmt)).scalars().all()
        return [
            {
                "id": a.id,
                "name": a.name,
                "email": a.email,
                "isDefault": a.is_default,
            }
            for a in authors
        ]

    # ------------------------------------------------------------------
    # enabled repos
    # ------------------------------------------------------------------

    @staticmethod
    async def get_enabled_repos(db: AsyncSession) -> list[dict[str, Any]]:
        stmt = (
            select(Repository)
            .where(Repository.enabled == True)  # noqa: E712
            .order_by(Repository.name.asc())
        )
        repos = (await db.execute(stmt)).scalars().all()
        return [
            {
                "id": r.id,
                "name": r.name,
                "path": r.path,
                "enabled": r.enabled,
            }
            for r in repos
        ]

    # ------------------------------------------------------------------
    # author emails
    # ------------------------------------------------------------------

    @staticmethod
    async def get_all_author_emails(db: AsyncSession) -> list[str]:
        stmt = select(Author.email)
        rows = (await db.execute(stmt)).scalars().all()
        return list(dict.fromkeys(rows))  # deduplicate, preserve order

    @staticmethod
    async def get_author_emails_by_repo_id(db: AsyncSession, repo_id: str) -> list[str]:
        stmt = select(Author.email).where(Author.repo_id == repo_id)
        return list((await db.execute(stmt)).scalars().all())
