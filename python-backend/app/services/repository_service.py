"""Repository service – async SQLAlchemy port of RepositoryService.ts."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.repository import Repository


class RepositoryService:
    """CRUD helpers for Repository rows.  All timestamps are int (ms)."""

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _to_dict(repo: Repository) -> dict:
        return {
            "id": repo.id,
            "name": repo.name,
            "path": repo.path,
            "last_scan_time": int(repo.last_scan_time) if repo.last_scan_time is not None else None,
            "total_commits": repo.total_commits,
            "initial_scan_to_date": int(repo.initial_scan_to_date) if repo.initial_scan_to_date is not None else None,
            "created_at": int(repo.created_at),
            "updated_at": int(repo.updated_at),
        }

    # ------------------------------------------------------------------
    # queries
    # ------------------------------------------------------------------

    @staticmethod
    async def get_all_repos(db: AsyncSession) -> list[dict]:
        stmt = select(Repository).order_by(Repository.name.asc())
        result = await db.execute(stmt)
        repos = result.scalars().all()
        return [RepositoryService._to_dict(r) for r in repos]

    @staticmethod
    async def get_repo_by_id(db: AsyncSession, repo_id: str) -> dict | None:
        stmt = select(Repository).where(Repository.id == repo_id)
        result = await db.execute(stmt)
        repo = result.scalar_one_or_none()
        if repo is None:
            return None
        return RepositoryService._to_dict(repo)

    # ------------------------------------------------------------------
    # mutations
    # ------------------------------------------------------------------

    @staticmethod
    async def upsert_repo(
        db: AsyncSession,
        repo_id: str,
        name: str,
        path: str,
        enabled: bool = True,
    ) -> None:
        import time

        now = int(time.time() * 1000)
        stmt = select(Repository).where(Repository.id == repo_id)
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing is not None:
            existing.name = name
            existing.path = path
            existing.updated_at = now
            # only overwrite enabled when the caller explicitly passes it
            # (default True matches the model default, so just set it)
            existing.enabled = enabled
        else:
            new_repo = Repository(
                id=repo_id,
                name=name,
                path=path,
                enabled=enabled,
                created_at=now,
                updated_at=now,
            )
            db.add(new_repo)

        await db.flush()

    @staticmethod
    async def update_repo_scan_info(
        db: AsyncSession,
        repo_id: str,
        last_scan_time: int,
        total_commits: int,
    ) -> None:
        import time

        stmt = select(Repository).where(Repository.id == repo_id)
        result = await db.execute(stmt)
        repo = result.scalar_one_or_none()
        if repo is None:
            return
        repo.last_scan_time = last_scan_time
        repo.total_commits = total_commits
        repo.updated_at = int(time.time() * 1000)
        await db.flush()

    @staticmethod
    async def get_last_scan_time(db: AsyncSession, repo_id: str) -> int | None:
        stmt = select(Repository.last_scan_time).where(Repository.id == repo_id)
        result = await db.execute(stmt)
        val = result.scalar_one_or_none()
        return int(val) if val is not None else None
