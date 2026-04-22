"""Task API routes: CRUD for scan tasks, trigger, enable/disable, batch sort."""

import asyncio

from fastapi import APIRouter, Depends, Query
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

tasks_router = APIRouter()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@tasks_router.get("")
async def list_tasks(db: AsyncSession = Depends(get_db)):
    """List all tasks. Syncs default repository tasks first."""
    from app.services.scan_task_service import ScanTaskService

    svc = ScanTaskService()
    await svc.sync_default_repository_tasks(db)
    tasks = await svc.get_all_tasks(db)
    return tasks


@tasks_router.get("/default")
async def get_default_tasks(db: AsyncSession = Depends(get_db)):
    """Get default task templates."""
    from app.services.scan_task_service import ScanTaskService

    svc = ScanTaskService()
    return await svc.get_default_tasks(db)


@tasks_router.get("/{task_id}")
async def get_task(task_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single task by ID."""
    from app.services.scan_task_service import ScanTaskService

    svc = ScanTaskService()
    task = await svc.get_task_by_id(db, task_id)
    if task is None:
        return {"error": "Task not found"}
    return task


@tasks_router.post("")
async def create_task(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Create a new scan task.

    Body: { name, description?, taskType, scanRangeType, startDate?, endDate?,
             cronExpression?, repositoryIds?, enabled? }
    """
    from app.services.scan_task_service import ScanTaskService

    name = body.get("name")
    task_type = body.get("taskType")
    scan_range_type = body.get("scanRangeType")

    if not name or not task_type or not scan_range_type:
        return {"error": "name, taskType, and scanRangeType are required"}

    # Validate custom range requires dates
    if scan_range_type == "custom":
        if not body.get("startDate") or not body.get("endDate"):
            return {"error": "Custom scan range requires startDate and endDate"}

    # Validate scheduled tasks require cron
    if task_type == "scheduled" and not body.get("cronExpression"):
        return {"error": "Scheduled tasks require a cronExpression"}

    svc = ScanTaskService()
    task = await svc.create_task(db, params=body)

    # Restart scheduler for enabled scheduled tasks
    if task.get("enabled") and task.get("taskType") == "scheduled":
        try:
            from app.jobs.scan_scheduler import restart_scheduler
            await restart_scheduler()
            logger.info(f"[Create task] scheduled task {name} created, scheduler restarted")
        except Exception as exc:
            logger.warning(f"[Create task] scheduler restart failed: {exc}")

    return task


@tasks_router.put("/{task_id}")
async def update_task(
    task_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Update an existing task."""
    from app.services.scan_task_service import ScanTaskService

    svc = ScanTaskService()

    # Validate custom range if applicable
    existing = await svc.get_task_by_id(db, task_id)
    if existing is None:
        return {"error": "Task not found"}

    effective_scan_range = body.get("scanRangeType", existing.get("scanRangeType"))
    if effective_scan_range == "custom":
        effective_start = body.get("startDate", existing.get("startDate"))
        effective_end = body.get("endDate", existing.get("endDate"))
        if not effective_start or not effective_end:
            return {"error": "Custom scan range requires startDate and endDate"}

    effective_task_type = body.get("taskType", existing.get("taskType"))
    if effective_task_type == "scheduled":
        effective_cron = body.get("cronExpression", existing.get("cronExpression"))
        if not effective_cron:
            return {"error": "Scheduled tasks require a cronExpression"}

    task = await svc.update_task(db, id=task_id, params=body)

    # Restart scheduler for scheduled tasks
    if task.get("taskType") == "scheduled":
        try:
            from app.jobs.scan_scheduler import restart_scheduler
            await restart_scheduler()
            logger.info(f"[Update task] task {task.get('name')} updated, scheduler restarted")
        except Exception as exc:
            logger.warning(f"[Update task] scheduler restart failed: {exc}")

    return task


@tasks_router.delete("/{task_id}")
async def delete_task(task_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a task by ID."""
    from app.services.scan_task_service import ScanTaskService

    svc = ScanTaskService()
    task = await svc.get_task_by_id(db, task_id)

    await svc.delete_task(db, task_id)

    # Restart scheduler if it was a scheduled task
    if task and task.get("taskType") == "scheduled":
        try:
            from app.jobs.scan_scheduler import restart_scheduler
            await restart_scheduler()
            logger.info(f"[Delete task] scheduled task deleted, scheduler restarted")
        except Exception as exc:
            logger.warning(f"[Delete task] scheduler restart failed: {exc}")

    return {"message": "Task deleted successfully"}


@tasks_router.post("/{task_id}/enable")
async def enable_task(task_id: int, db: AsyncSession = Depends(get_db)):
    """Enable a task."""
    from app.services.scan_task_service import ScanTaskService

    svc = ScanTaskService()
    task = await svc.enable_task(db, task_id)

    if task.get("taskType") == "scheduled":
        try:
            from app.jobs.scan_scheduler import restart_scheduler
            await restart_scheduler()
            logger.info(f"[Enable task] task {task.get('name')} enabled, scheduler restarted")
        except Exception as exc:
            logger.warning(f"[Enable task] scheduler restart failed: {exc}")

    return task


@tasks_router.post("/{task_id}/disable")
async def disable_task(task_id: int, db: AsyncSession = Depends(get_db)):
    """Disable a task."""
    from app.services.scan_task_service import ScanTaskService

    svc = ScanTaskService()
    task = await svc.disable_task(db, task_id)

    if task.get("taskType") == "scheduled":
        try:
            from app.jobs.scan_scheduler import restart_scheduler
            await restart_scheduler()
            logger.info(f"[Disable task] task {task.get('name')} disabled, scheduler restarted")
        except Exception as exc:
            logger.warning(f"[Disable task] scheduler restart failed: {exc}")

    return task


@tasks_router.post("/{task_id}/trigger")
async def trigger_task(
    task_id: int,
    body: dict = None,
    db: AsyncSession = Depends(get_db),
):
    """Trigger a task execution asynchronously.

    Body: { repositoryIds?: list[str] }
    """
    from app.services.scan_task_service import ScanTaskService
    from app.services.scan_task_executor import execute_scan_task

    svc = ScanTaskService()
    task = await svc.get_task_by_id(db, task_id)

    if task is None:
        return {"error": "Task not found"}

    # If repositoryIds provided, override task's list
    task_dict = dict(task)
    if body and body.get("repositoryIds"):
        task_dict["repositoryIds"] = body["repositoryIds"]

    # Fire-and-forget execution (uses its own db session)
    async def _run():
        try:
            from app.core.database import async_session_factory
            async with async_session_factory() as bg_db:
                await execute_scan_task(bg_db, task_dict, task_id=task_id)
                await bg_db.commit()
            logger.info(f"[Trigger task] task {task.get('name')} execution completed")
        except Exception as exc:
            logger.error(f"[Trigger task] task {task.get('name')} execution failed: {exc}")

    asyncio.create_task(_run())

    return {
        "message": "Task triggered successfully",
        "taskId": task_id,
        "taskName": task.get("name"),
    }


@tasks_router.post("/batch-sort")
async def batch_sort(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Batch update task sort order.

    Body: { sortOrders: [{ id: int, sortOrder: int }] }
    """
    from app.services.scan_task_service import ScanTaskService

    sort_orders = body.get("sortOrders")
    if not sort_orders or not isinstance(sort_orders, list):
        return {"error": "sortOrders must be a non-empty array"}

    svc = ScanTaskService()
    await svc.batch_update_sort_order(db, sort_orders)

    logger.info(f"[Batch sort] updated sort order for {len(sort_orders)} tasks")
    return {"message": "Sort order updated successfully", "count": len(sort_orders)}
