CREATE TABLE "scan_runs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "plan_id" INTEGER,
    "trigger_source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requested_repo_ids" TEXT NOT NULL,
    "range_start" BIGINT NOT NULL,
    "range_end" BIGINT NOT NULL,
    "started_at" BIGINT,
    "finished_at" BIGINT,
    "inserted_commits" INTEGER NOT NULL DEFAULT 0,
    "skipped_commits" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" BIGINT NOT NULL
);

CREATE TABLE "scan_run_repositories" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "run_id" INTEGER NOT NULL,
    "repo_id" TEXT NOT NULL,
    "repo_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inserted_commits" INTEGER NOT NULL DEFAULT 0,
    "skipped_commits" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "started_at" BIGINT,
    "finished_at" BIGINT,
    CONSTRAINT "scan_run_repositories_run_id_fkey"
      FOREIGN KEY ("run_id") REFERENCES "scan_runs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_scan_run_status_created" ON "scan_runs"("status", "created_at");
CREATE INDEX "idx_scan_run_plan_created" ON "scan_runs"("plan_id", "created_at");
CREATE INDEX "idx_scan_run_repository_run" ON "scan_run_repositories"("run_id");
CREATE INDEX "idx_scan_run_repository_repo" ON "scan_run_repositories"("repo_id", "started_at");
