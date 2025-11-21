-- CreateTable
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "last_scan_time" BIGINT,
    "total_commits" INTEGER NOT NULL DEFAULT 0,
    "created_at" BIGINT NOT NULL,
    "updated_at" BIGINT NOT NULL
);

-- CreateTable
CREATE TABLE "commits" (
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
    "created_at" BIGINT NOT NULL,
    CONSTRAINT "commits_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "repositories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "idx_commits_repo_date" ON "commits"("repo_id", "commit_date");

-- CreateIndex
CREATE INDEX "idx_commits_author" ON "commits"("author_email", "commit_date");

-- CreateIndex
CREATE INDEX "idx_commits_date" ON "commits"("commit_date");

-- CreateIndex
CREATE UNIQUE INDEX "commits_repo_id_commit_hash_key" ON "commits"("repo_id", "commit_hash");
