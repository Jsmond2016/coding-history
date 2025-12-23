-- CreateTable
CREATE TABLE "server_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "error_stack" TEXT,
    "timestamp" BIGINT NOT NULL,
    "created_at" BIGINT NOT NULL
);

-- CreateTable
CREATE TABLE "request_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "method" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "route_name" TEXT,
    "status_code" INTEGER NOT NULL,
    "request_body" TEXT,
    "response_body" TEXT,
    "duration" INTEGER NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "created_at" BIGINT NOT NULL
);

-- CreateTable
CREATE TABLE "scheduled_task_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "task_name" TEXT NOT NULL,
    "cron_expression" TEXT,
    "start_time" BIGINT NOT NULL,
    "end_time" BIGINT,
    "status" TEXT NOT NULL,
    "repositories" TEXT NOT NULL,
    "total_commits" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" BIGINT NOT NULL
);

-- CreateIndex
CREATE INDEX "idx_server_log_type_time" ON "server_logs"("type", "timestamp");

-- CreateIndex
CREATE INDEX "idx_server_log_time" ON "server_logs"("timestamp");

-- CreateIndex
CREATE INDEX "idx_request_log_method_time" ON "request_logs"("method", "timestamp");

-- CreateIndex
CREATE INDEX "idx_request_log_status_time" ON "request_logs"("status_code", "timestamp");

-- CreateIndex
CREATE INDEX "idx_request_log_time" ON "request_logs"("timestamp");

-- CreateIndex
CREATE INDEX "idx_task_log_status_time" ON "scheduled_task_logs"("status", "start_time");

-- CreateIndex
CREATE INDEX "idx_task_log_time" ON "scheduled_task_logs"("start_time");
