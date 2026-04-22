package scheduler

import (
	"log/slog"
	"sync"
	"time"

	"github.com/huangjin/coding-history/golang-backend/internal/service"
	"github.com/robfig/cron/v3"
	"gorm.io/gorm"
)

type ScanScheduler struct {
	db   *gorm.DB
	cron *cron.Cron
	mu   sync.Mutex
}

func NewScanScheduler(db *gorm.DB) *ScanScheduler {
	loc := time.FixedZone("CST", 8*3600)
	return &ScanScheduler{
		db:   db,
		cron: cron.New(cron.WithLocation(loc)),
	}
}

func (s *ScanScheduler) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	taskSvc := service.NewScanTaskService(s.db)
	tasks, err := taskSvc.GetEnabledScheduledTasks()
	if err != nil {
		slog.Error("[定时任务] 加载数据库任务失败", "error", err)
		return err
	}

	if len(tasks) == 0 {
		slog.Warn("[定时任务] 未找到任何定时任务，调度器未启动")
		return nil
	}

	for _, task := range tasks {
		if task.CronExpression == nil || *task.CronExpression == "" {
			slog.Warn("[定时任务] 任务没有 Cron 表达式，跳过", "name", task.Name)
			continue
		}

		taskID := task.ID
		taskName := task.Name
		_, err := s.cron.AddFunc(*task.CronExpression, func() {
			slog.Info("[定时任务] 开始执行", "name", taskName)
			taskSvc := service.NewScanTaskService(s.db)
			t, err := taskSvc.GetTaskByID(taskID)
			if err != nil {
				slog.Error("[定时任务] 任务不存在", "id", taskID)
				return
			}
			if !t.Enabled {
				return
			}
			result := service.ExecuteScanTask(s.db, t, &t.ID)
			taskSvc.UpdateLastExecuteTime(t.ID, time.Now().UnixMilli())
			if result.Success {
				slog.Info("[定时任务] 执行成功", "name", taskName, "repos", len(result.ScannedRepositories), "commits", result.TotalCommits)
			} else {
				slog.Error("[定时任务] 执行失败", "name", taskName, "error", result.ErrorMessage)
			}
		})
		if err != nil {
			slog.Error("[定时任务] 注册任务失败", "name", task.Name, "cron", *task.CronExpression, "error", err)
			continue
		}
		slog.Info("[定时任务] 任务调度已启动", "name", task.Name, "cron", *task.CronExpression)
	}

	s.cron.Start()
	slog.Info("[定时任务] 调度器已启动")
	return nil
}

func (s *ScanScheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cron != nil {
		s.cron.Stop()
	}
	slog.Info("[定时任务] 调度器已停止")
}

func (s *ScanScheduler) Restart() {
	s.Stop()
	loc := time.FixedZone("CST", 8*3600)
	s.cron = cron.New(cron.WithLocation(loc))
	s.Start()
	slog.Info("[定时任务] 调度器已重启")
}
