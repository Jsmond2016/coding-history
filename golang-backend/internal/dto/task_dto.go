package dto

type TaskType = string
type ScanRangeType = string

const (
	TaskTypeManual    TaskType = "manual"
	TaskTypeScheduled TaskType = "scheduled"
)

const (
	ScanRange1Day    ScanRangeType = "1day"
	ScanRange3Days   ScanRangeType = "3days"
	ScanRange7Days   ScanRangeType = "7days"
	ScanRange2Weeks  ScanRangeType = "2weeks"
	ScanRange1Month  ScanRangeType = "1month"
	ScanRange3Months ScanRangeType = "3months"
	ScanRange6Months ScanRangeType = "6months"
	ScanRangeCustom  ScanRangeType = "custom"
)

type ScanTaskResponse struct {
	ID              int64    `json:"id"`
	Name            string   `json:"name"`
	Description     *string  `json:"description"`
	TaskType        string   `json:"taskType"`
	ScanRangeType   string   `json:"scanRangeType"`
	StartDate       *int64   `json:"startDate"`
	EndDate         *int64   `json:"endDate"`
	CronExpression  *string  `json:"cronExpression"`
	RepositoryIDs   []string `json:"repositoryIds"`
	Enabled         bool     `json:"enabled"`
	LastExecuteTime *int64   `json:"lastExecuteTime"`
	SortOrder       int      `json:"sortOrder"`
	CreatedAt       int64    `json:"createdAt"`
	UpdatedAt       int64    `json:"updatedAt"`
}

type CreateScanTaskRequest struct {
	Name           string   `json:"name" binding:"required,min=1"`
	Description    *string  `json:"description"`
	TaskType       string   `json:"taskType" binding:"required,oneof=manual scheduled"`
	ScanRangeType  string   `json:"scanRangeType" binding:"required,oneof=1day 3days 7days 2weeks 1month 3months 6months custom"`
	StartDate      *int64   `json:"startDate"`
	EndDate        *int64   `json:"endDate"`
	CronExpression *string  `json:"cronExpression"`
	RepositoryIDs  []string `json:"repositoryIds"`
	Enabled        *bool    `json:"enabled"`
}

type UpdateScanTaskRequest struct {
	Name           *string  `json:"name" binding:"omitempty,min=1"`
	Description    *string  `json:"description"`
	TaskType       *string  `json:"taskType" binding:"omitempty,oneof=manual scheduled"`
	ScanRangeType  *string  `json:"scanRangeType" binding:"omitempty,oneof=1day 3days 7days 2weeks 1month 3months 6months custom"`
	StartDate      *int64   `json:"startDate"`
	EndDate        *int64   `json:"endDate"`
	CronExpression *string  `json:"cronExpression"`
	RepositoryIDs  []string `json:"repositoryIds"`
	Enabled        *bool    `json:"enabled"`
}

type TriggerTaskRequest struct {
	RepositoryIDs []string `json:"repositoryIds"`
}

type BatchSortRequest struct {
	SortOrders []SortOrderItem `json:"sortOrders" binding:"required"`
}

type SortOrderItem struct {
	ID        int64 `json:"id"`
	SortOrder int   `json:"sortOrder"`
}
