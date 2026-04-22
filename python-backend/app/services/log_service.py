"""Log service – async SQLAlchemy port of LogService.ts."""

from __future__ import annotations

import json
import time
from typing import Any

from sqlalchemy import delete as sa_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.request_log import RequestLog
from app.models.scheduled_task_log import ScheduledTaskLog
from app.models.server_log import ServerLog


class LogService:
    """Create / query / clean logs for server, request, and scheduled tasks."""

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------

    @staticmethod
    async def create_server_log(
        db: AsyncSession,
        type: str,
        message: str,
        error_stack: str | None = None,
    ) -> None:
        now = int(time.time() * 1000)
        row = ServerLog(
            type=type,
            message=message,
            error_stack=error_stack,
            timestamp=now,
            created_at=now,
        )
        db.add(row)
        await db.flush()

    @staticmethod
    async def create_request_log(
        db: AsyncSession,
        method: str,
        url: str,
        status_code: int,
        duration: int,
        route_name: str | None = None,
        module: str | None = None,
        request_body: str | None = None,
        response_body: str | None = None,
    ) -> None:
        now = int(time.time() * 1000)
        row = RequestLog(
            method=method,
            url=url,
            route_name=route_name,
            module=module,
            status_code=status_code,
            request_body=request_body,
            response_body=response_body,
            duration=duration,
            timestamp=now,
            created_at=now,
        )
        db.add(row)
        await db.flush()

    @staticmethod
    async def create_scheduled_task_log(
        db: AsyncSession,
        task_name: str,
        start_time: int,
        status: str,
        repositories: list[str],
        total_commits: int = 0,
        cron_expression: str | None = None,
        end_time: int | None = None,
        error_message: str | None = None,
        task_id: int | None = None,
    ) -> None:
        now = int(time.time() * 1000)
        row = ScheduledTaskLog(
            task_name=task_name,
            cron_expression=cron_expression,
            start_time=start_time,
            end_time=end_time,
            status=status,
            repositories=json.dumps(repositories, ensure_ascii=False),
            total_commits=total_commits,
            error_message=error_message,
            task_id=task_id,
            created_at=now,
        )
        db.add(row)
        await db.flush()

    # ------------------------------------------------------------------
    # Query – Server Logs
    # ------------------------------------------------------------------

    @staticmethod
    async def get_server_logs(
        db: AsyncSession,
        start_time: int | None = None,
        end_time: int | None = None,
        page: int = 1,
        page_size: int = 20,
        type: str | None = None,
    ) -> dict[str, Any]:
        conditions = []
        if start_time is not None:
            conditions.append(ServerLog.timestamp >= start_time)
        if end_time is not None:
            conditions.append(ServerLog.timestamp <= end_time)
        if type is not None:
            conditions.append(ServerLog.type == type)

        where = None
        if conditions:
            from sqlalchemy import and_

            where = and_(*conditions)

        # total
        count_q = select(func.count()).select_from(ServerLog)
        if where is not None:
            count_q = count_q.where(where)
        total = (await db.execute(count_q)).scalar_one()

        # data
        data_q = select(ServerLog).order_by(ServerLog.timestamp.desc())
        if where is not None:
            data_q = data_q.where(where)
        data_q = data_q.offset((page - 1) * page_size).limit(page_size)
        rows = (await db.execute(data_q)).scalars().all()

        return {
            "data": [
                {
                    "id": r.id,
                    "type": r.type,
                    "message": r.message,
                    "errorStack": r.error_stack,
                    "timestamp": int(r.timestamp),
                    "createdAt": int(r.created_at),
                }
                for r in rows
            ],
            "total": total,
            "page": page,
            "pageSize": page_size,
        }

    # ------------------------------------------------------------------
    # Query – Request Logs
    # ------------------------------------------------------------------

    @staticmethod
    async def get_request_logs(
        db: AsyncSession,
        start_time: int | None = None,
        end_time: int | None = None,
        page: int = 1,
        page_size: int = 20,
        status_code: int | None = None,
        module: str | None = None,
    ) -> dict[str, Any]:
        conditions = []
        if start_time is not None:
            conditions.append(RequestLog.timestamp >= start_time)
        if end_time is not None:
            conditions.append(RequestLog.timestamp <= end_time)
        if status_code is not None:
            conditions.append(RequestLog.status_code == status_code)
        if module is not None:
            conditions.append(RequestLog.module == module)

        where = None
        if conditions:
            from sqlalchemy import and_

            where = and_(*conditions)

        count_q = select(func.count()).select_from(RequestLog)
        if where is not None:
            count_q = count_q.where(where)
        total = (await db.execute(count_q)).scalar_one()

        data_q = select(RequestLog).order_by(RequestLog.timestamp.desc())
        if where is not None:
            data_q = data_q.where(where)
        data_q = data_q.offset((page - 1) * page_size).limit(page_size)
        rows = (await db.execute(data_q)).scalars().all()

        return {
            "data": [
                {
                    "id": r.id,
                    "method": r.method,
                    "url": r.url,
                    "routeName": r.route_name,
                    "module": r.module,
                    "statusCode": r.status_code,
                    "requestBody": r.request_body,
                    "responseBody": r.response_body,
                    "duration": r.duration,
                    "timestamp": int(r.timestamp),
                    "createdAt": int(r.created_at),
                }
                for r in rows
            ],
            "total": total,
            "page": page,
            "pageSize": page_size,
        }

    # ------------------------------------------------------------------
    # Query – Scheduled Task Logs
    # ------------------------------------------------------------------

    @staticmethod
    async def get_scheduled_task_logs(
        db: AsyncSession,
        start_time: int | None = None,
        end_time: int | None = None,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None,
    ) -> dict[str, Any]:
        conditions = []
        if start_time is not None:
            conditions.append(ScheduledTaskLog.start_time >= start_time)
        if end_time is not None:
            conditions.append(ScheduledTaskLog.start_time <= end_time)
        if status is not None:
            conditions.append(ScheduledTaskLog.status == status)

        where = None
        if conditions:
            from sqlalchemy import and_

            where = and_(*conditions)

        count_q = select(func.count()).select_from(ScheduledTaskLog)
        if where is not None:
            count_q = count_q.where(where)
        total = (await db.execute(count_q)).scalar_one()

        data_q = select(ScheduledTaskLog).order_by(ScheduledTaskLog.start_time.desc())
        if where is not None:
            data_q = data_q.where(where)
        data_q = data_q.offset((page - 1) * page_size).limit(page_size)
        rows = (await db.execute(data_q)).scalars().all()

        return {
            "data": [
                {
                    "id": r.id,
                    "taskName": r.task_name,
                    "cronExpression": r.cron_expression,
                    "startTime": int(r.start_time),
                    "endTime": int(r.end_time) if r.end_time is not None else None,
                    "status": r.status,
                    "repositories": json.loads(r.repositories) if r.repositories else [],
                    "totalCommits": r.total_commits,
                    "errorMessage": r.error_message,
                    "createdAt": int(r.created_at),
                }
                for r in rows
            ],
            "total": total,
            "page": page,
            "pageSize": page_size,
        }

    # ------------------------------------------------------------------
    # Clean
    # ------------------------------------------------------------------

    @staticmethod
    async def clean_old_logs(db: AsyncSession, days: int = 30) -> dict[str, int]:
        cutoff = int(time.time() * 1000) - days * 24 * 60 * 60 * 1000

        r1 = await db.execute(sa_delete(ServerLog).where(ServerLog.timestamp < cutoff))
        r2 = await db.execute(sa_delete(RequestLog).where(RequestLog.timestamp < cutoff))
        r3 = await db.execute(
            sa_delete(ScheduledTaskLog).where(ScheduledTaskLog.start_time < cutoff)
        )
        await db.flush()

        deleted = r1.rowcount + r2.rowcount + r3.rowcount  # type: ignore[union-attr]
        return {"deleted": deleted}
