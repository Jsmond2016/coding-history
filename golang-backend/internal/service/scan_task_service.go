package service

import (
	"encoding/json"
	"fmt"

	"github.com/huangjin/coding-history/golang-backend/internal/dto"
	"github.com/huangjin/coding-history/golang-backend/internal/model"
	"gorm.io/gorm"
)

type ScanTaskService struct {
	db *gorm.DB
}

func NewScanTaskService(db *gorm.DB) *ScanTaskService {
	return &ScanTaskService{db: db}
}

func (s *ScanTaskService) CreateTask(params *dto.CreateScanTaskRequest) (*dto.ScanTaskResponse, error) {
	now := model.NowMs()
	task := model.ScanTask{
		Name:          params.Name,
		Description:   params.Description,
		TaskType:      params.TaskType,
		ScanRangeType: params.ScanRangeType,
		StartDate:     params.StartDate,
		EndDate:       params.EndDate,
		CronExpression: params.CronExpression,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if params.RepositoryIDs != nil {
		ids, _ := json.Marshal(params.RepositoryIDs)
		s := string(ids)
		task.RepositoryIDs = &s
	}
	if params.Enabled != nil {
		task.Enabled = *params.Enabled
	}

	if err := s.db.Create(&task).Error; err != nil {
		return nil, err
	}
	return s.modelToResponse(&task), nil
}

func (s *ScanTaskService) GetAllTasks() ([]dto.ScanTaskResponse, error) {
	var tasks []model.ScanTask
	if err := s.db.Order("sort_order ASC, created_at DESC").Find(&tasks).Error; err != nil {
		return nil, err
	}
	result := make([]dto.ScanTaskResponse, len(tasks))
	for i, t := range tasks {
		result[i] = *s.modelToResponse(&t)
	}
	return result, nil
}

func (s *ScanTaskService) GetTaskByID(id int64) (*dto.ScanTaskResponse, error) {
	var task model.ScanTask
	if err := s.db.Where("id = ?", id).First(&task).Error; err != nil {
		return nil, err
	}
	return s.modelToResponse(&task), nil
}

func (s *ScanTaskService) UpdateTask(id int64, params *dto.UpdateScanTaskRequest) (*dto.ScanTaskResponse, error) {
	updates := map[string]interface{}{
		"updated_at": model.NowMs(),
	}
	if params.Name != nil {
		updates["name"] = *params.Name
	}
	if params.Description != nil {
		updates["description"] = *params.Description
	}
	if params.TaskType != nil {
		updates["task_type"] = *params.TaskType
	}
	if params.ScanRangeType != nil {
		updates["scan_range_type"] = *params.ScanRangeType
	}
	if params.StartDate != nil {
		updates["start_date"] = *params.StartDate
	}
	if params.EndDate != nil {
		updates["end_date"] = *params.EndDate
	}
	if params.CronExpression != nil {
		updates["cron_expression"] = *params.CronExpression
	}
	if params.RepositoryIDs != nil {
		ids, _ := json.Marshal(params.RepositoryIDs)
		s := string(ids)
		updates["repository_ids"] = s
	}
	if params.Enabled != nil {
		updates["enabled"] = *params.Enabled
	}

	if err := s.db.Model(&model.ScanTask{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return nil, err
	}
	return s.GetTaskByID(id)
}

func (s *ScanTaskService) DeleteTask(id int64) error {
	return s.db.Where("id = ?", id).Delete(&model.ScanTask{}).Error
}

func (s *ScanTaskService) EnableTask(id int64) (*dto.ScanTaskResponse, error) {
	enabled := true
	return s.UpdateTask(id, &dto.UpdateScanTaskRequest{Enabled: &enabled})
}

func (s *ScanTaskService) DisableTask(id int64) (*dto.ScanTaskResponse, error) {
	enabled := false
	return s.UpdateTask(id, &dto.UpdateScanTaskRequest{Enabled: &enabled})
}

func (s *ScanTaskService) UpdateLastExecuteTime(id int64, executeTime int64) error {
	return s.db.Model(&model.ScanTask{}).Where("id = ?", id).Updates(map[string]interface{}{
		"last_execute_time": executeTime,
		"updated_at":        model.NowMs(),
	}).Error
}

func (s *ScanTaskService) GetEnabledScheduledTasks() ([]dto.ScanTaskResponse, error) {
	var tasks []model.ScanTask
	if err := s.db.Where("task_type = ? AND enabled = ?", "scheduled", true).
		Order("created_at ASC").Find(&tasks).Error; err != nil {
		return nil, err
	}
	result := make([]dto.ScanTaskResponse, len(tasks))
	for i, t := range tasks {
		result[i] = *s.modelToResponse(&t)
	}
	return result, nil
}

func (s *ScanTaskService) BatchUpdateSortOrder(items []dto.SortOrderItem) error {
	for _, item := range items {
		s.db.Model(&model.ScanTask{}).Where("id = ?", item.ID).Updates(map[string]interface{}{
			"sort_order": item.SortOrder,
			"updated_at": model.NowMs(),
		})
	}
	return nil
}

func (s *ScanTaskService) GetDefaultTasks() ([]dto.CreateScanTaskRequest, error) {
	configSvc := NewConfigService(s.db)
	repos, _ := configSvc.GetEnabledRepositories()

	var tasks []dto.CreateScanTaskRequest

	// Per-repo tasks
	for _, repo := range repos {
		tasks = append(tasks, dto.CreateScanTaskRequest{
			Name:          repo.Name,
			Description:   ptrStr(fmt.Sprintf("手动同步仓库 %s 的提交记录", repo.Name)),
			TaskType:      "manual",
			ScanRangeType: "2weeks",
			RepositoryIDs: []string{repo.ID},
		})
	}

	// Common tasks
	tasks = append(tasks,
		dto.CreateScanTaskRequest{
			Name: "扫描近2周代码提交数据", Description: ptrStr("扫描最近2周的代码提交记录"),
			TaskType: "manual", ScanRangeType: "2weeks",
		},
		dto.CreateScanTaskRequest{
			Name: "扫描近1个月代码提交数据", Description: ptrStr("扫描最近1个月的代码提交记录"),
			TaskType: "manual", ScanRangeType: "1month",
		},
		dto.CreateScanTaskRequest{
			Name: "扫描近3个月代码提交数据", Description: ptrStr("扫描最近3个月的代码提交记录"),
			TaskType: "manual", ScanRangeType: "3months",
		},
		dto.CreateScanTaskRequest{
			Name: "扫描近6个月代码提交数据", Description: ptrStr("扫描最近6个月的代码提交记录"),
			TaskType: "manual", ScanRangeType: "6months",
		},
		dto.CreateScanTaskRequest{
			Name: "自定义时间范围扫描", Description: ptrStr("自定义指定时间范围扫描，最大支持6个月跨度"),
			TaskType: "manual", ScanRangeType: "custom",
		},
	)

	return tasks, nil
}

func (s *ScanTaskService) SyncDefaultRepositoryTasks() error {
	configSvc := NewConfigService(s.db)
	repos, err := configSvc.GetEnabledRepositories()
	if err != nil {
		return err
	}

	now := model.NowMs()
	for _, repo := range repos {
		idsJSON, _ := json.Marshal([]string{repo.ID})
		idsStr := string(idsJSON)

		var existing model.ScanTask
		err := s.db.Where("task_type = ? AND repository_ids = ?", "manual", idsStr).First(&existing).Error
		if err == gorm.ErrRecordNotFound {
			s.db.Create(&model.ScanTask{
				Name:           repo.Name,
				Description:    ptrStr(fmt.Sprintf("手动同步仓库 %s 的提交记录", repo.Name)),
				TaskType:       "manual",
				ScanRangeType:  "2weeks",
				RepositoryIDs:  &idsStr,
				Enabled:        true,
				CreatedAt:      now,
				UpdatedAt:      now,
			})
		} else if err == nil {
			s.db.Model(&existing).Updates(map[string]interface{}{
				"name":        repo.Name,
				"description": fmt.Sprintf("手动同步仓库 %s 的提交记录", repo.Name),
				"updated_at":  now,
			})
		}
	}

	// Clean up tasks for deleted/disabled repos
	var allTasks []model.ScanTask
	s.db.Where("task_type = ? AND repository_ids IS NOT NULL", "manual").Find(&allTasks)
	for _, task := range allTasks {
		if task.RepositoryIDs == nil {
			continue
		}
		var repoIDs []string
		json.Unmarshal([]byte(*task.RepositoryIDs), &repoIDs)
		if len(repoIDs) == 1 {
			found := false
			for _, repo := range repos {
				if repo.ID == repoIDs[0] {
					found = true
					break
				}
			}
			if !found {
				s.db.Delete(&task)
			}
		}
	}

	return nil
}

func (s *ScanTaskService) modelToResponse(m *model.ScanTask) *dto.ScanTaskResponse {
	var repoIDs []string
	if m.RepositoryIDs != nil {
		json.Unmarshal([]byte(*m.RepositoryIDs), &repoIDs)
	}
	return &dto.ScanTaskResponse{
		ID:              m.ID,
		Name:            m.Name,
		Description:     m.Description,
		TaskType:        m.TaskType,
		ScanRangeType:   m.ScanRangeType,
		StartDate:       m.StartDate,
		EndDate:         m.EndDate,
		CronExpression:  m.CronExpression,
		RepositoryIDs:   repoIDs,
		Enabled:         m.Enabled,
		LastExecuteTime: m.LastExecuteTime,
		SortOrder:       m.SortOrder,
		CreatedAt:       m.CreatedAt,
		UpdatedAt:       m.UpdatedAt,
	}
}

func ptrStr(s string) *string { return &s }
