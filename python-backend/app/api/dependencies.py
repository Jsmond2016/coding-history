"""FastAPI dependency injection helpers."""

from app.core.database import get_db

__all__ = ["get_db"]
