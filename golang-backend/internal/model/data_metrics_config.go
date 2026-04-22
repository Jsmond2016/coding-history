package model

type DataMetricsConfig struct {
	ID           int64  `gorm:"primaryKey;autoIncrement" json:"id"`
	Thresholds   string `gorm:"not null" json:"thresholds"`
	OvertimeHour int    `gorm:"not null" json:"overtimeHour"`
	Labels       string `gorm:"not null" json:"labels"`
	Colors       string `gorm:"not null" json:"colors"`
	CreatedAt    int64  `gorm:"column:created_at" json:"createdAt"`
	UpdatedAt    int64  `gorm:"column:updated_at" json:"updatedAt"`
}

func (DataMetricsConfig) TableName() string { return "data_metrics_config" }
