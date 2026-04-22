"""Commit API routes: query commits by date or paginated."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.utils import parse_comma_list
from app.core.database import get_db

commits_router = APIRouter()


@commits_router.get("/by-date")
async def get_commits_by_date(
    startDate: int = Query(..., description="Start date in milliseconds"),
    endDate: int = Query(..., description="End date in milliseconds"),
    repositoryIds: str | None = Query(None, description="Comma-separated repository IDs"),
    authorEmails: str | None = Query(None, description="Comma-separated author emails"),
    isOvertime: str | None = Query("false", description="Overtime flag 'true'/'false'"),
    db: AsyncSession = Depends(get_db),
):
    """Get commits grouped by date."""
    from app.services.commit_service import CommitService

    svc = CommitService()

    repo_ids = parse_comma_list(repositoryIds)
    author_emails = parse_comma_list(authorEmails)
    overtime_flag = isOvertime == "true" if isOvertime else False

    result = await svc.get_commits_by_date(
        db,
        start_date=startDate,
        end_date=endDate,
        repository_ids=repo_ids,
        author_emails=author_emails,
        is_overtime=overtime_flag,
    )

    return {
        "data": result.get("data", []),
        "total": result.get("total", 0),
    }


@commits_router.get("")
async def get_commits(
    startDate: int = Query(..., description="Start date in milliseconds"),
    endDate: int = Query(..., description="End date in milliseconds"),
    repositoryIds: str | None = Query(None, description="Comma-separated repository IDs"),
    authorEmails: str | None = Query(None, description="Comma-separated author emails"),
    page: int = Query(1, ge=1, description="Page number"),
    pageSize: int = Query(20, ge=1, le=200, description="Page size"),
    db: AsyncSession = Depends(get_db),
):
    """Get commits with pagination."""
    from app.services.commit_service import CommitService

    svc = CommitService()

    repo_ids = parse_comma_list(repositoryIds)
    author_emails = parse_comma_list(authorEmails)

    result = await svc.get_commits(
        db,
        start_date=startDate,
        end_date=endDate,
        repository_ids=repo_ids,
        author_emails=author_emails,
        page=page,
        page_size=pageSize,
    )

    return {
        "data": result.get("data", []),
        "total": result.get("total", 0),
        "page": page,
        "pageSize": pageSize,
    }
