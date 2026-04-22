"""Repository ORM model."""

from sqlalchemy import BigInteger, Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Repository(Base):
    __tablename__ = "repositories"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    path: Mapped[str] = mapped_column(String, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_scan_time: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    total_commits: Mapped[int] = mapped_column(Integer, default=0)
    initial_scan_to_date: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)
    updated_at: Mapped[int] = mapped_column(BigInteger, nullable=False)

    commits = relationship("Commit", back_populates="repository", cascade="all, delete-orphan")
    authors = relationship("Author", back_populates="repository", cascade="all, delete-orphan")
