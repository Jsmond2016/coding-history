package model

type RequestLog struct {
	ID           int64   `gorm:"primaryKey;autoIncrement" json:"id"`
	Method       string  `gorm:"not null;index:idx_request_log_method_time" json:"method"`
	URL          string  `gorm:"not null" json:"url"`
	RouteName    *string `gorm:"column:route_name" json:"routeName"`
	Module       *string `json:"module"`
	StatusCode   int     `gorm:"column:status_code;index:idx_request_log_status_time" json:"statusCode"`
	RequestBody  *string `gorm:"column:request_body" json:"requestBody"`
	ResponseBody *string `gorm:"column:response_body" json:"responseBody"`
	Duration     int     `json:"duration"`
	Timestamp    int64   `gorm:"not null;index:idx_request_log_method_time;index:idx_request_log_status_time;index:idx_request_log_time" json:"timestamp"`
	CreatedAt    int64   `gorm:"column:created_at" json:"createdAt"`
}

func (RequestLog) TableName() string { return "request_logs" }
