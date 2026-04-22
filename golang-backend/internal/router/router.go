package router

import (
	"github.com/gin-gonic/gin"
	"github.com/huangjin/coding-history/golang-backend/internal/config"
	"github.com/huangjin/coding-history/golang-backend/internal/handler"
	"github.com/huangjin/coding-history/golang-backend/internal/middleware"
	"github.com/huangjin/coding-history/golang-backend/internal/scheduler"
	"gorm.io/gorm"
)

func SetupRouter(db *gorm.DB, cfg *config.Config, scanScheduler *scheduler.ScanScheduler, backupScheduler *scheduler.DBBackupScheduler) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()

	// Middleware
	r.Use(middleware.ErrorRecovery())
	r.Use(middleware.CORS())
	r.Use(middleware.RequestLogger(db))

	// Health check
	healthHandler := handler.NewHealthHandler()
	r.GET("/health", healthHandler.Check)

	// API v1 group
	v1 := r.Group("/api/v1")

	// Repositories
	reposHandler := handler.NewRepositoriesHandler(db)
	repos := v1.Group("/repositories")
	{
		repos.GET("/", reposHandler.GetAll)
		repos.GET("/authors", reposHandler.GetAuthors)
		repos.GET("/scan/status", reposHandler.GetScanStatus)
		repos.POST("/scan", reposHandler.TriggerScan)
		repos.GET("/:id", reposHandler.GetByID)
	}

	// Commits
	commitsHandler := handler.NewCommitsHandler(db)
	commits := v1.Group("/commits")
	{
		commits.GET("/by-date", commitsHandler.GetCommitsByDate)
		commits.GET("/", commitsHandler.GetCommits)
	}

	// Statistics
	statsHandler := handler.NewStatisticsHandler(db)
	v1.GET("/statistics", statsHandler.GetStatistics)

	// Logs
	logsHandler := handler.NewLogsHandler(db)
	logs := v1.Group("/logs")
	{
		logs.GET("/server", logsHandler.GetServerLogs)
		logs.GET("/request", logsHandler.GetRequestLogs)
		logs.GET("/scheduled-task", logsHandler.GetScheduledTaskLogs)
		logs.POST("/clean", logsHandler.CleanLogs)
	}

	// Tasks
	tasksHandler := handler.NewTasksHandler(db, scanScheduler)
	tasks := v1.Group("/tasks")
	{
		tasks.GET("/", tasksHandler.GetAll)
		tasks.GET("/default", tasksHandler.GetDefaultTasks)
		tasks.GET("/:id", tasksHandler.GetByID)
		tasks.POST("/", tasksHandler.Create)
		tasks.PUT("/:id", tasksHandler.Update)
		tasks.DELETE("/:id", tasksHandler.Delete)
		tasks.POST("/:id/enable", tasksHandler.Enable)
		tasks.POST("/:id/disable", tasksHandler.Disable)
		tasks.POST("/:id/trigger", tasksHandler.Trigger)
		tasks.POST("/batch-sort", tasksHandler.BatchSort)
	}

	// Config
	configHandler := handler.NewConfigHandler(db, cfg, backupScheduler)
	conf := v1.Group("/config")
	{
		conf.POST("/scan-directory", configHandler.ScanDirectory)
		conf.GET("/repositories", configHandler.GetRepositories)
		conf.POST("/repositories/batch", configHandler.BatchCreateRepositories)
		conf.POST("/repositories", configHandler.CreateRepository)
		conf.PUT("/repositories/:id", configHandler.UpdateRepository)
		conf.DELETE("/repositories/:id", configHandler.DeleteRepository)
		conf.POST("/repositories/batch-delete", configHandler.BatchDeleteRepositories)
		conf.GET("/repositories/:id/authors", configHandler.GetAuthors)
		conf.POST("/repositories/:id/authors", configHandler.CreateAuthor)
		conf.DELETE("/repositories/:id/authors/:authorId", configHandler.DeleteAuthor)
		conf.GET("/data-metrics", configHandler.GetDataMetrics)
		conf.PUT("/data-metrics", configHandler.UpdateDataMetrics)
		conf.POST("/database/backup", configHandler.BackupDatabase)
		conf.GET("/backup-config", configHandler.GetBackupConfig)
		conf.PUT("/backup-config", configHandler.UpdateBackupConfig)
	}

	return r
}
