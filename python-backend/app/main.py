"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from app.core.config import settings
from app.core.database import async_session_factory


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler: startup and shutdown."""
    logger.info("[应用启动] 正在初始化...")

    async with async_session_factory() as db:
        # Initialize default settings
        try:
            from app.services.app_setting_service import AppSettingService
            svc = AppSettingService()
            await svc.init_default_settings(db)
            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.warning(f"[初始化] 应用设置初始化失败: {e}")

        # Initialize default data metrics config
        try:
            from app.services.data_metrics_config_service import DataMetricsConfigService
            svc = DataMetricsConfigService()
            await svc.init_default_config(db)
            await db.commit()
            logger.info("[初始化] 数据指标配置已就绪")
        except Exception as e:
            await db.rollback()
            logger.warning(f"[初始化] 数据指标配置初始化失败: {e}")

        # Log server start
        try:
            from app.services.log_service import LogService
            log_svc = LogService()
            await log_svc.create_server_log(
                db,
                type="start",
                message=f"服务器启动成功，运行在端口 {settings.PORT}",
            )
            await db.commit()
        except Exception:
            await db.rollback()

    # Start schedulers (they manage their own DB sessions)
    try:
        from app.jobs.scan_scheduler import start_scheduler
        await start_scheduler()
    except Exception as e:
        logger.warning(f"[初始化] 扫描调度器启动失败: {e}")

    try:
        from app.jobs.db_backup_scheduler import start_db_backup_scheduler
        await start_db_backup_scheduler()
    except Exception as e:
        logger.warning(f"[初始化] 数据库备份调度器启动失败: {e}")

    logger.info(f"[服务就绪] 服务器运行在端口 {settings.PORT}")

    yield

    # Shutdown
    logger.info("正在关闭服务器...")
    try:
        from app.jobs.db_backup_scheduler import stop_db_backup_scheduler
        stop_db_backup_scheduler()
    except Exception:
        pass

    try:
        async with async_session_factory() as db:
            from app.services.log_service import LogService
            log_svc = LogService()
            await log_svc.create_server_log(db, type="stop", message="服务器正在关闭")
            await db.commit()
    except Exception:
        pass


app = FastAPI(
    title="Coding History API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Route error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": str(exc)},
    )


# Health check
@app.get("/health")
async def health_check():
    return {"status": "ok"}


# Register API routes
from app.api.router import api_router  # noqa: E402
app.include_router(api_router, prefix="/api/v1")
