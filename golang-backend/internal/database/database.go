package database

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/huangjin/coding-history/golang-backend/internal/config"
	"github.com/huangjin/coding-history/golang-backend/internal/model"
)

func Init(cfg *config.Config) (*gorm.DB, error) {
	dsn := resolveDSN(cfg.GetDSN())

	// Ensure parent directory exists
	dir := filepath.Dir(dsn)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create database directory: %w", err)
	}

	logLevel := logger.Error // 默认只打印错误，减少噪音
	switch cfg.LogLevel {
	case "trace", "debug":
		logLevel = logger.Info
	case "warn":
		logLevel = logger.Warn
	case "error", "fatal":
		logLevel = logger.Error
	case "silent":
		logLevel = logger.Silent
	}

	db, err := gorm.Open(sqlite.Open(dsn+"?_journal_mode=WAL&_busy_timeout=5000"), &gorm.Config{
		Logger:                 logger.Default.LogMode(logLevel),
		SkipDefaultTransaction: true,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	// Auto-migrate all models
	if err := db.AutoMigrate(
		&model.Repository{},
		&model.Commit{},
		&model.Author{},
		&model.ServerLog{},
		&model.RequestLog{},
		&model.ScheduledTaskLog{},
		&model.ScanTask{},
		&model.DataMetricsConfig{},
		&model.AppSetting{},
	); err != nil {
		return nil, fmt.Errorf("failed to auto-migrate: %w", err)
	}

	// Set pragmas
	db.Exec("PRAGMA journal_mode=WAL")
	db.Exec("PRAGMA busy_timeout=5000")

	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	sqlDB.SetMaxIdleConns(1)
	sqlDB.SetConnMaxLifetime(time.Hour)

	return db, nil
}

func resolveDSN(dsn string) string {
	if filepath.IsAbs(dsn) {
		return dsn
	}
	abs, err := filepath.Abs(dsn)
	if err != nil {
		return dsn
	}
	return abs
}

func ResolveDatabasePath(cfg *config.Config) string {
	return resolveDSN(cfg.GetDSN())
}
