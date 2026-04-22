"""Commit ORM model."""

from sqlalchemy import BigInteger, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Commit(Base):
    __tablename__ = "commits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    repo_id: Mapped[str] = mapped_column(String, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    commit_hash: Mapped[str] = mapped_column(String, nullable=False)
    author_name: Mapped[str] = mapped_column(String, nullable=False)
    author_email: Mapped[str] = mapped_column(String, nullable=False)
    commit_date: Mapped[int] = mapped_column(BigInteger, nullable=False)
    message: Mapped[str] = mapped_column(String, nullable=False)
    files_changed: Mapped[int] = mapped_column(Integer, default=0)
    insertions: Mapped[int] = mapped_column(Integer, default=0)
    deletions: Mapped[int] = mapped_column(Integer, default=0)
    branch: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)

    repository = relationship("Repository", back_populates="commits")

    __table_args__ = (
        UniqueConstraint("repo_id", "commit_hash", name="commits_repo_id_commit_hash_key"),
        Index("idx_commits_repo_date", "repo_id", "commit_date"),
        Index("idx_commits_author", "author_email", "commit_date"),
        Index("idx_commits_date", "commit_date"),
        Index("idx_commits_repo_branch_date", "repo_id", "branch", "commit_date"),
    )
