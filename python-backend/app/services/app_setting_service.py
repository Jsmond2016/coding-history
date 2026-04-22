"""App setting service – async SQLAlchemy port of AppSettingService.ts."""

from __future__ import annotations

import os
import re
import time
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_setting import AppSetting

_CRON_RE = re.compile(r"^(\S+\s+){4}\S+$")
_DISABLE_VALUES = {"", "false", "off", "0"}


class AppSettingService:
    """Key-value application settings stored in DB."""

    # ------------------------------------------------------------------
    # primitives
    # ------------------------------------------------------------------

    @staticmethod
    async def get_setting(db: AsyncSession, key: str) -> str | None:
        stmt = select(AppSetting).where(AppSetting.key == key)
        result = await db.execute(stmt)
        row = result.scalar_one_or_none()
        return row.value if row is not None else None

    @staticmethod
    async def set_setting(db: AsyncSession, key: str, value: str) -> None:
        now = int(time.time() * 1000)
        stmt = select(AppSetting).where(AppSetting.key == key)
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing is not None:
            existing.value = value
            existing.updated_at = now
        else:
            db.add(AppSetting(key=key, value=value, updated_at=now))
        await db.flush()

    # ------------------------------------------------------------------
    # backup_dir
    # ------------------------------------------------------------------

    @staticmethod
    def _default_backup_dir() -> str:
        from app.core.config import settings

        env_dir = settings.DB_BACKUP_DIR
        return env_dir.strip() if env_dir and env_dir.strip() else os.path.join(os.getcwd(), "db-backup")

    @staticmethod
    async def get_backup_dir(db: AsyncSession) -> str:
        db_value = await AppSettingService.get_setting(db, "backup_dir")
        if db_value and db_value.strip():
            return db_value.strip()
        return AppSettingService._default_backup_dir()

    @staticmethod
    async def set_backup_dir(db: AsyncSession, dir_path: str) -> dict:
        resolved = str(Path(dir_path).resolve())
        try:
            os.makedirs(resolved, exist_ok=True)
            test_file = os.path.join(resolved, ".write-test")
            with open(test_file, "w") as f:
                f.write("")
            os.remove(test_file)
        except Exception as exc:
            return {"success": False, "error": f"目录不可写: {exc}"}
        await AppSettingService.set_setting(db, "backup_dir", resolved)
        return {"success": True}

    # ------------------------------------------------------------------
    # backup_cron
    # ------------------------------------------------------------------

    _DEFAULT_BACKUP_CRON = "0 19 * * 5"

    @staticmethod
    async def get_backup_cron(db: AsyncSession) -> str | None:
        db_value = await AppSettingService.get_setting(db, "backup_cron")
        if db_value is not None:
            t = db_value.strip()
            if t in _DISABLE_VALUES:
                return None
            return t
        # fallback to env
        from app.core.config import settings

        env_val = settings.DB_BACKUP_CRON
        if env_val is None:
            return AppSettingService._DEFAULT_BACKUP_CRON
        t = env_val.strip()
        if t in _DISABLE_VALUES:
            return None
        return t

    @staticmethod
    async def set_backup_cron(db: AsyncSession, cron_expr: str) -> dict:
        t = cron_expr.strip()
        if t in _DISABLE_VALUES:
            await AppSettingService.set_setting(db, "backup_cron", t)
            return {"success": True}
        if not _CRON_RE.match(t):
            return {
                "success": False,
                "error": "Cron 表达式格式无效，请使用标准 5 段格式（分 时 日 月 周）",
            }
        await AppSettingService.set_setting(db, "backup_cron", t)
        return {"success": True}

    # ------------------------------------------------------------------
    # init
    # ------------------------------------------------------------------

    @staticmethod
    async def init_default_settings(db: AsyncSession) -> None:
        try:
            existing_dir = await AppSettingService.get_setting(db, "backup_dir")
            if existing_dir is None:
                db.add(
                    AppSetting(
                        key="backup_dir",
                        value=AppSettingService._default_backup_dir(),
                        updated_at=int(time.time() * 1000),
                    )
                )
                await db.flush()

            existing_cron = await AppSettingService.get_setting(db, "backup_cron")
            if existing_cron is None:
                db.add(
                    AppSetting(
                        key="backup_cron",
                        value=AppSettingService._DEFAULT_BACKUP_CRON,
                        updated_at=int(time.time() * 1000),
                    )
                )
                await db.flush()
        except Exception:
            pass  # swallow – matches TS behaviour of logging and continuing
