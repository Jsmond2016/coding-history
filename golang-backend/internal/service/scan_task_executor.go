package service

import (
	"fmt"
	"log/slog"
	"time"

	"github.com/huangjin/coding-history/golang-backend/internal/dto"
	"github.com/huangjin/coding-history/golang-backend/internal/githelper"
	"github.com/huangjin/coding-history/golang-backend/internal/model"
	"gorm.io/gorm"
)

type ScanTaskExecutionResult struct {
	Success            bool
	ScannedRepositories []string
	TotalCommits       int
	ErrorMessage       string
}

// ExecuteScanTask runs a full scan pipeline
func ExecuteScanTask(db *gorm.DB, task *dto.ScanTaskResponse, taskID *int64) *ScanTaskExecutionResult {
	result := &ScanTaskExecutionResult{Success: true}

	// Calculate date range
	fromDate, toDate, err := CalculateScanDateRange(task.ScanRangeType, task.StartDate, task.EndDate)
	if err != nil {
		slog.Error("[任务执行] 计算时间范围失败", "error", err)
		return &ScanTaskExecutionResult{ErrorMessage: err.Error()}
	}

	slog.Info("[任务执行] 开始执行任务", "name", task.Name)
	slog.Info("[任务执行] 扫描时间范围", "from", githelper.MsToISO(fromDate), "to", githelper.MsToISO(toDate))

	configSvc := NewConfigService(db)
	repoSvc := NewRepositoryService(db)
	commitSvc := NewCommitService(db)
	logSvc := NewLogService(db)

	allRepos, _ := configSvc.GetEnabledRepositories()
	var reposToScan []dto.EnabledRepository
	if len(task.RepositoryIDs) > 0 {
		for _, repo := range allRepos {
			for _, id := range task.RepositoryIDs {
				if repo.ID == id {
					reposToScan = append(reposToScan, repo)
					break
				}
			}
		}
	} else {
		reposToScan = allRepos
	}

	if len(reposToScan) == 0 {
		msg := "没有可扫描的仓库（请检查是否至少启用了一个仓库）"
		slog.Warn("[任务执行] " + msg)
		return &ScanTaskExecutionResult{ErrorMessage: msg}
	}

	for _, repo := range reposToScan {
		slog.Info("[任务执行] 扫描仓库", "name", repo.Name)

		authorEmails, err := configSvc.GetAuthorEmailsByRepoID(repo.ID)
		if err != nil || len(authorEmails) == 0 {
			slog.Warn("[任务执行] 仓库没有配置作者，跳过", "repo", repo.Name)
			continue
		}

		// Pull
		if githelper.CheckIsRepo(repo.Path) && githelper.HasRemotes(repo.Path) {
			if err := githelper.Pull(repo.Path); err != nil {
				slog.Warn("[任务执行] git pull 失败", "repo", repo.Name, "error", err)
			}
		}

		// Gap fill
		dbTip, _ := commitSvc.GetMaxCommitDateMsForRepo(repo.ID)
		effectiveFrom := ResolveScanFromDateWithGapFill(fromDate, dbTip, 365)
		if dbTip > 0 && effectiveFrom < fromDate {
			slog.Info("[任务执行] 库内最新早于任务窗口起点，前推", "repo", repo.Name,
				"original", githelper.MsToISO(fromDate), "adjusted", githelper.MsToISO(effectiveFrom))
		}

		// Scan
		scanner := NewGitScanService(repo.Path)
		commits, err := scanner.IncrementalScan(effectiveFrom, authorEmails, &toDate)
		if err != nil {
			errMsg := fmt.Sprintf("扫描仓库 %s 失败: %v", repo.Name, err)
			slog.Error("[任务执行] "+errMsg)
			result.Success = false
			if result.ErrorMessage == "" {
				result.ErrorMessage = errMsg
			} else {
				result.ErrorMessage += "; " + errMsg
			}
			continue
		}

		slog.Info("[任务执行] 发现提交记录", "count", len(commits), "repo", repo.Name)

		if len(commits) > 0 {
			insertResult, _ := commitSvc.BatchInsertCommits(repo.ID, commits)
			slog.Info("[任务执行] 入库完成", "inserted", insertResult.Inserted, "skipped", insertResult.Skipped)
			result.TotalCommits += insertResult.Inserted

			// Update repo info
			countResult, _ := commitSvc.GetCommits(struct {
				StartDate     int64
				EndDate       int64
				RepositoryIDs []string
				AuthorEmails  []string
				Page          int
				PageSize      int
			}{
				StartDate: 0, EndDate: model.NowMs(),
				RepositoryIDs: []string{repo.ID}, Page: 1, PageSize: 1,
			})
			repoSvc.UpdateScanInfo(repo.ID, model.NowMs(), countResult.Total)
		}

		result.ScannedRepositories = append(result.ScannedRepositories, repo.Name)
	}

	// Log result
	executeTime := model.NowMs()
	logSvc.CreateScheduledTaskLog(struct {
		TaskName       string
		CronExpression *string
		StartTime      int64
		EndTime        *int64
		Status         string
		Repositories   []string
		TotalCommits   int
		ErrorMessage   *string
		TaskID         *int64
	}{
		TaskName:       task.Name,
		CronExpression: task.CronExpression,
		StartTime:      executeTime,
		EndTime:        &executeTime,
		Status:         map[bool]string{true: "success", false: "failed"}[result.Success],
		Repositories:   result.ScannedRepositories,
		TotalCommits:   result.TotalCommits,
		TaskID:         taskID,
	})

	slog.Info("[任务执行] 任务执行完成", "name", task.Name, "success", result.Success, "commits", result.TotalCommits)
	return result
}

// CalculateScanDateRange maps scan range type to actual date range
func CalculateScanDateRange(scanRangeType string, startDate, endDate *int64) (fromMs, toMs int64, err error) {
	now := time.Now()
	toDate := time.Date(now.Year(), now.Month(), now.Day(), 23, 59, 59, 999999999, time.Local)
	var fromDate time.Time

	days := map[string]int{
		"1day": 1, "3days": 3, "7days": 7, "2weeks": 14,
		"1month": 30, "3months": 90, "6months": 180,
	}

	if d, ok := days[scanRangeType]; ok {
		fromDate = time.Date(now.Year(), now.Month(), now.Day()-d, 0, 0, 0, 0, time.Local)
		return fromDate.UnixMilli(), toDate.UnixMilli(), nil
	}

	if scanRangeType == "custom" {
		if startDate == nil || endDate == nil {
			return 0, 0, fmt.Errorf("自定义时间范围必须提供开始时间和结束时间")
		}
		fd := time.UnixMilli(*startDate)
		td := time.UnixMilli(*endDate)
		if !ValidateDateRange(fd, td) {
			return 0, 0, fmt.Errorf("时间范围无效")
		}
		fd = time.Date(fd.Year(), fd.Month(), fd.Day(), 0, 0, 0, 0, time.Local)
		td = time.Date(td.Year(), td.Month(), td.Day(), 23, 59, 59, 999999999, time.Local)
		return fd.UnixMilli(), td.UnixMilli(), nil
	}

	return 0, 0, fmt.Errorf("不支持的扫描范围类型: %s", scanRangeType)
}

func ValidateDateRange(start, end time.Time) bool {
	if !start.Before(end) {
		return false
	}
	maxSpan := 180 * 24 * time.Hour
	return end.Sub(start) <= maxSpan
}
