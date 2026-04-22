"""Statistics API routes."""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

statistics_router = APIRouter()


def _parse_comma_list(value: Optional[str]) -> Optional[list[str]]:
    """Parse a comma-separated string into a list, or None if empty."""
    if not value:
        return None
    parts = [v.strip() for v in value.split(",") if v.strip()]
    return parts if parts else None


@statistics_router.get("")
async def get_statistics(
    startDate: int = Query(..., description="Start date in milliseconds"),
    endDate: int = Query(..., description="End date in milliseconds"),
    repositoryIds: Optional[str] = Query(None, description="Comma-separated repository IDs"),
    authorEmails: Optional[str] = Query(None, description="Comma-separated author emails"),
    db: AsyncSession = Depends(get_db),
):
    """Get aggregated statistics for the given date range."""
    from app.services.commit_service import CommitService

    svc = CommitService()

    repo_ids = _parse_comma_list(repositoryIds)
    author_emails = _parse_comma_list(authorEmails)

    result = await svc.get_statistics(
        db,
        start_date=startDate,
        end_date=endDate,
        repository_ids=repo_ids,
        author_emails=author_emails,
    )

    return result
