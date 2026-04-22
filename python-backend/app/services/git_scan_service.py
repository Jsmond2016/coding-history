"""Git scan service – GitPython port of GitScanService.ts."""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class ScannedCommit:
    hash: str
    message: str
    date: int  # milliseconds
    authorName: str
    authorEmail: str
    filesChanged: int = 0
    insertions: int = 0
    deletions: int = 0
    branch: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "hash": self.hash,
            "message": self.message,
            "date": self.date,
            "authorName": self.authorName,
            "authorEmail": self.authorEmail,
            "filesChanged": self.filesChanged,
            "insertions": self.insertions,
            "deletions": self.deletions,
        }
        if self.branch is not None:
            d["branch"] = self.branch
        return d


class GitScanService:
    """Scan a local git repository for commits using GitPython.

    All potentially blocking git operations are wrapped in
    ``asyncio.to_thread`` so they can be awaited from async code.
    """

    def __init__(self, repo_path: str) -> None:
        self.repo_path = repo_path

    # ------------------------------------------------------------------
    # internal: open repo (non-blocking wrapper)
    # ------------------------------------------------------------------

    def _open_repo(self) -> "Repo":  # noqa: F821
        from git import Repo

        return Repo(self.repo_path)

    # ------------------------------------------------------------------
    # scan_repository_flat  (--all, cross-ref, single pass)
    # ------------------------------------------------------------------

    async def scan_repository_flat(
        self,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        author_emails: list[str] | None = None,
    ) -> list[ScannedCommit]:
        return await asyncio.to_thread(
            self._scan_repository_flat_sync,
            from_date,
            to_date,
            author_emails,
        )

    def _scan_repository_flat_sync(
        self,
        from_date: datetime | None,
        to_date: datetime | None,
        author_emails: list[str] | None,
    ) -> list[ScannedCommit]:
        from git import Repo

        repo = Repo(self.repo_path)

        # build git-log arguments
        args = ["--all", "--format=%H|%s|%aI|%an|%ae"]
        if from_date is not None:
            args.extend(["--since", from_date.isoformat()])
        if to_date is not None:
            args.extend(["--until", to_date.isoformat()])
        if author_emails and len(author_emails) > 0:
            pattern = "|".join(
                re.escape(e) for e in author_emails
            )
            args.extend(["--perl-regexp", "--author", pattern])

        raw_output: str = repo.git.log(*args)
        if not raw_output.strip():
            return []

        lines = raw_output.strip().split("\n")
        commits: list[ScannedCommit] = []
        for line in lines:
            parts = line.split("|", 4)
            if len(parts) < 5:
                continue
            commit_hash, message, date_iso, author_name, author_email = parts
            try:
                dt = datetime.fromisoformat(date_iso)
                date_ms = int(dt.timestamp() * 1000)
            except (ValueError, TypeError):
                continue

            # get diff stats
            files_changed = 0
            insertions = 0
            deletions = 0
            try:
                stats = repo.commit(commit_hash).stats
                files_changed = stats.files_changed if hasattr(stats, "files_changed") else len(stats.files)
                insertions = stats.total.get("insertions", 0) if isinstance(stats.total, dict) else stats.insertions
                deletions = stats.total.get("deletions", 0) if isinstance(stats.total, dict) else stats.deletions
            except Exception:
                pass  # root commit or other issue – defaults to 0

            commits.append(
                ScannedCommit(
                    hash=commit_hash,
                    message=message,
                    date=date_ms,
                    authorName=author_name,
                    authorEmail=author_email,
                    filesChanged=files_changed,
                    insertions=insertions,
                    deletions=deletions,
                )
            )

        logger.info(
            "Flat scan (--all): %d unique commits in %s",
            len(commits),
            self.repo_path,
        )
        return commits

    # ------------------------------------------------------------------
    # scan_repository  (branch-aware, legacy compatibility)
    # ------------------------------------------------------------------

    async def scan_repository(
        self,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        author_emails: list[str] | None = None,
    ) -> list[ScannedCommit]:
        return await asyncio.to_thread(
            self._scan_repository_sync,
            from_date,
            to_date,
            author_emails,
        )

    def _scan_repository_sync(
        self,
        from_date: datetime | None,
        to_date: datetime | None,
        author_emails: list[str] | None,
    ) -> list[ScannedCommit]:
        from git import Repo

        repo = Repo(self.repo_path)
        branches_to_scan = self._get_branches_to_scan(repo)
        logger.info(
            "Found %d branches to scan in %s",
            len(branches_to_scan),
            self.repo_path,
        )

        all_commits: list[ScannedCommit] = []
        for branch_name in branches_to_scan:
            try:
                branch_commits = self._scan_branch(
                    repo, branch_name, from_date, to_date, author_emails
                )
                all_commits.extend(branch_commits)
            except Exception as exc:
                logger.warning("Failed to scan branch %s: %s", branch_name, exc)

        # dedup by hash, prefer unreleased branch names
        unique: dict[str, ScannedCommit] = {}
        for commit in all_commits:
            key = commit.hash
            existing = unique.get(key)
            current_is_unreleased = (
                commit.branch is not None
                and commit.branch not in ("release", "master")
            )
            if existing is None:
                unique[key] = commit
            elif current_is_unreleased and (
                existing.branch is None
                or existing.branch in ("release", "master")
            ):
                unique[key] = commit

        result = list(unique.values())
        logger.info(
            "Found %d unique commits (across %d branches)",
            len(result),
            len(branches_to_scan),
        )
        return result

    # ------------------------------------------------------------------
    # incremental_scan  (delegates to flat scan)
    # ------------------------------------------------------------------

    async def incremental_scan(
        self,
        last_scan_date: datetime,
        author_emails: list[str] | None = None,
        to_date: datetime | None = None,
    ) -> list[ScannedCommit]:
        logger.info(
            "Incremental flat scan from %s%s",
            last_scan_date.isoformat(),
            f" to {to_date.isoformat()}" if to_date else "",
        )
        return await self.scan_repository_flat(last_scan_date, to_date, author_emails)

    # ------------------------------------------------------------------
    # internal: branch helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _normalize_branch_for_compare(name: str) -> str:
        return re.sub(r"^origin/", "", name).strip()

    def _get_branches_to_scan(self, repo: "Repo") -> list[str]:  # noqa: F821
        raw = self._get_all_branches(repo)
        release_ref = next(
            (b for b in raw if self._normalize_branch_for_compare(b) == "release"),
            None,
        )
        master_ref = next(
            (b for b in raw if self._normalize_branch_for_compare(b) == "master"),
            None,
        )

        has_release = release_ref is not None
        has_master = master_ref is not None
        lst = list(raw)
        if has_release and has_master:
            lst = [b for b in lst if self._normalize_branch_for_compare(b) != "master"]

        main_ref = release_ref or master_ref
        others = [b for b in lst if b != main_ref]

        unreleased: list[str] = []
        for branch in others:
            if not main_ref:
                unreleased.append(branch)
                continue
            try:
                tip = repo.git.rev_parse(branch).strip()
                if not tip:
                    continue
                # check if tip is ancestor of main
                repo.git.merge_base("--is-ancestor", tip, main_ref)
                # if we get here, tip IS an ancestor -> skip
            except Exception:
                unreleased.append(branch)

        result = list(unreleased)
        if main_ref:
            result.append(main_ref)
        return result

    @staticmethod
    def _get_all_branches(repo: "Repo") -> list[str]:  # noqa: F821
        branches: set[str] = set()
        try:
            for ref in repo.branches:
                name = str(ref)
                if "HEAD" not in name and "->" not in name:
                    branches.add(name)
            for ref in repo.remotes.origin.refs:
                name = str(ref).replace("remotes/", "")
                if "HEAD" not in name and "->" not in name:
                    branches.add(name)
        except Exception:
            try:
                if repo.active_branch:
                    branches.add(str(repo.active_branch))
            except Exception:
                pass
        return list(branches)

    def _scan_branch(
        self,
        repo: "Repo",  # noqa: F821
        branch_name: str,
        from_date: datetime | None,
        to_date: datetime | None,
        author_emails: list[str] | None,
    ) -> list[ScannedCommit]:
        # determine actual vs storage branch name
        actual_branch = branch_name
        storage_branch = branch_name
        if branch_name.startswith("origin/"):
            storage_branch = branch_name[len("origin/"):]

        args = [actual_branch, "--format=%H|%s|%aI|%an|%ae"]
        if from_date is not None:
            args.extend(["--since", from_date.isoformat()])
        if to_date is not None:
            args.extend(["--until", to_date.isoformat()])
        if author_emails and len(author_emails) > 0:
            pattern = "|".join(re.escape(e) for e in author_emails)
            args.extend(["--perl-regexp", "--author", pattern])

        raw_output: str = repo.git.log(*args)
        if not raw_output.strip():
            return []

        commits: list[ScannedCommit] = []
        for line in raw_output.strip().split("\n"):
            parts = line.split("|", 4)
            if len(parts) < 5:
                continue
            commit_hash, message, date_iso, author_name, author_email = parts
            try:
                dt = datetime.fromisoformat(date_iso)
                date_ms = int(dt.timestamp() * 1000)
            except (ValueError, TypeError):
                continue

            files_changed = 0
            insertions = 0
            deletions = 0
            try:
                stats = repo.commit(commit_hash).stats
                files_changed = len(stats.files)
                total = stats.total
                insertions = total.get("insertions", 0) if isinstance(total, dict) else 0
                deletions = total.get("deletions", 0) if isinstance(total, dict) else 0
            except Exception:
                pass

            commits.append(
                ScannedCommit(
                    hash=commit_hash,
                    message=message,
                    date=date_ms,
                    authorName=author_name,
                    authorEmail=author_email,
                    filesChanged=files_changed,
                    insertions=insertions,
                    deletions=deletions,
                    branch=storage_branch or None,
                )
            )
        return commits
