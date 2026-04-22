package model

type ScanTask struct {
	ID              int64   `gorm:"primaryKey;autoIncrement" json:"id"`
	Name            string  `gorm:"not null" json:"name"`
	Description     *string `json:"description"`
	TaskType        string  `gorm:"column:task_type;not null;index:idx_scan_task_type_enabled" json:"taskType"`
	ScanRangeType   string  `gorm:"column:scan_range_type;not null" json:"scanRangeType"`
	StartDate       *int64  `gorm:"column:start_date" json:"startDate"`
	EndDate         *int64  `gorm:"column:end_date" json:"endDate"`
	CronExpression  *string `gorm:"column:cron_expression" json:"cronExpression"`
	RepositoryIDs   *string `gorm:"column:repository_ids" json:"repositoryIds"`
	Enabled         bool    `gorm:"default:true;index:idx_scan_task_type_enabled;index:idx_scan_task_enabled" json:"enabled"`
	LastExecuteTime *int64  `gorm:"column:last_execute_time" json:"lastExecuteTime"`
	SortOrder       int     `gorm:"column:sort_order;default:0;index:idx_scan_task_sort_order" json:"sortOrder"`
	CreatedAt       int64   `gorm:"column:created_at" json:"createdAt"`
	UpdatedAt       int64   `gorm:"column:updated_at" json:"updatedAt"`
}

func (ScanTask) TableName() string { return "scan_tasks" }
