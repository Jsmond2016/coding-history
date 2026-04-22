package service

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/huangjin/coding-history/golang-backend/internal/model"
	"github.com/robfig/cron/v3"
	"gorm.io/gorm"
)

type AppSettingService struct {
	db *gorm.DB
}

func NewAppSettingService(db *gorm.DB) *AppSettingService {
	return &AppSettingService{db: db}
}

func (s *AppSettingService) GetSetting(key string) (string, error) {
	var setting model.AppSetting
	err := s.db.Where("`key` = ?", key).First(&setting).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return "", nil
		}
		return "", err
	}
	return setting.Value, nil
}

func (s *AppSettingService) SetSetting(key, value string) error {
	now := model.NowMs()
	var existing model.AppSetting
	err := s.db.Where("`key` = ?", key).First(&existing).Error
	if err == gorm.ErrRecordNotFound {
		return s.db.Create(&model.AppSetting{Key: key, Value: value, UpdatedAt: now}).Error
	}
	if err != nil {
		return err
	}
	return s.db.Model(&existing).Updates(map[string]interface{}{"value": value, "updated_at": now}).Error
}

func (s *AppSettingService) GetBackupDir() string {
	val, _ := s.GetSetting("backup_dir")
	if val != "" {
		return val
	}
	// fallback to cwd/db-backup
	dir, _ := os.Getwd()
	return filepath.Join(dir, "db-backup")
}

func (s *AppSettingService) GetBackupCron(defaultCron string) *string {
	val, err := s.GetSetting("backup_cron")
	if err == nil && val != "" {
		if isDisabled(val) {
			return nil
		}
		return &val
	}
	if isDisabled(defaultCron) {
		return nil
	}
	return &defaultCron
}

func (s *AppSettingService) SetBackupDir(dir string) error {
	resolved := dir
	if !filepath.IsAbs(dir) {
		abs, err := filepath.Abs(dir)
		if err != nil {
			return fmt.Errorf("无法解析路径: %v", err)
		}
		resolved = abs
	}

	if err := os.MkdirAll(resolved, 0755); err != nil {
		return fmt.Errorf("目录不可写: %v", err)
	}

	testFile := filepath.Join(resolved, ".write-test")
	if err := os.WriteFile(testFile, []byte{}, 0644); err != nil {
		return fmt.Errorf("目录不可写: %v", err)
	}
	os.Remove(testFile)

	return s.SetSetting("backup_dir", resolved)
}

func (s *AppSettingService) SetBackupCron(cronExpr string) error {
	t := cronExpr
	if isDisabled(t) {
		return s.SetSetting("backup_cron", t)
	}
	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	if _, err := parser.Parse(t); err != nil {
		return fmt.Errorf("Cron 表达式格式无效，请使用标准 5 段格式（分 时 日 月 周）")
	}
	return s.SetSetting("backup_cron", t)
}

func (s *AppSettingService) InitDefaultSettings(backupDir, backupCron string) error {
	existing, _ := s.GetSetting("backup_dir")
	if existing == "" {
		s.SetSetting("backup_dir", backupDir)
	}
	existing, _ = s.GetSetting("backup_cron")
	if existing == "" {
		s.SetSetting("backup_cron", backupCron)
	}
	return nil
}

func isDisabled(val string) bool {
	return val == "" || val == "false" || val == "off" || val == "0"
}
