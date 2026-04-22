"""Statistics API routes."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.utils import parse_comma_list
from app.core.database import get_db

statistics_router = APIRouter()


@statistics_router.get("")
async def get_statistics(
    startDate: int = Query(..., description="Start date in milliseconds"),
    endDate: int = Query(..., description="End date in milliseconds"),
    repositoryIds: str | None = Query(None, description="Comma-separated repository IDs"),
    authorEmails: str | None = Query(None, description="Comma-separated author emails"),
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated statistics for the given date range."""
    from app.services.commit_service import CommitService

    svc = CommitService()

    repo_ids = parse_comma_list(repositoryIds)
    author_emails = parse_comma_list(authorEmails)

    result = await svc.get_statistics(
        db,
        start_date=startDate,
        end_date=endDate,
        repository_ids=repo_ids,
        author_emails=author_emails,
    )

    return result
