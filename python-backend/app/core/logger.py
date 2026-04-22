"""Logging configuration using loguru."""

import sys
from pathlib import Path

from loguru import logger

from app.core.config import settings

# Remove default handler
logger.remove()

# Console output with colors
logger.add(
    sys.stderr,
    level=settings.LOG_LEVEL,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    colorize=True,
)

# Ensure logs directory exists
logs_dir = Path(__file__).resolve().parent.parent.parent / "logs"
logs_dir.mkdir(exist_ok=True)

# Daily rotating app log
logger.add(
    str(logs_dir / "app-{time:YYYY-MM-DD}.log"),
    level="INFO",
    rotation="00:00",
    retention="30 days",
    encoding="utf-8",
    format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
)

# Daily rotating error log
logger.add(
    str(logs_dir / "error-{time:YYYY-MM-DD}.log"),
    level="ERROR",
    rotation="00:00",
    retention="30 days",
    encoding="utf-8",
    format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
)
