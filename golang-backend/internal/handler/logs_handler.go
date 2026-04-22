package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/huangjin/coding-history/golang-backend/internal/service"
	"gorm.io/gorm"
)

type LogsHandler struct {
	logSvc *service.LogService
}

func NewLogsHandler(db *gorm.DB) *LogsHandler {
	return &LogsHandler{logSvc: service.NewLogService(db)}
}

func (h *LogsHandler) GetServerLogs(c *gin.Context) {
	params := h.parseLogQuery(c)
	result, err := h.logSvc.GetServerLogs(params)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, result)
}

func (h *LogsHandler) GetRequestLogs(c *gin.Context) {
	params := h.parseLogQuery(c)
	if v := c.Query("statusCode"); v != "" {
		n, _ := strconv.Atoi(v)
		params.StatusCode = &n
	}
	if v := c.Query("module"); v != "" {
		params.Module = &v
	}
	result, err := h.logSvc.GetRequestLogs(params)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, result)
}

func (h *LogsHandler) GetScheduledTaskLogs(c *gin.Context) {
	params := h.parseLogQuery(c)
	if v := c.Query("status"); v != "" {
		params.Status = &v
	}
	result, err := h.logSvc.GetScheduledTaskLogs(params)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, result)
}

func (h *LogsHandler) CleanLogs(c *gin.Context) {
	var req struct {
		Days int `json:"days"`
	}
	c.ShouldBindJSON(&req)
	if req.Days <= 0 {
		req.Days = 30
	}
	deleted, err := h.logSvc.CleanOldLogs(req.Days)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"message": "已清理旧日志", "deleted": deleted})
}

func (h *LogsHandler) parseLogQuery(c *gin.Context) service.LogQueryParams {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))

	var startTime, endTime *int64
	if v := c.Query("startTime"); v != "" {
		n, _ := strconv.ParseInt(v, 10, 64)
		startTime = &n
	}
	if v := c.Query("endTime"); v != "" {
		n, _ := strconv.ParseInt(v, 10, 64)
		endTime = &n
	}

	params := service.LogQueryParams{
		StartTime: startTime, EndTime: endTime,
		Page: page, PageSize: pageSize,
	}
	if v := c.Query("type"); v != "" {
		params.Type = &v
	}
	return params
}
