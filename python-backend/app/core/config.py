"""Application configuration management via pydantic-settings."""

from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./database/coding-history.db"

    # Server
    PORT: int = 5188

    # Logging
    LOG_LEVEL: str = "INFO"

    # Backup
    DB_BACKUP_CRON: str = "0 19 * * 5"
    DB_BACKUP_DIR: str = ""

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    @property
    def database_path(self) -> Path:
        """Resolve the SQLite database file path from DATABASE_URL."""
        url = self.DATABASE_URL
        # Remove sqlite+aiosqlite:/// prefix
        if url.startswith("sqlite+aiosqlite:///"):
            path_str = url[len("sqlite+aiosqlite:///"):]
        elif url.startswith("sqlite:///"):
            path_str = url[len("sqlite:///"):]
        else:
            path_str = url
        return Path(path_str)

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
