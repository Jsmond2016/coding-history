"""Log API routes: server logs, request logs, scheduled task logs, cleanup."""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

logs_router = APIRouter()


@logs_router.get("/server")
async def get_server_logs(
    startTime: Optional[int] = Query(None),
    endTime: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=200),
    type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Query server logs."""
    from app.services.log_service import LogService

    svc = LogService()
    result = await svc.get_server_logs(
        db,
        start_time=startTime,
        end_time=endTime,
        page=page,
        page_size=pageSize,
        type=type,
    )
    return result


@logs_router.get("/request")
async def get_request_logs(
    startTime: Optional[int] = Query(None),
    endTime: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=200),
    statusCode: Optional[int] = Query(None),
    module: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Query request logs."""
    from app.services.log_service import LogService

    svc = LogService()
    result = await svc.get_request_logs(
        db,
        start_time=startTime,
        end_time=endTime,
        page=page,
        page_size=pageSize,
        status_code=statusCode,
        module=module,
    )
    return result


@logs_router.get("/scheduled-task")
async def get_scheduled_task_logs(
    startTime: Optional[int] = Query(None),
    endTime: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=200),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Query scheduled task logs."""
    from app.services.log_service import LogService

    svc = LogService()
    result = await svc.get_scheduled_task_logs(
        db,
        start_time=startTime,
        end_time=endTime,
        page=page,
        page_size=pageSize,
        status=status,
    )
    return result


@logs_router.post("/clean")
async def clean_old_logs(
    body: dict = None,
    db: AsyncSession = Depends(get_db),
):
    """Clean logs older than N days."""
    from app.services.log_service import LogService

    days = 30
    if body:
        days = body.get("days", 30)

    svc = LogService()
    deleted = await svc.clean_old_logs(db, days=days)

    return {
        "message": f"Cleaned {deleted} old log entries",
        "deleted": deleted,
    }
