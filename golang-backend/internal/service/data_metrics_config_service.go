package service

import (
	"encoding/json"
	"fmt"

	"github.com/huangjin/coding-history/golang-backend/internal/dto"
	"github.com/huangjin/coding-history/golang-backend/internal/model"
	"github.com/huangjin/coding-history/golang-backend/internal/workstatus"
	"gorm.io/gorm"
)

type DataMetricsConfigService struct {
	db *gorm.DB
}

func NewDataMetricsConfigService(db *gorm.DB) *DataMetricsConfigService {
	return &DataMetricsConfigService{db: db}
}

func (s *DataMetricsConfigService) GetDefaultConfig() dto.DataMetricsConfigResponse {
	now := model.NowMs()
	return dto.DataMetricsConfigResponse{
		ID:           0,
		Thresholds: map[string]int{
			"relaxed":    workstatus.DefaultConfig.Thresholds.Relaxed,
			"normal":     workstatus.DefaultConfig.Thresholds.Normal,
			"busy":       workstatus.DefaultConfig.Thresholds.Busy,
			"superCrazy": workstatus.DefaultConfig.Thresholds.SuperCrazy,
		},
		OvertimeHour: workstatus.DefaultConfig.OvertimeHour,
		Labels:       workstatus.DefaultLabels,
		Colors:       workstatus.DefaultColors,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
}

func (s *DataMetricsConfigService) GetConfig() (*dto.DataMetricsConfigResponse, error) {
	var config model.DataMetricsConfig
	err := s.db.Order("created_at DESC").First(&config).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			defaultCfg := s.GetDefaultConfig()
			return &defaultCfg, nil
		}
		return nil, err
	}
	return s.modelToDTO(&config)
}

func (s *DataMetricsConfigService) GetWorkStatusConfig() (*workstatus.WorkStatusConfig, error) {
	cfg, err := s.GetConfig()
	if err != nil {
		return nil, err
	}
	return &workstatus.WorkStatusConfig{
		Thresholds: workstatus.Thresholds{
			Relaxed:    cfg.Thresholds["relaxed"],
			Normal:     cfg.Thresholds["normal"],
			Busy:       cfg.Thresholds["busy"],
			SuperCrazy: cfg.Thresholds["superCrazy"],
		},
		OvertimeHour: cfg.OvertimeHour,
	}, nil
}

func (s *DataMetricsConfigService) UpdateConfig(req *dto.UpdateDataMetricsRequest) (*dto.DataMetricsConfigResponse, error) {
	relaxed := req.Thresholds["relaxed"]
	normal := req.Thresholds["normal"]
	busy := req.Thresholds["busy"]
	superCrazy := req.Thresholds["superCrazy"]

	if relaxed >= normal || normal >= busy || busy >= superCrazy {
		return nil, fmt.Errorf("阈值必须递增：relaxed < normal < busy < superCrazy")
	}

	if req.OvertimeHour < 0 || req.OvertimeHour > 23 {
		return nil, fmt.Errorf("加班时间阈值必须在 0-23 之间")
	}

	validColors := map[string]bool{
		"default": true, "processing": true, "success": true, "error": true,
		"warning": true, "magenta": true, "red": true, "volcano": true,
		"orange": true, "gold": true, "lime": true, "green": true,
		"cyan": true, "blue": true, "geekblue": true, "purple": true,
	}
	for status, color := range req.Colors {
		if !validColors[color] {
			return nil, fmt.Errorf("无效的颜色值: %s，状态: %s", color, status)
		}
	}

	now := model.NowMs()
	thresholdsJSON, _ := json.Marshal(req.Thresholds)
	labelsJSON, _ := json.Marshal(req.Labels)
	colorsJSON, _ := json.Marshal(req.Colors)

	var existing model.DataMetricsConfig
	err := s.db.Order("created_at DESC").First(&existing).Error

	if err == gorm.ErrRecordNotFound {
		config := model.DataMetricsConfig{
			Thresholds:   string(thresholdsJSON),
			OvertimeHour: req.OvertimeHour,
			Labels:       string(labelsJSON),
			Colors:       string(colorsJSON),
			CreatedAt:    now,
			UpdatedAt:    now,
		}
		if err := s.db.Create(&config).Error; err != nil {
			return nil, err
		}
		return s.modelToDTO(&config)
	}
	if err != nil {
		return nil, err
	}

	s.db.Model(&existing).Updates(map[string]interface{}{
		"thresholds":    string(thresholdsJSON),
		"overtime_hour": req.OvertimeHour,
		"labels":        string(labelsJSON),
		"colors":        string(colorsJSON),
		"updated_at":    now,
	})
	existing.Thresholds = string(thresholdsJSON)
	existing.OvertimeHour = req.OvertimeHour
	existing.Labels = string(labelsJSON)
	existing.Colors = string(colorsJSON)
	existing.UpdatedAt = now
	return s.modelToDTO(&existing)
}

func (s *DataMetricsConfigService) InitDefaultConfig() error {
	var count int64
	s.db.Model(&model.DataMetricsConfig{}).Count(&count)
	if count > 0 {
		return nil
	}

	defaultCfg := s.GetDefaultConfig()
	thresholdsJSON, _ := json.Marshal(defaultCfg.Thresholds)
	labelsJSON, _ := json.Marshal(defaultCfg.Labels)
	colorsJSON, _ := json.Marshal(defaultCfg.Colors)

	now := model.NowMs()
	config := model.DataMetricsConfig{
		Thresholds:   string(thresholdsJSON),
		OvertimeHour: defaultCfg.OvertimeHour,
		Labels:       string(labelsJSON),
		Colors:       string(colorsJSON),
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	return s.db.Create(&config).Error
}

func (s *DataMetricsConfigService) modelToDTO(m *model.DataMetricsConfig) (*dto.DataMetricsConfigResponse, error) {
	var thresholds map[string]int
	var labels map[string]string
	var colors map[string]string

	if err := json.Unmarshal([]byte(m.Thresholds), &thresholds); err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(m.Labels), &labels); err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(m.Colors), &colors); err != nil {
		return nil, err
	}

	return &dto.DataMetricsConfigResponse{
		ID:           m.ID,
		Thresholds:   thresholds,
		OvertimeHour: m.OvertimeHour,
		Labels:       labels,
		Colors:       colors,
		CreatedAt:    m.CreatedAt,
		UpdatedAt:    m.UpdatedAt,
	}, nil
}
