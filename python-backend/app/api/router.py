"""Main API router that aggregates all sub-routers."""

from fastapi import APIRouter

from app.api.repositories import repositories_router
from app.api.commits import commits_router
from app.api.statistics import statistics_router
from app.api.logs import logs_router
from app.api.tasks import tasks_router
from app.api.config import config_router

api_router = APIRouter()

api_router.include_router(repositories_router, prefix="/repositories", tags=["repositories"])
api_router.include_router(commits_router, prefix="/commits", tags=["commits"])
api_router.include_router(statistics_router, prefix="/statistics", tags=["statistics"])
api_router.include_router(logs_router, prefix="/logs", tags=["logs"])
api_router.include_router(tasks_router, prefix="/tasks", tags=["tasks"])
api_router.include_router(config_router, prefix="/config", tags=["config"])
