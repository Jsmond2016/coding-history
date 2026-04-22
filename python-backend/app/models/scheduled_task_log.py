"""ScheduledTaskLog ORM model."""

from sqlalchemy import BigInteger, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ScheduledTaskLog(Base):
    __tablename__ = "scheduled_task_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_name: Mapped[str] = mapped_column(String, nullable=False)
    cron_expression: Mapped[str | None] = mapped_column(String, nullable=True)
    start_time: Mapped[int] = mapped_column(BigInteger, nullable=False)
    end_time: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False)
    repositories: Mapped[str] = mapped_column(String, nullable=False)
    total_commits: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)
    task_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)

    __table_args__ = (
        Index("idx_task_log_status_time", "status", "start_time"),
        Index("idx_task_log_time", "start_time"),
        Index("idx_task_log_task_id", "task_id"),
    )
