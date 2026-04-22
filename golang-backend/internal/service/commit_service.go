package service

import (
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"time"

	"github.com/huangjin/coding-history/golang-backend/internal/dto"
	"github.com/huangjin/coding-history/golang-backend/internal/githelper"
	"github.com/huangjin/coding-history/golang-backend/internal/model"
	"github.com/huangjin/coding-history/golang-backend/internal/workstatus"
	"gorm.io/gorm"
)

type CommitService struct {
	db                 *gorm.DB
	dataMetricsConfigSvc *DataMetricsConfigService
}

func NewCommitService(db *gorm.DB) *CommitService {
	return &CommitService{
		db:                 db,
		dataMetricsConfigSvc: NewDataMetricsConfigService(db),
	}
}

func (s *CommitService) GetMaxCommitDateMsForRepo(repoID string) (int64, error) {
	var maxDate *int64
	err := s.db.Model(&model.Commit{}).Where("repo_id = ?", repoID).Select("MAX(commit_date)").Scan(&maxDate).Error
	if err != nil {
		return 0, err
	}
	if maxDate == nil {
		return 0, nil
	}
	return *maxDate, nil
}

func (s *CommitService) GetCommitDateRangeForRepo(repoID string) (*dto.CommitDateRange, error) {
	type result struct {
		MinDate *int64
		MaxDate *int64
	}
	var r result
	err := s.db.Model(&model.Commit{}).Where("repo_id = ?", repoID).
		Select("MIN(commit_date) as min_date, MAX(commit_date) as max_date").Scan(&r).Error
	if err != nil {
		return nil, err
	}
	if r.MinDate == nil || r.MaxDate == nil {
		return nil, nil
	}
	return &dto.CommitDateRange{Earliest: *r.MinDate, Latest: *r.MaxDate}, nil
}

type BatchInsertResult struct {
	Inserted int
	Skipped  int
}

func (s *CommitService) BatchInsertCommits(repoID string, commits []githelper.ScannedCommit) (*BatchInsertResult, error) {
	if len(commits) == 0 {
		return &BatchInsertResult{}, nil
	}

	now := model.NowMs()

	// Get unique hashes
	hashSet := make(map[string]bool)
	for _, c := range commits {
		hashSet[c.Hash] = true
	}
	hashes := make([]string, 0, len(hashSet))
	for h := range hashSet {
		hashes = append(hashes, h)
	}

	// Check existing
	var existing []model.Commit
	s.db.Where("repo_id = ? AND commit_hash IN ?", repoID, hashes).
		Select("commit_hash").Find(&existing)
	existingSet := make(map[string]bool)
	for _, e := range existing {
		existingSet[e.CommitHash] = true
	}

	// Filter out duplicates, dedup by hash (prefer first occurrence)
	byHash := make(map[string]githelper.ScannedCommit)
	for _, c := range commits {
		if existingSet[c.Hash] {
			continue
		}
		if _, ok := byHash[c.Hash]; !ok {
			byHash[c.Hash] = c
		}
	}

	if len(byHash) == 0 {
		return &BatchInsertResult{Inserted: 0, Skipped: len(commits)}, nil
	}

	// Batch create
	toInsert := make([]model.Commit, 0, len(byHash))
	for _, c := range byHash {
		branch := branchForDB(c.Branch)
		toInsert = append(toInsert, model.Commit{
			RepoID:       repoID,
			CommitHash:   c.Hash,
			AuthorName:   c.AuthorName,
			AuthorEmail:  c.AuthorEmail,
			CommitDate:   c.Date,
			Message:      c.Message,
			FilesChanged: c.FilesChanged,
			Insertions:   c.Insertions,
			Deletions:    c.Deletions,
			Branch:       branch,
			CreatedAt:    now,
		})
	}

	inserted := 0
	// Try batch insert
	err := s.db.CreateInBatches(toInsert, 100).Error
	if err != nil {
		slog.Warn("Batch insert failed, trying individual inserts", "error", err)
		for _, commit := range toInsert {
			if err := s.db.Create(&commit).Error; err != nil {
				slog.Debug("Skipped duplicate commit", "hash", commit.CommitHash)
			} else {
				inserted++
			}
		}
	} else {
		inserted = len(toInsert)
	}

	return &BatchInsertResult{Inserted: inserted, Skipped: len(commits) - inserted}, nil
}

func branchForDB(branch string) *string {
	if branch == "" || branch == "release" || branch == "master" {
		return nil
	}
	return &branch
}

func (s *CommitService) GetCommitsByDate(params struct {
	StartDate     int64
	EndDate       int64
	RepositoryIDs []string
	AuthorEmails  []string
	IsOvertime    *bool
}) (*dto.CommitsByDateResponse, error) {
	query := s.db.Model(&model.Commit{}).
		Where("commit_date >= ? AND commit_date <= ?", params.StartDate, params.EndDate)

	if len(params.RepositoryIDs) > 0 {
		query = query.Where("repo_id IN ?", params.RepositoryIDs)
	}
	if len(params.AuthorEmails) > 0 {
		query = query.Where("author_email IN ?", params.AuthorEmails)
	}

	var commits []struct {
		model.Commit
		RepoName string
	}
	query = query.Select("commits.*, repositories.name as repo_name").
		Joins("LEFT JOIN repositories ON commits.repo_id = repositories.id").
		Order("commit_date DESC")
	if err := query.Find(&commits).Error; err != nil {
		return nil, err
	}

	// Get work status config
	wsConfig, err := s.dataMetricsConfigSvc.GetWorkStatusConfig()
	if err != nil {
		wsConfig = &workstatus.DefaultConfig
	}

	// Map commits with overtime info
	commitsWithOvertime := make([]dto.CommitWithOvertime, len(commits))
	for i, c := range commits {
		isOT := workstatus.IsOvertime(c.CommitDate, wsConfig.OvertimeHour)
		var otTimes []string
		if isOT {
			otTimes = []string{workstatus.FormatTime(c.CommitDate)}
		}
		commitsWithOvertime[i] = dto.CommitWithOvertime{
			ID:                  c.ID,
			RepoID:             c.RepoID,
			RepoName:           c.RepoName,
			CommitHash:         c.CommitHash,
			AuthorName:         c.AuthorName,
			AuthorEmail:        c.AuthorEmail,
			CommitDate:         c.CommitDate,
			Message:            c.Message,
			FilesChanged:       c.FilesChanged,
			Insertions:         c.Insertions,
			Deletions:          c.Deletions,
			Branch:             c.Branch,
			CreatedAt:          c.CreatedAt,
			IsOvertime:         isOT,
			OvertimeCommitTimes: otTimes,
		}
	}

	// Group by date, dedup same commit in same day
	type dateKey struct {
		date string
		key  string // repoId:commitHash
	}
	dateMap := make(map[string][]dto.CommitWithOvertime)
	seenMap := make(map[dateKey]bool)

	for _, commit := range commitsWithOvertime {
		date := msToDateStr(commit.CommitDate)
		key := dateKey{date: date, key: commit.RepoID + ":" + commit.CommitHash}
		if seenMap[key] {
			continue
		}
		seenMap[key] = true
		dateMap[date] = append(dateMap[date], commit)
	}

	// Build result
	var result []dto.CommitsByDate
	for date, dayCommits := range dateMap {
		var overtimeCommits []dto.CommitWithOvertime
		for _, c := range dayCommits {
			if c.IsOvertime {
				overtimeCommits = append(overtimeCommits, c)
			}
		}

		// Latest overtime times (up to 5)
		var overtimeTimes []string
		sort.Slice(overtimeCommits, func(i, j int) bool {
			return overtimeCommits[i].CommitDate > overtimeCommits[j].CommitDate
		})
		for i, c := range overtimeCommits {
			if i >= 5 {
				break
			}
			if len(c.OvertimeCommitTimes) > 0 {
				overtimeTimes = append(overtimeTimes, c.OvertimeCommitTimes[0])
			}
		}

		// Sort commits by date desc
		sort.Slice(dayCommits, func(i, j int) bool {
			return dayCommits[i].CommitDate > dayCommits[j].CommitDate
		})

		hasRelease := false
		repoSet := make(map[string]bool)
		branchSet := make(map[string]bool)
		for _, c := range dayCommits {
			msgLower := strings.ToLower(c.Message)
			if strings.Contains(msgLower, "chore(release)") || strings.Contains(msgLower, "chore: release") {
				hasRelease = true
			}
			repoSet[c.RepoName] = true
			if c.Branch != nil && *c.Branch != "" {
				branchSet[*c.Branch] = true
			}
		}

		repos := make([]string, 0, len(repoSet))
		for r := range repoSet {
			repos = append(repos, r)
		}
		sort.Strings(repos)

		branches := make([]string, 0, len(branchSet))
		for b := range branchSet {
			branches = append(branches, b)
		}
		sort.Strings(branches)

		ws := workstatus.CalculateWorkStatus(len(dayCommits), len(overtimeCommits) > 0, *wsConfig)

		result = append(result, dto.CommitsByDate{
			Date:                  date,
			Commits:               dayCommits,
			TotalCommits:          len(dayCommits),
			OvertimeCount:         len(overtimeCommits),
			LatestOvertimeCommits: overtimeTimes,
			WorkStatus:            ws,
			HasRelease:            hasRelease,
			Repositories:          repos,
			Branches:              branches,
		})
	}

	// Sort by date desc
	sort.Slice(result, func(i, j int) bool {
		return result[i].Date > result[j].Date
	})

	// Filter by isOvertime if specified
	if params.IsOvertime != nil {
		filtered := make([]dto.CommitsByDate, 0)
		for _, d := range result {
			if *params.IsOvertime {
				if d.OvertimeCount > 0 {
					filtered = append(filtered, d)
				}
			} else {
				if d.OvertimeCount == 0 {
					filtered = append(filtered, d)
				}
			}
		}
		result = filtered
	}

	totalCommits := 0
	for _, d := range result {
		totalCommits += d.TotalCommits
	}

	return &dto.CommitsByDateResponse{Data: result, Total: totalCommits}, nil
}

func (s *CommitService) GetCommits(params struct {
	StartDate     int64
	EndDate       int64
	RepositoryIDs []string
	AuthorEmails  []string
	Page          int
	PageSize      int
}) (*dto.CommitsResponse, error) {
	if params.Page <= 0 {
		params.Page = 1
	}
	if params.PageSize <= 0 {
		params.PageSize = 20
	}
	offset := (params.Page - 1) * params.PageSize

	query := s.db.Model(&model.Commit{}).
		Where("commit_date >= ? AND commit_date <= ?", params.StartDate, params.EndDate)
	if len(params.RepositoryIDs) > 0 {
		query = query.Where("repo_id IN ?", params.RepositoryIDs)
	}
	if len(params.AuthorEmails) > 0 {
		query = query.Where("author_email IN ?", params.AuthorEmails)
	}

	var total int64
	query.Count(&total)

	var commits []struct {
		model.Commit
		RepoName string
	}
	query.Select("commits.*, repositories.name as repo_name").
		Joins("LEFT JOIN repositories ON commits.repo_id = repositories.id").
		Order("commit_date DESC").
		Offset(offset).Limit(params.PageSize).
		Find(&commits)

	data := make([]dto.CommitWithRepoName, len(commits))
	for i, c := range commits {
		data[i] = dto.CommitWithRepoName{
			ID:           c.ID,
			RepoID:       c.RepoID,
			RepoName:     c.RepoName,
			CommitHash:   c.CommitHash,
			AuthorName:   c.AuthorName,
			AuthorEmail:  c.AuthorEmail,
			CommitDate:   c.CommitDate,
			Message:      c.Message,
			FilesChanged: c.FilesChanged,
			Insertions:   c.Insertions,
			Deletions:    c.Deletions,
			Branch:       c.Branch,
			CreatedAt:    c.CreatedAt,
		}
	}

	return &dto.CommitsResponse{Data: data, Total: int(total), Page: params.Page, PageSize: params.PageSize}, nil
}

func (s *CommitService) GetStatistics(params struct {
	StartDate     int64
	EndDate       int64
	RepositoryIDs []string
	AuthorEmails  []string
}) (*dto.StatisticsResponse, error) {
	baseWhere := "commit_date >= ? AND commit_date <= ?"
	baseArgs := []interface{}{params.StartDate, params.EndDate}

	if len(params.RepositoryIDs) > 0 {
		placeholders := make([]string, len(params.RepositoryIDs))
		for i := range placeholders {
			placeholders[i] = "?"
		}
		baseWhere += " AND repo_id IN (" + strings.Join(placeholders, ",") + ")"
		for _, id := range params.RepositoryIDs {
			baseArgs = append(baseArgs, id)
		}
	}
	if len(params.AuthorEmails) > 0 {
		placeholders := make([]string, len(params.AuthorEmails))
		for i := range placeholders {
			placeholders[i] = "?"
		}
		baseWhere += " AND author_email IN (" + strings.Join(placeholders, ",") + ")"
		for _, email := range params.AuthorEmails {
			baseArgs = append(baseArgs, email)
		}
	}

	// Total stats
	type aggResult struct {
		Count          int64
		TotalInsertions int64
		TotalDeletions  int64
		TotalFiles      int64
	}
	var agg aggResult
	s.db.Model(&model.Commit{}).
		Where(baseWhere, baseArgs...).
		Select("COUNT(*) as count, COALESCE(SUM(insertions),0) as total_insertions, COALESCE(SUM(deletions),0) as total_deletions, COALESCE(SUM(files_changed),0) as total_files").
		Scan(&agg)

	// By repository
	type byRepoResult struct {
		RepoID       string
		Commits      int64
		Insertions   int64
		Deletions    int64
	}
	var byRepo []byRepoResult
	s.db.Model(&model.Commit{}).
		Where(baseWhere, baseArgs...).
		Select("repo_id, COUNT(*) as commits, COALESCE(SUM(insertions),0) as insertions, COALESCE(SUM(deletions),0) as deletions").
		Group("repo_id").
		Scan(&byRepo)

	// Get repo names
	repoIDs := make([]string, len(byRepo))
	for i, r := range byRepo {
		repoIDs[i] = r.RepoID
	}
	var repos []model.Repository
	s.db.Select("id, name").Where("id IN ?", repoIDs).Find(&repos)
	repoMap := make(map[string]string)
	for _, r := range repos {
		repoMap[r.ID] = r.Name
	}

	byRepository := make([]dto.ByRepository, len(byRepo))
	for i, r := range byRepo {
		name := repoMap[r.RepoID]
		if name == "" {
			name = r.RepoID
		}
		byRepository[i] = dto.ByRepository{
			RepoID:     r.RepoID,
			RepoName:   name,
			Commits:    int(r.Commits),
			Insertions: int(r.Insertions),
			Deletions:  int(r.Deletions),
		}
	}

	// By date - raw SQL
	dateWhere := baseWhere
	dateArgs := baseArgs
	dateQuery := fmt.Sprintf(`
		SELECT DATE(commit_date / 1000, 'unixepoch') as date,
			COUNT(*) as commits,
			SUM(insertions) as insertions,
			SUM(deletions) as deletions
		FROM commits
		WHERE %s
		GROUP BY date ORDER BY date DESC
	`, dateWhere)

	var byDate []dto.ByDate
	s.db.Raw(dateQuery, dateArgs...).Scan(&byDate)

	return &dto.StatisticsResponse{
		TotalCommits:    int(agg.Count),
		TotalInsertions: int(agg.TotalInsertions),
		TotalDeletions:  int(agg.TotalDeletions),
		TotalFilesChanged: int(agg.TotalFiles),
		ByRepository:    byRepository,
		ByDate:          byDate,
	}, nil
}

// ResolveScanFromDateWithGapFill extends scan window backward if DB has gaps
func ResolveScanFromDateWithGapFill(plannedRangeStartMs int64, dbLatestCommitMs int64, maxLookbackDays int) int64 {
	if maxLookbackDays <= 0 {
		maxLookbackDays = 365
	}

	now := time.Now()
	floor := time.Date(now.Year(), now.Month(), now.Day()-maxLookbackDays, 0, 0, 0, 0, time.Local)
	floorMs := floor.UnixMilli()

	if plannedRangeStartMs < floorMs {
		return floorMs
	}

	if dbLatestCommitMs == 0 || dbLatestCommitMs >= plannedRangeStartMs {
		return plannedRangeStartMs
	}

	extended := time.UnixMilli(dbLatestCommitMs).AddDate(0, 0, -2)
	extendedMs := time.Date(extended.Year(), extended.Month(), extended.Day(), 0, 0, 0, 0, time.Local).UnixMilli()

	if extendedMs < floorMs {
		return floorMs
	}
	return extendedMs
}

func msToDateStr(ms int64) string {
	return time.UnixMilli(ms).Format("2006-01-02")
}
