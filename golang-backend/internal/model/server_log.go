package model

type ServerLog struct {
	ID         int64  `gorm:"primaryKey;autoIncrement" json:"id"`
	Type       string `gorm:"not null;index:idx_server_log_type_time" json:"type"`
	Message    string `gorm:"not null" json:"message"`
	ErrorStack *string `gorm:"column:error_stack" json:"errorStack"`
	Timestamp  int64  `gorm:"not null;index:idx_server_log_type_time;index:idx_server_log_time" json:"timestamp"`
	CreatedAt  int64  `gorm:"column:created_at" json:"createdAt"`
}

func (ServerLog) TableName() string { return "server_logs" }
