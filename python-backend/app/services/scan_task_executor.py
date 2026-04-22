"""Scan task executor – Python port of ScanTaskExecutor.ts."""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.commit_service import CommitService, resolve_scan_from_date_with_gap_fill
from app.services.config_service import ConfigService
from app.services.git_scan_service import GitScanService
from app.services.log_service import LogService
from app.services.repository_service import RepositoryService

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# pull_repository
# ---------------------------------------------------------------------------


async def pull_repository(repo_path: str, repo_name: str) -> bool:
    """Run ``git pull`` on *repo_path*; return True on success."""
    try:
        from git import Repo

        def _pull() -> bool:
            repo = Repo(repo_path)
            # check for remotes
            if not repo.remotes:
                return False
            repo.remotes.origin.pull()
            return True

        return await asyncio.to_thread(_pull)
    except Exception as exc:
        logger.warning("Git Pull  %s failed: %s – continuing scan", repo_name, exc)
        return False


# ---------------------------------------------------------------------------
# validate_date_range
# ---------------------------------------------------------------------------


def validate_date_range(start_date: datetime, end_date: datetime) -> bool:
    """Raise if range is invalid (>180 days or reversed)."""
    if start_date >= end_date:
        raise ValueError("开始时间必须早于结束时间")

    span_days = (end_date - start_date).days
    if span_days > 180:
        raise ValueError(
            f"时间跨度不能超过6个月（当前跨度：{span_days}天）"
        )
    return True


# ---------------------------------------------------------------------------
# calculate_scan_date_range
# ---------------------------------------------------------------------------

_DAYS_MAP: dict[str, int] = {
    "1day": 1,
    "3days": 3,
    "7days": 7,
    "2weeks": 14,
    "1month": 30,
    "3months": 90,
    "6months": 180,
}


def calculate_scan_date_range(
    scan_range_type: str,
    start_date: int | None = None,
    end_date: int | None = None,
) -> tuple[datetime, datetime]:
    """Return *(from_date, to_date)* for the given range type."""
    now = datetime.now(tz=timezone.utc).replace(hour=23, minute=59, second=59, microsecond=999000)

    if scan_range_type == "custom":
        if start_date is None or end_date is None:
            raise ValueError("自定义时间范围必须提供开始时间和结束时间")
        fd = datetime.fromtimestamp(start_date / 1000, tz=timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        td = datetime.fromtimestamp(end_date / 1000, tz=timezone.utc).replace(
            hour=23, minute=59, second=59, microsecond=999000
        )
        validate_date_range(fd, td)
        return fd, td

    if scan_range_type not in _DAYS_MAP:
        raise ValueError(f"不支持的扫描范围类型: {scan_range_type}")

    days = _DAYS_MAP[scan_range_type]
    from_date = datetime.now(tz=timezone.utc) - timedelta(days=days)
    from_date = from_date.replace(hour=0, minute=0, second=0, microsecond=0)
    return from_date, now


# ---------------------------------------------------------------------------
# execute_scan_task
# ---------------------------------------------------------------------------


async def execute_scan_task(
    db: AsyncSession,
    task_dict: dict[str, Any],
    task_id: int | None = None,
) -> dict[str, Any]:
    """Execute a scan task and return a result dict.

    Mirrors ``ScanTaskExecutor.executeScanTask``.
    """
    config_svc = ConfigService()
    repo_svc = RepositoryService()
    commit_svc = CommitService()
    log_svc = LogService()

    # calculate date range
    try:
        from_date, to_date = calculate_scan_date_range(
            task_dict["scanRangeType"],
            task_dict.get("startDate"),
            task_dict.get("endDate"),
        )
    except Exception as exc:
        msg = str(exc)
        logger.error("[任务执行] 计算时间范围失败: %s", msg)
        return {
            "success": False,
            "scannedRepositories": [],
            "totalCommits": 0,
            "errorMessage": msg,
        }

    logger.info("[任务执行] 开始执行任务: %s", task_dict["name"])
    logger.info(
        "[任务执行] 扫描时间范围: %s 至 %s",
        from_date.isoformat(),
        to_date.isoformat(),
    )

    result: dict[str, Any] = {
        "success": True,
        "scannedRepositories": [],
        "totalCommits": 0,
        "errorMessage": None,
    }

    # determine repositories to scan
    all_repos = await config_svc.get_enabled_repos(db)
    task_repo_ids = task_dict.get("repositoryIds")
    repos_to_scan = (
        [r for r in all_repos if r["id"] in task_repo_ids]
        if task_repo_ids
        else all_repos
    )

    if not repos_to_scan:
        had_selection = bool(task_repo_ids and len(task_repo_ids) > 0)
        error_msg = (
            "没有可扫描的仓库：任务指定的仓库可能已全部禁用，或仓库 ID 与当前启用列表不匹配"
            if had_selection
            else "没有可扫描的仓库（请检查是否至少启用了一个仓库）"
        )
        logger.warning("[任务执行] %s", error_msg)
        return {
            "success": False,
            "scannedRepositories": [],
            "totalCommits": 0,
            "errorMessage": error_msg,
        }

    # scan each repository
    for repo in repos_to_scan:
        try:
            logger.info("[任务执行] 扫描仓库: %s", repo["name"])

            author_emails = await config_svc.get_author_emails_by_repo_id(db, repo["id"])
            if not author_emails:
                logger.warning("[任务执行] 仓库 %s 没有配置作者，跳过", repo["name"])
                continue

            # pull latest
            await pull_repository(repo["path"], repo["name"])

            # gap-fill
            db_tip = await commit_svc.get_max_commit_date_ms(db, repo["id"])

            effective_from = resolve_scan_from_date_with_gap_fill(
                from_date, db_tip
            )
            if db_tip is not None and effective_from < from_date:
                logger.info(
                    "[任务执行] %s 库内最新早于任务窗口起点，前推 --since: %s -> %s",
                    repo["name"],
                    from_date.isoformat(),
                    effective_from.isoformat(),
                )

            # scan
            scanner = GitScanService(repo["path"])
            commits = await scanner.incremental_scan(
                effective_from, author_emails, to_date
            )
            logger.info("[任务执行] 发现 %d 个提交记录", len(commits))

            if commits:
                commit_dicts = [c.to_dict() for c in commits]
                insert_result = await commit_svc.batch_insert_commits(
                    db, repo["id"], commit_dicts
                )
                logger.info(
                    "[任务执行] 新增: %d 条, 跳过重复: %d 条",
                    insert_result["inserted"],
                    insert_result["skipped"],
                )
                result["totalCommits"] += insert_result["inserted"]

                # update repo scan info
                db_result = await commit_svc.get_commits(
                    db,
                    start_date=0,
                    end_date=int(time.time() * 1000),
                    repository_ids=[repo["id"]],
                    page=1,
                    page_size=1,
                )
                await repo_svc.update_repo_scan_info(
                    db, repo["id"], int(time.time() * 1000), db_result["total"]
                )
                logger.info(
                    "[任务执行] %s 总计 %d 条提交记录",
                    repo["name"],
                    db_result["total"],
                )
            else:
                logger.info("[任务执行] %s 没有新的提交记录", repo["name"])

            result["scannedRepositories"].append(repo["name"])

        except Exception as exc:
            error_msg = str(exc)
            logger.error(
                "[任务执行] 扫描仓库 %s 失败: %s", repo["name"], error_msg
            )
            result["success"] = False
            if not result["errorMessage"]:
                result["errorMessage"] = f"扫描仓库 {repo['name']} 失败: {error_msg}"
            else:
                result["errorMessage"] += f"; {repo['name']}: {error_msg}"

    # log execution
    execute_time = int(time.time() * 1000)
    try:
        await log_svc.create_scheduled_task_log(
            db,
            task_name=task_dict["name"],
            cron_expression=task_dict.get("cronExpression"),
            start_time=execute_time,
            end_time=execute_time,
            status="success" if result["success"] else "failed",
            repositories=result["scannedRepositories"],
            total_commits=result["totalCommits"],
            error_message=result.get("errorMessage"),
            task_id=task_id,
        )
    except Exception as log_exc:
        logger.error("记录任务执行日志失败: %s", log_exc)

    logger.info(
        "[任务执行] 任务执行完成: %s, 成功: %s, 提交数: %d",
        task_dict["name"],
        result["success"],
        result["totalCommits"],
    )
    return result
