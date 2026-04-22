package dto

type UpdateDataMetricsRequest struct {
	Thresholds   map[string]int    `json:"thresholds" binding:"required"`
	OvertimeHour int               `json:"overtimeHour" binding:"min=0,max=23"`
	Labels       map[string]string `json:"labels" binding:"required"`
	Colors       map[string]string `json:"colors" binding:"required"`
}

type DataMetricsConfigResponse struct {
	ID           int64             `json:"id"`
	Thresholds   map[string]int    `json:"thresholds"`
	OvertimeHour int               `json:"overtimeHour"`
	Labels       map[string]string `json:"labels"`
	Colors       map[string]string `json:"colors"`
	CreatedAt    int64             `json:"createdAt"`
	UpdatedAt    int64             `json:"updatedAt"`
}

type BackupConfig struct {
	BackupDir  string  `json:"backupDir"`
	BackupCron *string `json:"backupCron"`
}

type UpdateBackupConfigRequest struct {
	BackupDir  *string `json:"backupDir" binding:"omitempty,min=1"`
	BackupCron *string `json:"backupCron"`
}
