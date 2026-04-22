package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/huangjin/coding-history/golang-backend/internal/config"
	"github.com/huangjin/coding-history/golang-backend/internal/database"
	"github.com/huangjin/coding-history/golang-backend/internal/router"
	"github.com/huangjin/coding-history/golang-backend/internal/scheduler"
	"github.com/huangjin/coding-history/golang-backend/internal/service"
)

func main() {
	fmt.Println("🚀 [coding-history] Go 后端正在启动...")

	// 1. Load config
	fmt.Print("  ⏳ 加载配置...")
	cfg := config.Load()
	fmt.Printf(" ✓ (端口: %d)\n", cfg.Port)

	// 2. Init database
	fmt.Print("  ⏳ 初始化数据库...")
	start := time.Now()
	db, err := database.Init(cfg)
	if err != nil {
		fmt.Printf(" ✗\n")
		slog.Error("Failed to initialize database", "error", err)
		os.Exit(1)
	}
	fmt.Printf(" ✓ (%.1fs)\n", time.Since(start).Seconds())

	// 3. Init default data
	fmt.Print("  ⏳ 初始化默认配置...")
	dataMetricsSvc := service.NewDataMetricsConfigService(db)
	if err := dataMetricsSvc.InitDefaultConfig(); err != nil {
		slog.Warn("数据指标配置初始化失败", "error", err)
	}

	settingSvc := service.NewAppSettingService(db)
	backupDir := cfg.DBBackupDir
	if backupDir == "" {
		backupDir = "db-backup"
	}
	backupCron := "0 19 * * 5"
	if cfg.DBBackupCron != "" {
		backupCron = cfg.DBBackupCron
	}
	settingSvc.InitDefaultSettings(backupDir, backupCron)
	fmt.Println(" ✓")

	// 4. Start schedulers
	fmt.Print("  ⏳ 启动定时任务...")
	scanScheduler := scheduler.NewScanScheduler(db)
	scanScheduler.Start()

	backupScheduler := scheduler.NewDBBackupScheduler(db, cfg)
	backupScheduler.Start()
	fmt.Println(" ✓")

	// 5. Log server start
	logSvc := service.NewLogService(db)
	logSvc.CreateServerLog("start", fmt.Sprintf("服务器启动成功，运行在端口 %d", cfg.Port), nil)

	// 6. Setup router
	fmt.Print("  ⏳ 注册路由...")
	r := router.SetupRouter(db, cfg, scanScheduler, backupScheduler)
	fmt.Println(" ✓")

	// 7. Start HTTP server
	srv := &http.Server{
		Addr:    cfg.GetPort(),
		Handler: r,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("Server failed", "error", err)
			os.Exit(1)
		}
	}()

	fmt.Printf("\n  ✅ 服务已就绪 → http://localhost:%d\n", cfg.Port)
	fmt.Printf("  📋 健康检查 → http://localhost:%d/health\n", cfg.Port)
	fmt.Printf("  ⏱  启动耗时: %.1fs\n\n", time.Since(start).Seconds())

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	fmt.Print("\n  ⏳ 正在关闭服务...")
	backupScheduler.Stop()
	scanScheduler.Stop()
	logSvc.CreateServerLog("stop", "服务器收到关闭信号，正在关闭", nil)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("Server forced to shutdown", "error", err)
	}

	fmt.Println(" ✓")
	fmt.Println("  👋 服务已停止")
}
