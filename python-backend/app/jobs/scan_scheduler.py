"""Scan task scheduler using APScheduler.

Port of backend/src/jobs/scanScheduler.ts.
Loads enabled scheduled tasks from the database and registers cron jobs.
"""

import asyncio

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from loguru import logger

from app.core.database import async_session_factory

_scheduler: BackgroundScheduler | None = None


async def _execute_database_task(task_id: int) -> None:
    """Execute a scheduled scan task by ID."""
    from app.services.scan_task_service import ScanTaskService

    task_service = ScanTaskService()

    async with async_session_factory() as session:
        try:
            task = await task_service.get_task_by_id(session, task_id)

            if task is None:
                logger.error(f"[定时任务] 任务 ID {task_id} 不存在")
                return

            if not task.get("enabled", False):
                logger.debug(f"[定时任务] 任务 {task['name']} 已禁用，跳过执行")
                return

            logger.info(f"[定时任务] 开始执行数据库任务: {task['name']}")

            from app.services.scan_task_executor import execute_scan_task

            result = await execute_scan_task(session, task, task_id=task["id"])

            import time as _time
            await task_service.update_last_execute_time(session, task["id"], int(_time.time() * 1000))

            if result.get("success"):
                repo_count = len(result.get("scannedRepositories", []))
                logger.info(
                    f"[定时任务] 任务 {task['name']} 执行成功，"
                    f"扫描 {repo_count} 个仓库，新增 {result.get('totalCommits', 0)} 条提交"
                )
            else:
                logger.error(f"[定时任务] 任务 {task['name']} 执行失败: {result.get('errorMessage')}")

            await session.commit()
        except Exception:
            await session.rollback()
            raise


def _make_task_callback(task_id: int, task_name: str, loop: asyncio.AbstractEventLoop):
    """Return a synchronous callback suitable for APScheduler."""

    def callback() -> None:
        try:
            future = asyncio.run_coroutine_threadsafe(
                _execute_database_task(task_id),
                loop,
            )
            future.result(timeout=600)
        except Exception as exc:
            logger.error(f"[定时任务] 执行数据库任务 {task_name} 失败: {exc}")

    return callback


async def start_scheduler() -> None:
    """Start the scan-task scheduler."""
    global _scheduler

    if _scheduler is not None:
        logger.info("[定时任务] 检测到已有任务运行，先停止旧任务")
        stop_scheduler()

    from app.services.scan_task_service import ScanTaskService

    task_service = ScanTaskService()
    scheduler = BackgroundScheduler(timezone="Asia/Shanghai")

    async with async_session_factory() as session:
        db_tasks = await task_service.get_enabled_scheduled_tasks(session)

    if not db_tasks:
        logger.warning("[定时任务] 未找到任何定时任务，调度器未启动")
        return

    loop = asyncio.get_running_loop()
    registered = 0

    for task in db_tasks:
        cron_expr = task.get("cronExpression")
        task_name = task.get("name", "unknown")
        if not cron_expr:
            logger.warning(f"[定时任务] 任务 {task_name} 没有 Cron 表达式，跳过")
            continue

        try:
            trigger = CronTrigger.from_crontab(cron_expr, timezone="Asia/Shanghai")
        except (ValueError, TypeError) as exc:
            logger.error(f"[定时任务] 任务 {task_name} 的 Cron 表达式 '{cron_expr}' 无效: {exc}")
            continue

        callback = _make_task_callback(task["id"], task_name, loop)
        scheduler.add_job(callback, trigger=trigger, id=f"scan_task_{task['id']}")
        registered += 1
        logger.info(f'[定时任务] 数据库任务 "{task_name}" 调度已启动，Cron 表达式: {cron_expr}')

    if registered == 0:
        logger.warning("[定时任务] 没有有效的定时任务，调度器未启动")
        return

    scheduler.start()
    _scheduler = scheduler
    logger.info(f"[定时任务] 调度器已启动，共 {registered} 个定时任务")


def stop_scheduler() -> None:
    """Stop all scheduled scan tasks and clean up."""
    global _scheduler

    if _scheduler is None:
        logger.debug("[定时任务] 没有运行中的任务")
        return

    _scheduler.shutdown(wait=False)
    _scheduler = None
    logger.info("[定时任务] 所有调度器已停止")


async def restart_scheduler() -> None:
    """Restart the scheduler with fresh configuration from the database."""
    logger.info("[定时任务] 正在重启调度器...")
    stop_scheduler()
    await start_scheduler()
    logger.info("[定时任务] 调度器已使用新配置重启")
