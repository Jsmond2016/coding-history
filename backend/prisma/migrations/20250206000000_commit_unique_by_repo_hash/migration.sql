-- Change Commit unique from (repoId, commitHash, branch) to (repoId, commitHash).
-- Deduplicate: keep one row per (repo_id, commit_hash), prefer branch NOT NULL and NOT 'release'/'master'.

-- 1. Drop old unique index
DROP INDEX IF EXISTS "commits_repo_id_commit_hash_branch_key";

-- 2. Create new table with same structure
CREATE TABLE "commits_new" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "repo_id" TEXT NOT NULL,
    "commit_hash" TEXT NOT NULL,
    "author_name" TEXT NOT NULL,
    "author_email" TEXT NOT NULL,
    "commit_date" BIGINT NOT NULL,
    "message" TEXT NOT NULL,
    "files_changed" INTEGER NOT NULL DEFAULT 0,
    "insertions" INTEGER NOT NULL DEFAULT 0,
    "deletions" INTEGER NOT NULL DEFAULT 0,
    "branch" TEXT,
    "created_at" BIGINT NOT NULL,
    CONSTRAINT "commits_new_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "repositories" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 3. Copy one row per (repo_id, commit_hash); prefer branch not null and not 'release'/'master'
INSERT INTO "commits_new" (
    "id", "repo_id", "commit_hash", "author_name", "author_email", "commit_date",
    "message", "files_changed", "insertions", "deletions", "branch", "created_at"
)
SELECT
    c.id, c.repo_id, c.commit_hash, c.author_name, c.author_email, c.commit_date,
    c.message, c.files_changed, c.insertions, c.deletions, c.branch, c.created_at
FROM "commits" c
WHERE c.id = (
    SELECT c2.id FROM "commits" c2
    WHERE c2.repo_id = c.repo_id AND c2.commit_hash = c.commit_hash
    ORDER BY
        CASE WHEN c2.branch IS NOT NULL AND c2.branch NOT IN ('release','master') THEN 0 ELSE 1 END,
        c2.id
    LIMIT 1
);

-- 4. Drop old table and rename
DROP TABLE "commits";
ALTER TABLE "commits_new" RENAME TO "commits";

-- 5. New unique constraint and indexes
CREATE UNIQUE INDEX "commits_repo_id_commit_hash_key" ON "commits"("repo_id", "commit_hash");
CREATE INDEX "idx_commits_repo_date" ON "commits"("repo_id", "commit_date");
CREATE INDEX "idx_commits_author" ON "commits"("author_email", "commit_date");
CREATE INDEX "idx_commits_date" ON "commits"("commit_date");
CREATE INDEX "idx_commits_repo_branch_date" ON "commits"("repo_id", "branch", "commit_date");
