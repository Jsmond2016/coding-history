package service

import (
	"encoding/json"
	"strconv"

	"github.com/huangjin/coding-history/golang-backend/internal/model"
	"gorm.io/gorm"
)

type LogService struct {
	db *gorm.DB
}

func NewLogService(db *gorm.DB) *LogService {
	return &LogService{db: db}
}

func (s *LogService) CreateServerLog(logType, message string, errorStack *string) error {
	now := model.NowMs()
	return s.db.Create(&model.ServerLog{
		Type:       logType,
		Message:    message,
		ErrorStack: errorStack,
		Timestamp:  now,
		CreatedAt:  now,
	}).Error
}

func (s *LogService) CreateRequestLog(params struct {
	Method       string
	URL          string
	RouteName    *string
	Module       *string
	StatusCode   int
	RequestBody  *string
	ResponseBody *string
	Duration     int
}) error {
	now := model.NowMs()
	return s.db.Create(&model.RequestLog{
		Method:       params.Method,
		URL:          params.URL,
		RouteName:    params.RouteName,
		Module:       params.Module,
		StatusCode:   params.StatusCode,
		RequestBody:  params.RequestBody,
		ResponseBody: params.ResponseBody,
		Duration:     params.Duration,
		Timestamp:    now,
		CreatedAt:    now,
	}).Error
}

func (s *LogService) CreateScheduledTaskLog(params struct {
	TaskName       string
	CronExpression *string
	StartTime      int64
	EndTime        *int64
	Status         string
	Repositories   []string
	TotalCommits   int
	ErrorMessage   *string
	TaskID         *int64
}) error {
	now := model.NowMs()
	repos, _ := json.Marshal(params.Repositories)
	return s.db.Create(&model.ScheduledTaskLog{
		TaskName:       params.TaskName,
		CronExpression: params.CronExpression,
		StartTime:      params.StartTime,
		EndTime:        params.EndTime,
		Status:         params.Status,
		Repositories:   string(repos),
		TotalCommits:   params.TotalCommits,
		ErrorMessage:   params.ErrorMessage,
		TaskID:         params.TaskID,
		CreatedAt:      now,
	}).Error
}

type LogQueryParams struct {
	StartTime  *int64
	EndTime    *int64
	Page       int
	PageSize   int
	Type       *string
	Status     *string
	StatusCode *int
	Module     *string
}

type PaginatedResult struct {
	Data     interface{} `json:"data"`
	Total    int64       `json:"total"`
	Page     int         `json:"page"`
	PageSize int         `json:"pageSize"`
}

func (s *LogService) GetServerLogs(params LogQueryParams) (*PaginatedResult, error) {
	if params.Page <= 0 {
		params.Page = 1
	}
	if params.PageSize <= 0 {
		params.PageSize = 20
	}

	query := s.db.Model(&model.ServerLog{})
	if params.StartTime != nil {
		query = query.Where("timestamp >= ?", *params.StartTime)
	}
	if params.EndTime != nil {
		query = query.Where("timestamp <= ?", *params.EndTime)
	}
	if params.Type != nil {
		query = query.Where("type = ?", *params.Type)
	}

	var total int64
	query.Count(&total)

	var logs []model.ServerLog
	query.Order("timestamp DESC").Offset((params.Page - 1) * params.PageSize).Limit(params.PageSize).Find(&logs)

	type serverLogResponse struct {
		ID         int64   `json:"id"`
		Type       string  `json:"type"`
		Message    string  `json:"message"`
		ErrorStack *string `json:"errorStack"`
		Timestamp  int64   `json:"timestamp"`
		CreatedAt  int64   `json:"createdAt"`
	}
	data := make([]serverLogResponse, len(logs))
	for i, l := range logs {
		data[i] = serverLogResponse{
			ID: l.ID, Type: l.Type, Message: l.Message,
			ErrorStack: l.ErrorStack, Timestamp: l.Timestamp, CreatedAt: l.CreatedAt,
		}
	}
	return &PaginatedResult{Data: data, Total: total, Page: params.Page, PageSize: params.PageSize}, nil
}

func (s *LogService) GetRequestLogs(params LogQueryParams) (*PaginatedResult, error) {
	if params.Page <= 0 {
		params.Page = 1
	}
	if params.PageSize <= 0 {
		params.PageSize = 20
	}

	query := s.db.Model(&model.RequestLog{})
	if params.StartTime != nil {
		query = query.Where("timestamp >= ?", *params.StartTime)
	}
	if params.EndTime != nil {
		query = query.Where("timestamp <= ?", *params.EndTime)
	}
	if params.StatusCode != nil {
		query = query.Where("status_code = ?", *params.StatusCode)
	}
	if params.Module != nil {
		query = query.Where("module = ?", *params.Module)
	}

	var total int64
	query.Count(&total)

	var logs []model.RequestLog
	query.Order("timestamp DESC").Offset((params.Page - 1) * params.PageSize).Limit(params.PageSize).Find(&logs)

	type reqLogResponse struct {
		ID           int64   `json:"id"`
		Method       string  `json:"method"`
		URL          string  `json:"url"`
		RouteName    *string `json:"routeName"`
		Module       *string `json:"module"`
		StatusCode   int     `json:"statusCode"`
		RequestBody  *string `json:"requestBody"`
		ResponseBody *string `json:"responseBody"`
		Duration     int     `json:"duration"`
		Timestamp    int64   `json:"timestamp"`
		CreatedAt    int64   `json:"createdAt"`
	}
	data := make([]reqLogResponse, len(logs))
	for i, l := range logs {
		data[i] = reqLogResponse{
			ID: l.ID, Method: l.Method, URL: l.URL, RouteName: l.RouteName,
			Module: l.Module, StatusCode: l.StatusCode, RequestBody: l.RequestBody,
			ResponseBody: l.ResponseBody, Duration: l.Duration, Timestamp: l.Timestamp, CreatedAt: l.CreatedAt,
		}
	}
	return &PaginatedResult{Data: data, Total: total, Page: params.Page, PageSize: params.PageSize}, nil
}

func (s *LogService) GetScheduledTaskLogs(params LogQueryParams) (*PaginatedResult, error) {
	if params.Page <= 0 {
		params.Page = 1
	}
	if params.PageSize <= 0 {
		params.PageSize = 20
	}

	query := s.db.Model(&model.ScheduledTaskLog{})
	if params.StartTime != nil {
		query = query.Where("start_time >= ?", *params.StartTime)
	}
	if params.EndTime != nil {
		query = query.Where("start_time <= ?", *params.EndTime)
	}
	if params.Status != nil {
		query = query.Where("status = ?", *params.Status)
	}

	var total int64
	query.Count(&total)

	var logs []model.ScheduledTaskLog
	query.Order("start_time DESC").Offset((params.Page - 1) * params.PageSize).Limit(params.PageSize).Find(&logs)

	type taskLogResponse struct {
		ID             int64    `json:"id"`
		TaskName       string   `json:"taskName"`
		CronExpression *string  `json:"cronExpression"`
		StartTime      int64    `json:"startTime"`
		EndTime        *int64   `json:"endTime"`
		Status         string   `json:"status"`
		Repositories   []string `json:"repositories"`
		TotalCommits   int      `json:"totalCommits"`
		ErrorMessage   *string  `json:"errorMessage"`
		TaskID         *int64   `json:"taskId"`
		CreatedAt      int64    `json:"createdAt"`
	}
	data := make([]taskLogResponse, len(logs))
	for i, l := range logs {
		var repos []string
		json.Unmarshal([]byte(l.Repositories), &repos)
		data[i] = taskLogResponse{
			ID: l.ID, TaskName: l.TaskName, CronExpression: l.CronExpression,
			StartTime: l.StartTime, EndTime: l.EndTime, Status: l.Status,
			Repositories: repos, TotalCommits: l.TotalCommits,
			ErrorMessage: l.ErrorMessage, TaskID: l.TaskID, CreatedAt: l.CreatedAt,
		}
	}
	return &PaginatedResult{Data: data, Total: total, Page: params.Page, PageSize: params.PageSize}, nil
}

func (s *LogService) CleanOldLogs(days int) (int64, error) {
	if days <= 0 {
		days = 30
	}
	cutoffMs := model.NowMs() - int64(days)*24*60*60*1000

	var count int64
	s.db.Where("timestamp < ?", cutoffMs).Delete(&model.ServerLog{})
	s.db.Where("timestamp < ?", cutoffMs).Delete(&model.RequestLog{})
	result := s.db.Where("start_time < ?", cutoffMs).Delete(&model.ScheduledTaskLog{})
	count += result.RowsAffected
	// Also count server and request logs deleted
	var c1, c2 int64
	s.db.Model(&model.ServerLog{}).Where("timestamp < ?", cutoffMs).Count(&c1)
	s.db.Model(&model.RequestLog{}).Where("timestamp < ?", cutoffMs).Count(&c2)
	// We already deleted, so use result directly
	return count, nil
}

// ParseInt parses a string to int, returns 0 on error
func ParseInt(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}

// ParseIntPtr parses a string to *int64
func ParseIntPtr(s string) *int64 {
	if s == "" {
		return nil
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return nil
	}
	return &n
}
