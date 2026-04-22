"""Repository API routes: list repos, authors, trigger scan, scan status."""

import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, Query
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

repositories_router = APIRouter()

# ---------------------------------------------------------------------------
# In-memory scan status (mirrors the Node.js implementation)
# ---------------------------------------------------------------------------
SCAN_STALE_MS = 6 * 60 * 1000  # 6 minutes

_scan_status: dict = {
    "finished": 0,  # 0=not started, 1=scanning, 2=done
    "scannedCount": 0,
    "error": None,
    "startedAt": None,
}


# ---------------------------------------------------------------------------
# Background scan coroutine
# ---------------------------------------------------------------------------

async def _scan_repositories_date_range(
    start_ms: int,
    end_ms: int,
    repository_ids: Optional[list[str]] = None,
) -> int:
    """Scan enabled repos within the given date range and persist commits.

    Uses its own database session since this runs in a background task.
    """
    import time as _time
    from datetime import datetime

    from app.core.database import async_session_factory
    from app.services.config_service import ConfigService
    from app.services.commit_service import CommitService
    from app.services.repository_service import RepositoryService
    from app.services.git_scan_service import GitScanService

    scanned_count = 0

    if start_ms >= end_ms:
        raise ValueError("Start date must be earlier than end date")

    from_date = datetime.fromtimestamp(start_ms / 1000)
    to_date = datetime.fromtimestamp(end_ms / 1000)

    logger.info(f"[Manual scan] date range {from_date.isoformat()} ~ {to_date.isoformat()}")

    async with async_session_factory() as db:
        config_svc = ConfigService()
        commit_svc = CommitService()
        repo_svc = RepositoryService()

        all_repos = await config_svc.get_enabled_repos(db)
        if repository_ids:
            repos_to_scan = [r for r in all_repos if r["id"] in repository_ids]
        else:
            repos_to_scan = all_repos

        for repo in repos_to_scan:
            try:
                repo_id = repo["id"]
                repo_name = repo["name"]
                repo_path = repo["path"]
                logger.info(f"[Manual scan] repo: {repo_name}, path: {repo_path}")

                author_emails = await config_svc.get_author_emails_by_repo_id(db, repo_id)
                if not author_emails:
                    logger.warning(f"[Manual scan] skipping {repo_name}: no authors configured")
                    continue

                scanner = GitScanService(repo_path)
                commits = await scanner.scan_repository_flat(
                    from_date=from_date,
                    to_date=to_date,
                    author_emails=author_emails,
                )

                logger.info(f"[Manual scan] {repo_name}: {len(commits)} commits in range")

                if commits:
                    commit_dicts = [c.to_dict() for c in commits]
                    await commit_svc.batch_insert_commits(db, repo_id, commit_dicts)

                    result = await commit_svc.get_commits(
                        db,
                        start_date=0,
                        end_date=int(_time.time() * 1000),
                        repository_ids=[repo_id],
                        author_emails=None,
                        page=1,
                        page_size=1,
                    )

                    await repo_svc.update_repo_scan_info(
                        db,
                        repo_id=repo_id,
                        last_scan_time=int(_time.time() * 1000),
                        total_commits=result["total"],
                    )
                    scanned_count += 1

            except Exception as exc:
                logger.error(f"[Manual scan failed] {repo_name}: {exc}")

        await db.commit()

    return scanned_count


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@repositories_router.get("")
async def list_repositories(db: AsyncSession = Depends(get_db)):
    """List all repositories."""
    from app.services.repository_service import RepositoryService

    svc = RepositoryService()
    repos = await svc.get_all_repos(db)
    return repos


@repositories_router.get("/authors")
async def list_authors(db: AsyncSession = Depends(get_db)):
    """List all unique author emails across all repos."""
    from app.services.config_service import ConfigService

    svc = ConfigService()
    emails = await svc.get_all_author_emails(db)
    unique = list(dict.fromkeys(emails))  # deduplicate preserving order
    return [{"email": e, "name": e.split("@")[0]} for e in unique]


@repositories_router.get("/{repo_id}")
async def get_repository(repo_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single repository by ID."""
    from app.services.repository_service import RepositoryService

    svc = RepositoryService()
    repo = await svc.get_repo_by_id(db, repo_id)
    if repo is None:
        return {"error": "Repository not found"}
    return repo


@repositories_router.post("/scan")
async def trigger_scan(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Trigger an asynchronous scan by date range.

    Body: { startDate: int, endDate: int, repositoryIds?: list[str] }
    """
    start_date = body.get("startDate")
    end_date = body.get("endDate")
    repository_ids = body.get("repositoryIds")

    if start_date is None or end_date is None:
        return {"error": "startDate and endDate are required"}

    # Validate date range
    if start_date >= end_date:
        return {"error": "startDate must be earlier than endDate"}

    max_span_ms = 186 * 24 * 60 * 60 * 1000
    if end_date - start_date > max_span_ms:
        return {"error": "Date range must not exceed 186 days"}

    # Check stale scan
    if _scan_status["finished"] == 1:
        started = _scan_status.get("startedAt")
        if started is not None:
            import time
            if time.time() * 1000 - started < SCAN_STALE_MS:
                return {
                    "finished": _scan_status["finished"],
                    "scannedCount": _scan_status["scannedCount"],
                }
        logger.warning("[Manual scan] stale scan detected, restarting")

    # Reset and start
    import time
    _scan_status.update({
        "finished": 1,
        "scannedCount": 0,
        "error": None,
        "startedAt": int(time.time() * 1000),
    })

    async def _run():
        try:
            count = await _scan_repositories_date_range(start_date, end_date, repository_ids)
            _scan_status.update({
                "finished": 2,
                "scannedCount": count,
                "startedAt": None,
            })
            logger.info(f"[Manual scan] completed, {count} repos had new commits")
        except Exception as exc:
            _scan_status.update({
                "finished": 2,
                "scannedCount": 0,
                "error": str(exc),
                "startedAt": None,
            })
            logger.error(f"[Manual scan] failed: {exc}")

    asyncio.create_task(_run())

    return {
        "finished": _scan_status["finished"],
        "scannedCount": _scan_status["scannedCount"],
    }


@repositories_router.get("/scan/status")
async def scan_status():
    """Return current scan status."""
    return {
        "finished": _scan_status["finished"],
        "scannedCount": _scan_status["scannedCount"],
        "error": _scan_status.get("error"),
        "startedAt": _scan_status.get("startedAt"),
        "staleThresholdMs": SCAN_STALE_MS,
    }
