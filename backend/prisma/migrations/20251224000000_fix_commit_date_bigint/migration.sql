-- Fix commit_date column type from INTEGER to BIGINT
-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table

-- Step 1: Create a new table with the correct column types
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
    CONSTRAINT "commits_new_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "repositories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Step 2: Copy data from old table to new table
INSERT INTO "commits_new" (
    "id",
    "repo_id",
    "commit_hash",
    "author_name",
    "author_email",
    "commit_date",
    "message",
    "files_changed",
    "insertions",
    "deletions",
    "branch",
    "created_at"
)
SELECT 
    "id",
    "repo_id",
    "commit_hash",
    "author_name",
    "author_email",
    CAST("commit_date" AS BIGINT) AS "commit_date",
    "message",
    "files_changed",
    "insertions",
    "deletions",
    "branch",
    CAST("created_at" AS BIGINT) AS "created_at"
FROM "commits";

-- Step 3: Drop old table
DROP TABLE "commits";

-- Step 4: Rename new table to original name
ALTER TABLE "commits_new" RENAME TO "commits";

-- Step 5: Recreate indexes
CREATE INDEX "idx_commits_repo_date" ON "commits"("repo_id", "commit_date");
CREATE INDEX "idx_commits_author" ON "commits"("author_email", "commit_date");
CREATE INDEX "idx_commits_date" ON "commits"("commit_date");
CREATE INDEX "idx_commits_repo_branch_date" ON "commits"("repo_id", "branch", "commit_date");

-- Step 6: Recreate unique constraint
CREATE UNIQUE INDEX "commits_repo_id_commit_hash_branch_key" ON "commits"("repo_id", "commit_hash", "branch");

