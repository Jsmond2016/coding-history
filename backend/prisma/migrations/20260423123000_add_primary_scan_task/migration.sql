-- AlterTable
ALTER TABLE "scan_tasks" ADD COLUMN "is_primary" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "uniq_scan_tasks_primary_true"
ON "scan_tasks"("is_primary")
WHERE "is_primary" = true;
