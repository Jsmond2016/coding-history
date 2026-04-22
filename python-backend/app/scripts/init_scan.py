#!/usr/bin/env python
"""Git 仓库初始化扫描脚本

用法:
  python -m app.scripts.init_scan              # 扫描最近3个月
  python -m app.scripts.init_scan --months 6   # 扫描最近6个月
  python -m app.scripts.init_scan --months 12  # 扫描最近12个月

支持断点续传：每个仓库按周分阶段扫描，进度保存在数据库中，
下次运行会从上次中断的位置继续。
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from loguru import logger

# ---------------------------------------------------------------------------
# CLI argument parsing
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Git 仓库初始化扫描")
    parser.add_argument(
        "--months",
        type=int,
        default=3,
        help="扫描最近 N 个月的提交记录 (默认 3, 最大 24)",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _pull_repository(repo_path: str, repo_name: str) -> bool:
    """Try ``git pull`` on the given repo. Returns ``True`` on success."""
    import git as gitpython

    try:
        repo = gitpython.Repo(repo_path)

        if not repo.remotes:
            logger.info(f"  [Git Pull] {repo_name} 没有配置远程仓库，跳过更新")
            return False

        logger.info(f"  [Git Pull] 正在更新 {repo_name}...")
        remote = repo.remotes.origin
        pull_info = remote.pull()

        changes = sum(1 for info in pull_info if info.flags != 0) if pull_info else 0
        if changes > 0:
            logger.info(f"  [Git Pull] ✓ {repo_name} 更新成功")
        else:
            logger.info(f"  [Git Pull] ✓ {repo_name} 已是最新版本")
        return True
    except Exception as exc:
        logger.warning(f"  [Git Pull] ⚠ {repo_name} 更新失败: {exc}，将继续扫描")
        return False


def _split_into_weeks(
    start_date: datetime, end_date: datetime
) -> list[tuple[datetime, datetime]]:
    """Split a date range into weekly chunks."""
    weeks: list[tuple[datetime, datetime]] = []
    current_start = start_date

    while current_start < end_date:
        current_end = current_start + timedelta(days=7)
        week_end = min(current_end, end_date)
        weeks.append((current_start, week_end))

        current_start = week_end
        # avoid infinite loop
        if current_start == week_end:
            current_start += timedelta(days=1)

    return weeks


# ---------------------------------------------------------------------------
# Phase-based scan (checkpoint / resume)
# ---------------------------------------------------------------------------


async def _scan_repo_in_phases(
    repo: dict,
    target_start: datetime,
    end_date: datetime,
    author_emails: list[str],
) -> dict:
    """Scan a single repository in weekly phases with checkpoint support.

    Returns ``{"scanned": int, "inserted": int, "skipped": int, "completed": bool}``.
    """
    from app.core.database import async_session_factory
    from app.services.commit_service import CommitService
    from app.services.git_scan_service import GitScanService
    from app.services.repository_service import RepositoryService

    repo_id = repo["id"]
    repo_name = repo["name"]

    async with async_session_factory() as db:
        # Get current scan progress
        scan_to_date_ms = await RepositoryService.get_initial_scan_to_date(db, repo_id)

    actual_start = (
        datetime.fromtimestamp(scan_to_date_ms / 1000, tz=timezone.utc)
        if scan_to_date_ms
        else target_start
    )

    if actual_start >= end_date:
        logger.info(
            f"  [已完成] 已扫描到 {actual_start.strftime('%Y-%m-%d')}，无需继续扫描"
        )
        return {"scanned": 0, "inserted": 0, "skipped": 0, "completed": True}

    weeks = _split_into_weeks(actual_start, end_date)
    total_scanned = 0
    total_inserted = 0
    total_skipped = 0
    last_scanned_date = actual_start

    logger.info(
        f"  [分阶段扫描] 从 {actual_start.strftime('%Y-%m-%d')} 继续，"
        f"共 {len(weeks)} 个阶段"
    )

    scanner = GitScanService(repo["path"])

    for i, (week_start, week_end) in enumerate(weeks, 1):
        try:
            logger.info(
                f"  [阶段 {i}/{len(weeks)}] "
                f"{week_start.strftime('%Y-%m-%d')} ~ {week_end.strftime('%Y-%m-%d')}"
            )

            # Extend end by 1 day to include all commits in the week
            week_end_plus_one = week_end + timedelta(days=1)
            commits = await scanner.incremental_scan(
                week_start, author_emails, to_date=week_end_plus_one
            )

            if commits:
                branches = {
                    c.branch for c in commits if c.branch
                }
                branch_info = ""
                if branches:
                    sample = list(branches)[:5]
                    suffix = "..." if len(branches) > 5 else ""
                    branch_info = f"，涉及 {len(branches)} 个分支: {', '.join(sample)}{suffix}"

                commit_dicts = [c.to_dict() for c in commits]

                async with async_session_factory() as db:
                    insert_result = await CommitService.batch_insert_commits(
                        db, repo_id, commit_dicts
                    )
                    await db.commit()

                logger.info(
                    f"    ✓ 发现: {len(commits)} 条{branch_info}, "
                    f"新增: {insert_result['inserted']} 条, "
                    f"跳过: {insert_result['skipped']} 条"
                )

                total_scanned += len(commits)
                total_inserted += insert_result["inserted"]
                total_skipped += insert_result["skipped"]
            else:
                logger.info("    - 无提交记录")

            # Update checkpoint
            last_scanned_date = week_end
            week_end_ms = int(week_end.timestamp() * 1000)
            async with async_session_factory() as db:
                await RepositoryService.update_initial_scan_to_date(
                    db, repo_id, week_end_ms
                )
                await db.commit()

            logger.info(
                f"    [进度更新] 已扫描到 {week_end.strftime('%Y-%m-%d')}"
            )

            # Small delay between phases
            if i < len(weeks):
                await asyncio.sleep(0.1)

        except Exception as exc:
            logger.error(f"  [阶段 {i} 失败] {exc}")
            # Save progress to the start of this phase so we retry from here
            week_start_ms = int(week_start.timestamp() * 1000)
            async with async_session_factory() as db:
                await RepositoryService.update_initial_scan_to_date(
                    db, repo_id, week_start_ms
                )
                await db.commit()
            logger.info(
                f"    [进度保存] 失败后保存进度到 {week_start.strftime('%Y-%m-%d')}，下次从此继续"
            )

    completed = last_scanned_date >= end_date
    return {
        "scanned": total_scanned,
        "inserted": total_inserted,
        "skipped": total_skipped,
        "completed": completed,
    }


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def init_scan(months: int) -> None:
    from app.core.database import async_session_factory
    from app.services.commit_service import CommitService
    from app.services.config_service import ConfigService
    from app.services.repository_service import RepositoryService

    logger.info("=" * 60)
    logger.info(
        f"[初始化扫描] 开始扫描最近 {months} 个月的提交记录（支持断点续传）..."
    )
    logger.info("=" * 60)

    now = datetime.now(tz=timezone.utc)
    target_start = (now - timedelta(days=months * 30)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    target_start_ms = int(target_start.timestamp() * 1000)

    total_scanned = 0
    total_inserted = 0
    total_skipped = 0
    success_count = 0
    fail_count = 0
    completed_count = 0

    # Get all enabled repos
    async with async_session_factory() as db:
        repos = await ConfigService.get_enabled_repos(db)
    logger.info(f"[初始化] 找到 {len(repos)} 个启用的仓库\n")

    for repo in repos:
        repo_id = repo["id"]
        repo_name = repo["name"]

        # Check if initial scan is already completed
        async with async_session_factory() as db:
            is_done = await RepositoryService.is_initial_scan_completed(
                db, repo_id, target_start_ms
            )

        if is_done:
            logger.info(f"[跳过] {repo_name} (已完成初始扫描到目标日期)")
            completed_count += 1
            continue

        try:
            logger.info(f"\n[扫描仓库] {repo_name}")
            logger.info(f"  路径: {repo['path']}")

            # Pull latest code
            _pull_repository(repo["path"], repo_name)

            # Show scan progress
            async with async_session_factory() as db:
                scan_to_date_ms = await RepositoryService.get_initial_scan_to_date(
                    db, repo_id
                )

            if scan_to_date_ms:
                progress_date = datetime.fromtimestamp(
                    scan_to_date_ms / 1000, tz=timezone.utc
                )
                logger.info(
                    f"  继续扫描: 从 {progress_date.strftime('%Y-%m-%d')} 继续"
                )
            else:
                logger.info(
                    f"  首次扫描: 从 {target_start.strftime('%Y-%m-%d')} 开始"
                )
            logger.info(f"  目标日期: {now.strftime('%Y-%m-%d')}")

            # Get author emails
            async with async_session_factory() as db:
                author_emails = await ConfigService.get_author_emails_by_repo_id(
                    db, repo_id
                )

            if not author_emails:
                logger.warning(f"  [跳过] 仓库 {repo_name} 没有配置作者，跳过")
                continue

            # Phase-based scan
            result = await _scan_repo_in_phases(
                repo, target_start, now, author_emails
            )

            total_scanned += result["scanned"]
            total_inserted += result["inserted"]
            total_skipped += result["skipped"]

            # Update repo scan info
            async with async_session_factory() as db:
                count_result = await CommitService.get_commits(
                    db,
                    start_date=0,
                    end_date=int(time.time() * 1000),
                    repository_ids=[repo_id],
                    page=1,
                    page_size=1,
                )
                await RepositoryService.update_repo_scan_info(
                    db, repo_id, int(time.time() * 1000), count_result["total"]
                )
                await db.commit()

            if result["completed"]:
                logger.info(
                    f"  [完成] 已扫描到目标日期，"
                    f"仓库总计: {count_result['total']} 条提交记录"
                )
                completed_count += 1
            else:
                logger.info(
                    f"  [部分完成] 已保存进度，"
                    f"仓库总计: {count_result['total']} 条提交记录，下次继续扫描"
                )

            success_count += 1
        except Exception as exc:
            logger.error(f"[扫描失败] {repo_name}: {exc}")
            fail_count += 1

    logger.info("\n" + "=" * 60)
    logger.info("[扫描完成] 统计信息:")
    logger.info(f"  已完成仓库: {completed_count} 个")
    logger.info(f"  进行中仓库: {success_count - completed_count} 个")
    logger.info(f"  失败仓库: {fail_count} 个")
    logger.info(f"  扫描提交总数: {total_scanned} 条")
    logger.info(f"  新增入库: {total_inserted} 条")
    logger.info(f"  跳过重复: {total_skipped} 条")
    logger.info("=" * 60 + "\n")


def main() -> None:
    args = parse_args()
    months = args.months

    if months < 1 or months > 24:
        logger.warning(f"无效的月份参数: {months}，使用默认值 3 个月")
        months = 3

    try:
        asyncio.run(init_scan(months))
    except KeyboardInterrupt:
        logger.info("[中断] 用户中断扫描")
        sys.exit(0)
    except Exception as exc:
        logger.error(f"初始化扫描失败: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
