"""Configuration API routes: repo config, authors, data metrics, backup."""

import json
import os
import time

from fastapi import APIRouter, Depends
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select

from app.core.database import get_db
from app.models import Author, Repository

config_router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_kebab_id(name: str) -> str:
    """Convert a directory name to a kebab-case ID."""
    import re
    result = name.replace(" ", "-")
    result = re.sub(r"[^a-zA-Z0-9-]", "", result)
    result = re.sub(r"-+", "-", result)
    result = result.lower().strip("-")
    return result or "repo"


def scan_directory_for_git_repos(root_path: str) -> list[dict]:
    """Scan filesystem for git repositories (max depth 10)."""
    resolved = os.path.abspath(root_path)
    if not os.path.isdir(resolved):
        return []

    results: list[dict] = []
    root_basename = os.path.basename(resolved)

    for dirpath, dirnames, filenames in os.walk(resolved):
        # Calculate depth relative to root
        depth = dirpath[len(resolved):].count(os.sep)

        if depth >= 10:
            dirnames.clear()
            continue

        if ".git" in dirnames:
            # Skip hidden directories
            parts = dirpath.split(os.sep)
            try:
                root_idx = parts.index(root_basename)
            except ValueError:
                root_idx = -1
            if any(p.startswith(".") for p in parts[root_idx + 1:]):
                dirnames.clear()
                continue

            name = os.path.basename(dirpath)
            repo_id = _to_kebab_id(name)
            results.append({"path": dirpath, "name": name, "id": repo_id})
            dirnames.clear()  # Don't recurse into git repos
        else:
            # Filter out hidden directories so os.walk skips them
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]

    return results


def _author_to_dict(author) -> dict:
    """Convert Author ORM object to dict."""
    return {
        "id": author.id,
        "name": author.name,
        "email": author.email,
        "isDefault": author.is_default,
    }


def _repo_config_to_dict(repo) -> dict:
    """Convert Repository ORM object to a config dict with camelCase authors."""
    authors = []
    if hasattr(repo, "authors") and repo.authors:
        authors = [_author_to_dict(a) for a in repo.authors]

    return {
        "id": repo.id,
        "name": repo.name,
        "path": repo.path,
        "enabled": repo.enabled,
        "lastScanTime": repo.last_scan_time,
        "totalCommits": repo.total_commits,
        "initialScanToDate": repo.initial_scan_to_date,
        "authors": authors,
    }


# ---------------------------------------------------------------------------
# Scan directory
# ---------------------------------------------------------------------------

@config_router.post("/scan-directory")
async def scan_directory(body: dict):
    """Scan a directory for git repositories."""
    root_path = body.get("rootPath", "")
    if not root_path:
        return {"error": "rootPath is required"}

    try:
        repos = scan_directory_for_git_repos(root_path)
        return {"data": repos}
    except Exception as exc:
        logger.error(f"Failed to scan directory: {exc}")
        return {"error": "Failed to scan directory"}


# ---------------------------------------------------------------------------
# Repository config CRUD
# ---------------------------------------------------------------------------

@config_router.get("/repositories")
async def get_repositories_config(db: AsyncSession = Depends(get_db)):
    """Get all repository configurations with authors."""
    from app.services.config_service import ConfigService

    svc = ConfigService()
    configs = await svc.get_all_repos_config(db)
    return {"data": configs}


@config_router.post("/repositories")
async def create_repository(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Create a repository configuration."""
    repo_id = body.get("id")
    name = body.get("name")
    path = body.get("path")
    enabled = body.get("enabled", True)

    if not repo_id or not name or not path:
        return {"error": "id, name, and path are required"}

    from app.services.repository_service import RepositoryService
    from app.services.config_service import ConfigService
    from app.services.scan_task_service import ScanTaskService

    repo_svc = RepositoryService()
    await repo_svc.upsert_repo(db, repo_id=repo_id, name=name, path=path, enabled=enabled)

    if enabled:
        task_svc = ScanTaskService()
        await task_svc.sync_default_repository_tasks(db)

    config_svc = ConfigService()
    config = await config_svc.get_repo_config(db, repo_id)
    return {"data": config}


@config_router.post("/repositories/batch")
async def batch_create_repositories(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Batch create repositories, optionally with a default author."""
    repositories = body.get("repositories", [])
    author_info = body.get("author")

    if not repositories:
        return {"error": "repositories must be a non-empty array"}

    from app.services.repository_service import RepositoryService
    from app.services.config_service import ConfigService
    from app.services.scan_task_service import ScanTaskService

    now = int(time.time() * 1000)
    repo_svc = RepositoryService()

    for repo in repositories:
        await repo_svc.upsert_repo(
            db,
            repo_id=repo["id"],
            name=repo["name"],
            path=repo["path"],
            enabled=repo.get("enabled", True),
        )

        # Create default author if provided
        if author_info and author_info.get("name") and author_info.get("email"):
            # Check if author already exists for this repo+email
            stmt = select(Author).where(
                Author.repo_id == repo["id"],
                Author.email == author_info["email"].strip(),
            )
            result = await db.execute(stmt)
            existing = result.scalar_one_or_none()

            if existing is None:
                new_author = Author(
                    repo_id=repo["id"],
                    name=author_info["name"].strip(),
                    email=author_info["email"].strip(),
                    is_default=True,
                    created_at=now,
                    updated_at=now,
                )
                db.add(new_author)
                await db.flush()

    await db.commit()

    task_svc = ScanTaskService()
    await task_svc.sync_default_repository_tasks(db)

    config_svc = ConfigService()
    configs = await config_svc.get_all_repos_config(db)
    return {"data": configs}


@config_router.put("/repositories/{repo_id}")
async def update_repository(
    repo_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Update a repository configuration."""
    from app.services.config_service import ConfigService
    from app.services.scan_task_service import ScanTaskService

    now = int(time.time() * 1000)

    # Fetch existing repo
    stmt = select(Repository).where(Repository.id == repo_id)
    result = await db.execute(stmt)
    repo = result.scalar_one_or_none()

    if repo is None:
        return {"error": "Repository not found"}

    update_data = {}
    if "name" in body:
        update_data["name"] = body["name"]
    if "path" in body:
        update_data["path"] = body["path"]
    if "enabled" in body:
        update_data["enabled"] = body["enabled"]

    if update_data:
        for key, val in update_data.items():
            setattr(repo, key, val)
        repo.updated_at = now
        await db.commit()

    # Sync default tasks if name or enabled changed
    if "name" in body or "enabled" in body:
        task_svc = ScanTaskService()
        await task_svc.sync_default_repository_tasks(db)

    config_svc = ConfigService()
    config = await config_svc.get_repo_config(db, repo_id)
    return {"data": config}


@config_router.delete("/repositories/{repo_id}")
async def delete_repository(
    repo_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a repository and its commits."""
    from app.models import Commit
    from app.services.scan_task_service import ScanTaskService

    # Delete commits first (foreign key constraint)
    stmt = delete(Commit).where(Commit.repo_id == repo_id)
    await db.execute(stmt)

    # Delete the repository (authors cascade)
    stmt = delete(Repository).where(Repository.id == repo_id)
    await db.execute(stmt)
    await db.commit()

    task_svc = ScanTaskService()
    await task_svc.sync_default_repository_tasks(db)

    return {"success": True}


@config_router.post("/repositories/batch-delete")
async def batch_delete_repositories(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Batch delete repositories by IDs."""
    from app.models import Commit
    from app.services.scan_task_service import ScanTaskService

    ids = body.get("ids", [])
    if not ids:
        return {"error": "ids must be a non-empty array"}

    # Delete commits first
    stmt = delete(Commit).where(Commit.repo_id.in_(ids))
    await db.execute(stmt)

    # Delete repositories
    stmt = delete(Repository).where(Repository.id.in_(ids))
    result = await db.execute(stmt)
    await db.commit()

    task_svc = ScanTaskService()
    await task_svc.sync_default_repository_tasks(db)

    return {"success": True, "deleted": result.rowcount}


# ---------------------------------------------------------------------------
# Authors
# ---------------------------------------------------------------------------

@config_router.get("/repositories/{repo_id}/authors")
async def get_authors(
    repo_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get authors for a repository."""
    from app.services.config_service import ConfigService

    svc = ConfigService()
    authors = await svc.get_authors_by_repo_id(db, repo_id)
    return {"data": [_author_to_dict(a) for a in authors]}


@config_router.post("/repositories/{repo_id}/authors")
async def create_author(
    repo_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Add an author to a repository."""
    name = body.get("name")
    email = body.get("email")
    is_default = body.get("isDefault", False)

    if not name or not email:
        return {"error": "name and email are required"}

    now = int(time.time() * 1000)

    author = Author(
        repo_id=repo_id,
        name=name,
        email=email,
        is_default=is_default,
        created_at=now,
        updated_at=now,
    )
    db.add(author)
    await db.commit()
    await db.refresh(author)

    return {"data": _author_to_dict(author)}


@config_router.delete("/repositories/{repo_id}/authors/{author_id}")
async def delete_author(
    repo_id: str,
    author_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete an author from a repository."""
    stmt = select(Author).where(Author.id == author_id, Author.repo_id == repo_id)
    result = await db.execute(stmt)
    author = result.scalar_one_or_none()

    if author is None:
        return {"error": "Author not found"}

    await db.delete(author)
    await db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# Data metrics config
# ---------------------------------------------------------------------------

@config_router.get("/data-metrics")
async def get_data_metrics_config(db: AsyncSession = Depends(get_db)):
    """Get data metrics configuration."""
    from app.services.data_metrics_config_service import DataMetricsConfigService

    svc = DataMetricsConfigService()
    config = await svc.get_config(db)
    return {"data": config}


@config_router.put("/data-metrics")
async def update_data_metrics_config(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Update data metrics configuration."""
    from app.services.data_metrics_config_service import DataMetricsConfigService

    svc = DataMetricsConfigService()
    config = await svc.update_config(db, **body)
    return {"data": config}


# ---------------------------------------------------------------------------
# Database backup
# ---------------------------------------------------------------------------

@config_router.post("/database/backup")
async def backup_database():
    """Trigger a manual database backup."""
    try:
        from app.jobs.db_backup_scheduler import run_database_backup
        result = await run_database_backup()
        if result.get("success"):
            return {
                "success": True,
                "message": "Database backup successful",
                "destPath": result.get("destPath"),
            }
        else:
            return {
                "success": False,
                "error": result.get("error", "Backup failed"),
            }
    except Exception as exc:
        logger.error(f"Database backup failed: {exc}")
        return {"error": str(exc)}


# ---------------------------------------------------------------------------
# Backup config
# ---------------------------------------------------------------------------

@config_router.get("/backup-config")
async def get_backup_config(db: AsyncSession = Depends(get_db)):
    """Get backup directory and cron configuration."""
    from app.services.app_setting_service import AppSettingService

    svc = AppSettingService()
    backup_dir = await svc.get_backup_dir(db)
    backup_cron = await svc.get_backup_cron(db)
    return {
        "data": {
            "backupDir": backup_dir,
            "backupCron": backup_cron,
        }
    }


@config_router.put("/backup-config")
async def update_backup_config(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Update backup directory and/or cron configuration."""
    from app.services.app_setting_service import AppSettingService

    svc = AppSettingService()

    backup_dir = body.get("backupDir")
    backup_cron = body.get("backupCron")

    if backup_dir is not None:
        result = await svc.set_backup_dir(db, backup_dir)
        if not result.get("success"):
            return {"error": result.get("error", "Failed to set backup directory")}

    if backup_cron is not None:
        result = await svc.set_backup_cron(db, backup_cron)
        if not result.get("success"):
            return {"error": result.get("error", "Failed to set backup cron")}

    updated_dir = await svc.get_backup_dir(db)
    updated_cron = await svc.get_backup_cron(db)
    return {
        "data": {
            "backupDir": updated_dir,
            "backupCron": updated_cron,
        }
    }
