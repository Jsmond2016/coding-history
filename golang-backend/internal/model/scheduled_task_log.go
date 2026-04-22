package model

type ScheduledTaskLog struct {
	ID             int64   `gorm:"primaryKey;autoIncrement" json:"id"`
	TaskName       string  `gorm:"column:task_name;not null" json:"taskName"`
	CronExpression *string `gorm:"column:cron_expression" json:"cronExpression"`
	StartTime      int64   `gorm:"column:start_time;not null;index:idx_task_log_status_time;index:idx_task_log_time" json:"startTime"`
	EndTime        *int64  `gorm:"column:end_time" json:"endTime"`
	Status         string  `gorm:"not null;index:idx_task_log_status_time" json:"status"`
	Repositories   string  `gorm:"not null" json:"repositories"`
	TotalCommits   int     `gorm:"column:total_commits;default:0" json:"totalCommits"`
	ErrorMessage   *string `gorm:"column:error_message" json:"errorMessage"`
	TaskID         *int64  `gorm:"column:task_id;index:idx_task_log_task_id" json:"taskId"`
	CreatedAt      int64   `gorm:"column:created_at" json:"createdAt"`
}

func (ScheduledTaskLog) TableName() string { return "scheduled_task_logs" }
