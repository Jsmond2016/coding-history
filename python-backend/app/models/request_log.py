"""RequestLog ORM model."""

from sqlalchemy import BigInteger, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RequestLog(Base):
    __tablename__ = "request_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    method: Mapped[str] = mapped_column(String, nullable=False)
    url: Mapped[str] = mapped_column(String, nullable=False)
    route_name: Mapped[str | None] = mapped_column(String, nullable=True)
    module: Mapped[str | None] = mapped_column(String, nullable=True)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    request_body: Mapped[str | None] = mapped_column(String, nullable=True)
    response_body: Mapped[str | None] = mapped_column(String, nullable=True)
    duration: Mapped[int] = mapped_column(Integer, nullable=False)
    timestamp: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)

    __table_args__ = (
        Index("idx_request_log_method_time", "method", "timestamp"),
        Index("idx_request_log_status_time", "status_code", "timestamp"),
        Index("idx_request_log_module_time", "module", "timestamp"),
        Index("idx_request_log_time", "timestamp"),
    )
