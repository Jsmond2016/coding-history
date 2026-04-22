package scheduler

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/huangjin/coding-history/golang-backend/internal/config"
	"github.com/huangjin/coding-history/golang-backend/internal/service"
	"github.com/robfig/cron/v3"
	"gorm.io/gorm"
)

type DBBackupScheduler struct {
	db *gorm.DB
	cfg *config.Config
	cron *cron.Cron
}

func NewDBBackupScheduler(db *gorm.DB, cfg *config.Config) *DBBackupScheduler {
	return &DBBackupScheduler{db: db, cfg: cfg}
}

type BackupResult struct {
	Success    bool
	DestPath   string
	SourcePath string
	Error      string
}

func RunDatabaseBackup(db *gorm.DB, cfg *config.Config) *BackupResult {
	settingSvc := service.NewAppSettingService(db)
	backupDir := settingSvc.GetBackupDir()

	dsn := cfg.GetDSN()
	if !filepath.IsAbs(dsn) {
		abs, err := filepath.Abs(dsn)
		if err == nil {
			dsn = abs
		}
	}

	if _, err := os.Stat(dsn); os.IsNotExist(err) {
		return &BackupResult{Success: false, SourcePath: dsn, Error: "源数据库文件不存在"}
	}

	os.MkdirAll(backupDir, 0755)
	dateStr := time.Now().Format("2006-01-02")
	destPath := filepath.Join(backupDir, "coding-history-backup-"+dateStr+".db")

	src, err := os.Open(dsn)
	if err != nil {
		return &BackupResult{Success: false, SourcePath: dsn, Error: err.Error()}
	}
	defer src.Close()

	dst, err := os.Create(destPath)
	if err != nil {
		return &BackupResult{Success: false, SourcePath: dsn, Error: err.Error()}
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		os.Remove(destPath)
		return &BackupResult{Success: false, SourcePath: dsn, Error: err.Error()}
	}

	slog.Info("[DB备份] 已完成", "destPath", destPath, "sourcePath", dsn)
	return &BackupResult{Success: true, DestPath: destPath, SourcePath: dsn}
}

func (s *DBBackupScheduler) Start() {
	settingSvc := service.NewAppSettingService(s.db)
	defaultCron := "0 19 * * 5"
	cronStr := settingSvc.GetBackupCron(defaultCron)

	if cronStr == nil {
		slog.Info("[DB备份] 未启用")
		return
	}

	loc := time.FixedZone("CST", 8*3600)
	s.cron = cron.New(cron.WithLocation(loc))
	_, err := s.cron.AddFunc(*cronStr, func() {
		RunDatabaseBackup(s.db, s.cfg)
	})
	if err != nil {
		slog.Error("[DB备份] Cron 表达式无效", "cron", *cronStr, "error", err)
		return
	}
	s.cron.Start()

	backupDir := settingSvc.GetBackupDir()
	slog.Info("[DB备份] 定时任务已启动", "cron", *cronStr, "backupDir", backupDir)
}

func (s *DBBackupScheduler) Stop() {
	if s.cron != nil {
		s.cron.Stop()
		slog.Info("[DB备份] 定时任务已停止")
	}
}
