"""DataMetricsConfig ORM model."""

from sqlalchemy import BigInteger, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DataMetricsConfig(Base):
    __tablename__ = "data_metrics_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    thresholds: Mapped[str] = mapped_column(String, nullable=False)
    overtime_hour: Mapped[int] = mapped_column("overtimeHour", Integer, nullable=False)
    labels: Mapped[str] = mapped_column(String, nullable=False)
    colors: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
