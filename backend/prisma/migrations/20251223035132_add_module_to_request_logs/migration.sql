-- AlterTable
ALTER TABLE "request_logs" ADD COLUMN "module" TEXT;

-- CreateIndex
CREATE INDEX "idx_request_log_module_time" ON "request_logs"("module", "timestamp");
