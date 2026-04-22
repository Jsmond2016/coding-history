package dto

type LogsQuery struct {
	StartTime  string `form:"startTime"`
	EndTime    string `form:"endTime"`
	Page       string `form:"page"`
	PageSize   string `form:"pageSize"`
	Type       string `form:"type"`
	Status     string `form:"status"`
	StatusCode string `form:"statusCode"`
	Module     string `form:"module"`
}

type CleanLogsRequest struct {
	Days int `json:"days"`
}
