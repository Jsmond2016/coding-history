package handler

import (
	"log/slog"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/huangjin/coding-history/golang-backend/internal/dto"
	"github.com/huangjin/coding-history/golang-backend/internal/scheduler"
	"github.com/huangjin/coding-history/golang-backend/internal/service"
	"gorm.io/gorm"
)

type TasksHandler struct {
	db         *gorm.DB
	taskSvc    *service.ScanTaskService
	scheduler  *scheduler.ScanScheduler
}

func NewTasksHandler(db *gorm.DB, s *scheduler.ScanScheduler) *TasksHandler {
	return &TasksHandler{
		db:        db,
		taskSvc:   service.NewScanTaskService(db),
		scheduler: s,
	}
}

func (h *TasksHandler) GetAll(c *gin.Context) {
	h.taskSvc.SyncDefaultRepositoryTasks()
	tasks, err := h.taskSvc.GetAllTasks()
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, tasks)
}

func (h *TasksHandler) GetDefaultTasks(c *gin.Context) {
	tasks, err := h.taskSvc.GetDefaultTasks()
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, tasks)
}

func (h *TasksHandler) GetByID(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid task ID"})
		return
	}
	task, err := h.taskSvc.GetTaskByID(id)
	if err != nil {
		c.JSON(404, gin.H{"error": "Task not found"})
		return
	}
	c.JSON(200, task)
}

func (h *TasksHandler) Create(c *gin.Context) {
	var req dto.CreateScanTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	if req.ScanRangeType == "custom" && (req.StartDate == nil || req.EndDate == nil) {
		c.JSON(400, gin.H{"error": "自定义时间范围必须提供开始时间和结束时间"})
		return
	}
	if req.TaskType == "scheduled" && (req.CronExpression == nil || *req.CronExpression == "") {
		c.JSON(400, gin.H{"error": "定时任务必须提供 Cron 表达式"})
		return
	}

	task, err := h.taskSvc.CreateTask(&req)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	if task.Enabled && task.TaskType == "scheduled" {
		h.scheduler.Restart()
		slog.Info("[创建任务] 定时任务已创建，调度器已重启", "name", task.Name)
	}

	c.JSON(201, task)
}

func (h *TasksHandler) Update(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid task ID"})
		return
	}

	var req dto.UpdateScanTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	task, err := h.taskSvc.UpdateTask(id, &req)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	if task.TaskType == "scheduled" {
		h.scheduler.Restart()
	}

	c.JSON(200, task)
}

func (h *TasksHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid task ID"})
		return
	}

	task, _ := h.taskSvc.GetTaskByID(id)
	h.taskSvc.DeleteTask(id)

	if task != nil && task.TaskType == "scheduled" {
		h.scheduler.Restart()
	}

	c.JSON(200, gin.H{"message": "Task deleted successfully"})
}

func (h *TasksHandler) Enable(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid task ID"})
		return
	}

	task, err := h.taskSvc.EnableTask(id)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	if task.TaskType == "scheduled" {
		h.scheduler.Restart()
	}

	c.JSON(200, task)
}

func (h *TasksHandler) Disable(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid task ID"})
		return
	}

	task, err := h.taskSvc.DisableTask(id)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	if task.TaskType == "scheduled" {
		h.scheduler.Restart()
	}

	c.JSON(200, task)
}

func (h *TasksHandler) Trigger(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid task ID"})
		return
	}

	task, err := h.taskSvc.GetTaskByID(id)
	if err != nil {
		c.JSON(404, gin.H{"error": "Task not found"})
		return
	}

	var req dto.TriggerTaskRequest
	c.ShouldBindJSON(&req)
	if len(req.RepositoryIDs) > 0 {
		task.RepositoryIDs = req.RepositoryIDs
	}

	go func() {
		taskID := task.ID
		service.ExecuteScanTask(h.db, task, &taskID)
		h.taskSvc.UpdateLastExecuteTime(id, 0)
	}()

	c.JSON(200, gin.H{
		"message":  "Task triggered successfully",
		"taskId":   id,
		"taskName": task.Name,
	})
}

func (h *TasksHandler) BatchSort(c *gin.Context) {
	var req dto.BatchSortRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "sortOrders must be an array"})
		return
	}

	h.taskSvc.BatchUpdateSortOrder(req.SortOrders)
	c.JSON(200, gin.H{"message": "Sort order updated successfully", "count": len(req.SortOrders)})
}
