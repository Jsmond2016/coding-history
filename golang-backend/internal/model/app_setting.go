package model

type AppSetting struct {
	Key       string `gorm:"primaryKey" json:"key"`
	Value     string `gorm:"not null" json:"value"`
	UpdatedAt int64  `gorm:"column:updated_at" json:"updatedAt"`
}

func (AppSetting) TableName() string { return "app_settings" }
