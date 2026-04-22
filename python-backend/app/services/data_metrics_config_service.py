"""Data metrics config service – async SQLAlchemy port of DataMetricsConfigService.ts."""

from __future__ import annotations

import json
import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_metrics_config import DataMetricsConfig

# ---------------------------------------------------------------------------
# Default work-status configuration (mirrors workStatus.config.ts)
# ---------------------------------------------------------------------------

DEFAULT_THRESHOLDS: dict[str, int] = {
    "relaxed": 6,
    "normal": 10,
    "busy": 15,
    "superCrazy": 20,
}
DEFAULT_OVERTIME_HOUR: int = 19

WORK_STATUS_LABELS: dict[str, str] = {
    "relaxed": "轻松",
    "normal": "正常",
    "busy": "忙碌",
    "crazy": "疯狂",
    "overtime": "加班",
    "superCrazyOvertime": "超级疯狂加班",
}

WORK_STATUS_COLORS: dict[str, str] = {
    "relaxed": "green",
    "normal": "blue",
    "busy": "orange",
    "crazy": "red",
    "overtime": "red",
    "superCrazyOvertime": "magenta",
}

VALID_ANT_COLORS: set[str] = {
    "default",
    "processing",
    "success",
    "error",
    "warning",
    "magenta",
    "red",
    "volcano",
    "orange",
    "gold",
    "lime",
    "green",
    "cyan",
    "blue",
    "geekblue",
    "purple",
}


class DataMetricsConfigService:
    """Manage work-status thresholds / overtime-hour / labels / colors."""

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------

    @staticmethod
    def get_default_config() -> dict[str, Any]:
        now = int(time.time() * 1000)
        return {
            "id": 0,
            "thresholds": DEFAULT_THRESHOLDS.copy(),
            "overtimeHour": DEFAULT_OVERTIME_HOUR,
            "labels": WORK_STATUS_LABELS.copy(),
            "colors": WORK_STATUS_COLORS.copy(),
            "createdAt": now,
            "updatedAt": now,
        }

    # ------------------------------------------------------------------
    # read
    # ------------------------------------------------------------------

    @staticmethod
    async def get_config(db: AsyncSession) -> dict[str, Any]:
        stmt = (
            select(DataMetricsConfig)
            .order_by(DataMetricsConfig.created_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        row = result.scalar_one_or_none()
        if row is None:
            return DataMetricsConfigService.get_default_config()

        return {
            "id": row.id,
            "thresholds": json.loads(row.thresholds),
            "overtimeHour": row.overtime_hour,
            "labels": json.loads(row.labels),
            "colors": json.loads(row.colors),
            "createdAt": int(row.created_at),
            "updatedAt": int(row.updated_at),
        }

    # ------------------------------------------------------------------
    # write
    # ------------------------------------------------------------------

    @staticmethod
    async def update_config(
        db: AsyncSession,
        thresholds: dict[str, int],
        overtime_hour: int,
        labels: dict[str, str],
        colors: dict[str, str],
    ) -> dict[str, Any]:
        # validate thresholds increasing
        if (
            thresholds["relaxed"] >= thresholds["normal"]
            or thresholds["normal"] >= thresholds["busy"]
            or thresholds["busy"] >= thresholds["superCrazy"]
        ):
            raise ValueError("阈值必须递增：relaxed < normal < busy < superCrazy")

        # validate overtime hour
        if overtime_hour < 0 or overtime_hour > 23:
            raise ValueError("加班时间阈值必须在 0-23 之间")

        # validate colors
        for status, color in colors.items():
            if color not in VALID_ANT_COLORS:
                raise ValueError(f"无效的颜色值: {color}，状态: {status}")

        now = int(time.time() * 1000)

        stmt = (
            select(DataMetricsConfig)
            .order_by(DataMetricsConfig.created_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing is not None:
            existing.thresholds = json.dumps(thresholds, ensure_ascii=False)
            existing.overtime_hour = overtime_hour
            existing.labels = json.dumps(labels, ensure_ascii=False)
            existing.colors = json.dumps(colors, ensure_ascii=False)
            existing.updated_at = now
            await db.flush()
            return {
                "id": existing.id,
                "thresholds": thresholds,
                "overtimeHour": overtime_hour,
                "labels": labels,
                "colors": colors,
                "createdAt": int(existing.created_at),
                "updatedAt": int(existing.updated_at),
            }

        new_row = DataMetricsConfig(
            thresholds=json.dumps(thresholds, ensure_ascii=False),
            overtime_hour=overtime_hour,
            labels=json.dumps(labels, ensure_ascii=False),
            colors=json.dumps(colors, ensure_ascii=False),
            created_at=now,
            updated_at=now,
        )
        db.add(new_row)
        await db.flush()
        return {
            "id": new_row.id,
            "thresholds": thresholds,
            "overtimeHour": overtime_hour,
            "labels": labels,
            "colors": colors,
            "createdAt": int(new_row.created_at),
            "updatedAt": int(new_row.updated_at),
        }

    # ------------------------------------------------------------------
    # init
    # ------------------------------------------------------------------

    @staticmethod
    async def init_default_config(db: AsyncSession) -> None:
        stmt = select(DataMetricsConfig).limit(1)
        result = await db.execute(stmt)
        if result.scalar_one_or_none() is not None:
            return
        default = DataMetricsConfigService.get_default_config()
        await DataMetricsConfigService.update_config(
            db,
            thresholds=default["thresholds"],
            overtime_hour=default["overtimeHour"],
            labels=default["labels"],
            colors=default["colors"],
        )
