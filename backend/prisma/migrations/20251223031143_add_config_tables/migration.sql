-- CreateTable
CREATE TABLE "authors" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "repo_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" BIGINT NOT NULL,
    "updated_at" BIGINT NOT NULL,
    CONSTRAINT "authors_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "repositories" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ignored_branches" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "repo_id" TEXT NOT NULL,
    "branch_name" TEXT NOT NULL,
    "created_at" BIGINT NOT NULL,
    CONSTRAINT "ignored_branches_repo_id_fkey" FOREIGN KEY ("repo_id") REFERENCES "repositories" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_repositories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_scan_time" BIGINT,
    "total_commits" INTEGER NOT NULL DEFAULT 0,
    "initial_scan_to_date" BIGINT,
    "created_at" BIGINT NOT NULL,
    "updated_at" BIGINT NOT NULL
);
INSERT INTO "new_repositories" ("created_at", "id", "initial_scan_to_date", "last_scan_time", "name", "path", "total_commits", "updated_at") SELECT "created_at", "id", "initial_scan_to_date", "last_scan_time", "name", "path", "total_commits", "updated_at" FROM "repositories";
DROP TABLE "repositories";
ALTER TABLE "new_repositories" RENAME TO "repositories";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "authors_repo_id_idx" ON "authors"("repo_id");

-- CreateIndex
CREATE UNIQUE INDEX "authors_repo_id_email_key" ON "authors"("repo_id", "email");

-- CreateIndex
CREATE INDEX "ignored_branches_repo_id_idx" ON "ignored_branches"("repo_id");

-- CreateIndex
CREATE UNIQUE INDEX "ignored_branches_repo_id_branch_name_key" ON "ignored_branches"("repo_id", "branch_name");
