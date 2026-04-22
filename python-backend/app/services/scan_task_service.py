"""Scan task service – async SQLAlchemy port of ScanTaskService.ts."""

from __future__ import annotations

import json
import time
from typing import Any

from sqlalchemy import and_, delete as sa_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan_task import ScanTask as ScanTaskModel
from app.services.config_service import ConfigService


def map_to_scan_task(orm_obj: ScanTaskModel) -> dict[str, Any]:
    """Convert ORM object to camelCase dict (mirrors TS mapToScanTask)."""
    return {
        "id": orm_obj.id,
        "name": orm_obj.name,
        "description": orm_obj.description,
        "taskType": orm_obj.task_type,
        "scanRangeType": orm_obj.scan_range_type,
        "startDate": int(orm_obj.start_date) if orm_obj.start_date is not None else None,
        "endDate": int(orm_obj.end_date) if orm_obj.end_date is not None else None,
        "cronExpression": orm_obj.cron_expression,
        "repositoryIds": json.loads(orm_obj.repository_ids) if orm_obj.repository_ids else None,
        "enabled": orm_obj.enabled,
        "lastExecuteTime": int(orm_obj.last_execute_time) if orm_obj.last_execute_time is not None else None,
        "sortOrder": orm_obj.sort_order,
        "createdAt": int(orm_obj.created_at),
        "updatedAt": int(orm_obj.updated_at),
    }


class ScanTaskService:
    """CRUD + helpers for ScanTask rows."""

    # ------------------------------------------------------------------
    # create
    # ------------------------------------------------------------------

    @staticmethod
    async def create_task(db: AsyncSession, params: dict[str, Any]) -> dict[str, Any]:
        now = int(time.time() * 1000)
        repo_ids = params.get("repositoryIds")
        row = ScanTaskModel(
            name=params["name"],
            description=params.get("description"),
            task_type=params["taskType"],
            scan_range_type=params["scanRangeType"],
            start_date=params.get("startDate"),
            end_date=params.get("endDate"),
            cron_expression=params.get("cronExpression"),
            repository_ids=json.dumps(repo_ids, ensure_ascii=False) if repo_ids else None,
            enabled=params.get("enabled", True),
            sort_order=0,
            created_at=now,
            updated_at=now,
        )
        db.add(row)
        await db.flush()
        return map_to_scan_task(row)

    # ------------------------------------------------------------------
    # read
    # ------------------------------------------------------------------

    @staticmethod
    async def get_all_tasks(db: AsyncSession) -> list[dict[str, Any]]:
        stmt = select(ScanTaskModel).order_by(
            ScanTaskModel.sort_order.asc(),
            ScanTaskModel.created_at.desc(),
        )
        rows = (await db.execute(stmt)).scalars().all()
        return [map_to_scan_task(r) for r in rows]

    @staticmethod
    async def get_task_by_id(db: AsyncSession, task_id: int) -> dict[str, Any] | None:
        stmt = select(ScanTaskModel).where(ScanTaskModel.id == task_id)
        row = (await db.execute(stmt)).scalar_one_or_none()
        if row is None:
            return None
        return map_to_scan_task(row)

    # ------------------------------------------------------------------
    # update
    # ------------------------------------------------------------------

    @staticmethod
    async def update_task(db: AsyncSession, task_id: int, params: dict[str, Any]) -> dict[str, Any]:
        now = int(time.time() * 1000)
        stmt = select(ScanTaskModel).where(ScanTaskModel.id == task_id)
        row = (await db.execute(stmt)).scalar_one_or_none()
        if row is None:
            raise ValueError(f"ScanTask {task_id} not found")

        field_map = {
            "name": "name",
            "description": "description",
            "taskType": "task_type",
            "scanRangeType": "scan_range_type",
            "cronExpression": "cron_expression",
            "enabled": "enabled",
        }
        for api_key, col_key in field_map.items():
            if api_key in params:
                setattr(row, col_key, params[api_key])

        if "startDate" in params:
            row.start_date = params["startDate"]
        if "endDate" in params:
            row.end_date = params["endDate"]
        if "repositoryIds" in params:
            ids = params["repositoryIds"]
            row.repository_ids = json.dumps(ids, ensure_ascii=False) if ids else None

        row.updated_at = now
        await db.flush()
        return map_to_scan_task(row)

    # ------------------------------------------------------------------
    # delete
    # ------------------------------------------------------------------

    @staticmethod
    async def delete_task(db: AsyncSession, task_id: int) -> None:
        stmt = sa_delete(ScanTaskModel).where(ScanTaskModel.id == task_id)
        await db.execute(stmt)
        await db.flush()

    # ------------------------------------------------------------------
    # enable / disable
    # ------------------------------------------------------------------

    @staticmethod
    async def enable_task(db: AsyncSession, task_id: int) -> dict[str, Any]:
        return await ScanTaskService.update_task(db, task_id, {"enabled": True})

    @staticmethod
    async def disable_task(db: AsyncSession, task_id: int) -> dict[str, Any]:
        return await ScanTaskService.update_task(db, task_id, {"enabled": False})

    # ------------------------------------------------------------------
    # last execute time
    # ------------------------------------------------------------------

    @staticmethod
    async def update_last_execute_time(db: AsyncSession, task_id: int, execute_time: int) -> None:
        now = int(time.time() * 1000)
        stmt = select(ScanTaskModel).where(ScanTaskModel.id == task_id)
        row = (await db.execute(stmt)).scalar_one_or_none()
        if row is None:
            return
        row.last_execute_time = execute_time
        row.updated_at = now
        await db.flush()

    # ------------------------------------------------------------------
    # enabled scheduled tasks
    # ------------------------------------------------------------------

    @staticmethod
    async def get_enabled_scheduled_tasks(db: AsyncSession) -> list[dict[str, Any]]:
        stmt = (
            select(ScanTaskModel)
            .where(
                ScanTaskModel.task_type == "scheduled",
                ScanTaskModel.enabled == True,  # noqa: E712
            )
            .order_by(ScanTaskModel.created_at.asc())
        )
        rows = (await db.execute(stmt)).scalars().all()
        return [map_to_scan_task(r) for r in rows]

    # ------------------------------------------------------------------
    # default tasks
    # ------------------------------------------------------------------

    @staticmethod
    async def get_default_tasks(db: AsyncSession) -> list[dict[str, Any]]:
        config_svc = ConfigService()
        repositories = await config_svc.get_enabled_repos(db)

        repo_tasks = [
            {
                "name": repo["name"],
                "description": f"手动同步仓库 {repo['name']} 的提交记录",
                "taskType": "manual",
                "scanRangeType": "2weeks",
                "repositoryIds": [repo["id"]],
            }
            for repo in repositories
        ]

        common_tasks: list[dict[str, Any]] = [
            {
                "name": "扫描近2周代码提交数据",
                "description": "扫描最近2周的代码提交记录",
                "taskType": "manual",
                "scanRangeType": "2weeks",
            },
            {
                "name": "扫描近1个月代码提交数据",
                "description": "扫描最近1个月的代码提交记录",
                "taskType": "manual",
                "scanRangeType": "1month",
            },
            {
                "name": "扫描近3个月代码提交数据",
                "description": "扫描最近3个月的代码提交记录",
                "taskType": "manual",
                "scanRangeType": "3months",
            },
            {
                "name": "扫描近6个月代码提交数据",
                "description": "扫描最近6个月的代码提交记录",
                "taskType": "manual",
                "scanRangeType": "6months",
            },
            {
                "name": "自定义时间范围扫描",
                "description": "自定义指定时间范围扫描，最大支持6个月跨度",
                "taskType": "manual",
                "scanRangeType": "custom",
            },
        ]

        return repo_tasks + common_tasks

    # ------------------------------------------------------------------
    # sync default repository tasks
    # ------------------------------------------------------------------

    @staticmethod
    async def sync_default_repository_tasks(db: AsyncSession) -> None:
        config_svc = ConfigService()
        repositories = await config_svc.get_enabled_repos(db)

        for repo in repositories:
            target_json = json.dumps([repo["id"]], ensure_ascii=False)
            stmt = select(ScanTaskModel).where(
                ScanTaskModel.task_type == "manual",
                ScanTaskModel.repository_ids == target_json,
            )
            existing = (await db.execute(stmt)).scalar_one_or_none()

            now = int(time.time() * 1000)
            if existing is None:
                db.add(
                    ScanTaskModel(
                        name=repo["name"],
                        description=f"手动同步仓库 {repo['name']} 的提交记录",
                        task_type="manual",
                        scan_range_type="2weeks",
                        repository_ids=target_json,
                        enabled=True,
                        sort_order=0,
                        created_at=now,
                        updated_at=now,
                    )
                )
                await db.flush()
            else:
                existing.name = repo["name"]
                existing.description = f"手动同步仓库 {repo['name']} 的提交记录"
                existing.updated_at = now
                await db.flush()

        # clean up tasks for repos that no longer exist / are disabled
        all_tasks_stmt = select(ScanTaskModel).where(
            ScanTaskModel.task_type == "manual",
            ScanTaskModel.repository_ids.isnot(None),
        )
        all_tasks = (await db.execute(all_tasks_stmt)).scalars().all()
        active_repo_ids = {r["id"] for r in repositories}

        for task in all_tasks:
            try:
                ids = json.loads(task.repository_ids)
            except (json.JSONDecodeError, TypeError):
                continue
            if len(ids) == 1 and ids[0] not in active_repo_ids:
                await db.execute(sa_delete(ScanTaskModel).where(ScanTaskModel.id == task.id))
        await db.flush()

    # ------------------------------------------------------------------
    # batch sort order
    # ------------------------------------------------------------------

    @staticmethod
    async def batch_update_sort_order(
        db: AsyncSession, sort_orders: list[dict[str, int]]
    ) -> None:
        now = int(time.time() * 1000)
        for item in sort_orders:
            stmt = select(ScanTaskModel).where(ScanTaskModel.id == item["id"])
            row = (await db.execute(stmt)).scalar_one_or_none()
            if row is not None:
                row.sort_order = item["sortOrder"]
                row.updated_at = now
        await db.flush()
