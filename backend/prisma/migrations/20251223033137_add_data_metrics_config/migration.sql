-- CreateTable
CREATE TABLE "data_metrics_config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "thresholds" TEXT NOT NULL,
    "overtimeHour" INTEGER NOT NULL,
    "labels" TEXT NOT NULL,
    "colors" TEXT NOT NULL,
    "created_at" BIGINT NOT NULL,
    "updated_at" BIGINT NOT NULL
);
