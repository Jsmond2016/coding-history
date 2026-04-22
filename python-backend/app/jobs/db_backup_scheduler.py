"""Database backup scheduler using APScheduler.

Port of backend/src/jobs/dbBackupScheduler.ts.
Creates sqlite3 backups on a cron schedule read from app settings.
"""

import asyncio
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import TypedDict

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from loguru import logger

from app.core.config import settings

_scheduler: BackgroundScheduler | None = None


class DatabaseBackupResult(TypedDict):
    """Return type for :func:`run_database_backup`."""

    success: bool
    dest_path: str | None
    source_path: str | None
    error: str | None


def _resolve_sqlite_database_path() -> Path:
    """Return the filesystem path of the SQLite database file.

    Delegates to ``settings.database_path`` which parses ``DATABASE_URL``.
    """
    return settings.database_path


def _local_date_ymd() -> str:
    """Return today's date string in ``YYYY-MM-DD`` format (local time)."""
    now = datetime.now()
    return now.strftime("%Y-%m-%d")


def run_database_backup() -> DatabaseBackupResult:
    """Back up the SQLite database to the configured backup directory.

    Uses the stdlib ``sqlite3`` backup API (``source.backup(target)``) so that
    the backup is consistent even if the database is in use.

    The backup file is named ``coding-history-backup-{YYYY-MM-DD}.db``.
    """
    from app.services.app_setting_service import AppSettingService
    from app.core.database import async_session_factory

    async def _get_backup_dir() -> str:
        async with async_session_factory() as session:
            svc = AppSettingService()
            return await svc.get_backup_dir(session)

    # This function is called from an APScheduler thread (not the main event-loop
    # thread), so asyncio.run() will create a brand-new event loop safely.
    backup_dir = asyncio.run(_get_backup_dir())

    source_path = _resolve_sqlite_database_path()

    if not source_path.exists():
        msg = "源数据库文件不存在"
        logger.warning(f"[DB备份] {msg}，跳过 (path={source_path})")
        return DatabaseBackupResult(
            success=False, source_path=str(source_path), dest_path=None, error=msg
        )

    # Ensure backup directory exists
    backup_dir_path = Path(backup_dir)
    backup_dir_path.mkdir(parents=True, exist_ok=True)

    date_str = _local_date_ymd()
    dest_path = backup_dir_path / f"coding-history-backup-{date_str}.db"

    try:
        source_conn = sqlite3.connect(str(source_path))
        dest_conn = sqlite3.connect(str(dest_path))

        with dest_conn:
            source_conn.backup(dest_conn)

        dest_conn.close()
        source_conn.close()

        logger.info(f"[DB备份] 已完成 (dest={dest_path}, source={source_path})")
        return DatabaseBackupResult(
            success=True, dest_path=str(dest_path), source_path=str(source_path), error=None
        )
    except Exception as exc:
        logger.error(f"[DB备份] 失败 (source={source_path}, dest={dest_path}): {exc}")
        return DatabaseBackupResult(
            success=False,
            dest_path=str(dest_path),
            source_path=str(source_path),
            error=str(exc),
        )


async def start_db_backup_scheduler() -> None:
    """Start the database backup cron scheduler.

    Reads the cron expression from ``AppSettingService``.  If the expression
    is empty / ``false`` / ``off`` / ``0``, the scheduler is not started.
    """
    global _scheduler

    from app.services.app_setting_service import AppSettingService
    from app.core.database import async_session_factory

    async with async_session_factory() as session:
        svc = AppSettingService()
        cron_expr = await svc.get_backup_cron(session)

    if not cron_expr:
        logger.info("[DB备份] 未启用（cron 配置为空、false、off 或 0）")
        return

    # Stop any existing scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None

    try:
        trigger = CronTrigger.from_crontab(cron_expr, timezone="Asia/Shanghai")
    except (ValueError, TypeError) as exc:
        logger.error(f"[DB备份] Cron 表达式无效，未启动定时备份: expr='{cron_expr}', error={exc}")
        return

    scheduler = BackgroundScheduler(timezone="Asia/Shanghai")

    def _backup_job() -> None:
        try:
            run_database_backup()
        except Exception as exc:
            logger.error(f"[DB备份] 定时任务回调异常: {exc}")

    scheduler.add_job(_backup_job, trigger=trigger, id="db_backup")
    scheduler.start()
    _scheduler = scheduler

    async with async_session_factory() as session:
        svc = AppSettingService()
        backup_dir = await svc.get_backup_dir(session)

    logger.info(f"[DB备份] 定时任务已启动 (cron='{cron_expr}', backup_dir='{backup_dir}')")


def stop_db_backup_scheduler() -> None:
    """Stop the database backup scheduler."""
    global _scheduler

    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("[DB备份] 定时任务已停止")
