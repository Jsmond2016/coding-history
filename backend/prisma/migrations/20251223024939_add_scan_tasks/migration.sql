-- AlterTable
ALTER TABLE "scheduled_task_logs" ADD COLUMN "task_id" INTEGER;

-- CreateTable
CREATE TABLE "scan_tasks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "task_type" TEXT NOT NULL,
    "scan_range_type" TEXT NOT NULL,
    "start_date" BIGINT,
    "end_date" BIGINT,
    "cron_expression" TEXT,
    "repository_ids" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_execute_time" BIGINT,
    "created_at" BIGINT NOT NULL,
    "updated_at" BIGINT NOT NULL
);

-- CreateIndex
CREATE INDEX "idx_scan_task_type_enabled" ON "scan_tasks"("task_type", "enabled");

-- CreateIndex
CREATE INDEX "idx_scan_task_enabled" ON "scan_tasks"("enabled");

-- CreateIndex
CREATE INDEX "idx_task_log_task_id" ON "scheduled_task_logs"("task_id");
