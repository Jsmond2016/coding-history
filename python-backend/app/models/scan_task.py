"""ScanTask ORM model."""

from sqlalchemy import BigInteger, Boolean, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ScanTask(Base):
    __tablename__ = "scan_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    task_type: Mapped[str] = mapped_column(String, nullable=False)
    scan_range_type: Mapped[str] = mapped_column(String, nullable=False)
    start_date: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    end_date: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    cron_expression: Mapped[str | None] = mapped_column(String, nullable=True)
    repository_ids: Mapped[str | None] = mapped_column(String, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_execute_time: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[int] = mapped_column(BigInteger, nullable=False)

    __table_args__ = (
        Index("idx_scan_task_type_enabled", "task_type", "enabled"),
        Index("idx_scan_task_enabled", "enabled"),
        Index("idx_scan_task_sort_order", "sort_order"),
    )
