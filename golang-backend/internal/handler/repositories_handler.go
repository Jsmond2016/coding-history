package handler

import (
	"log/slog"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/huangjin/coding-history/golang-backend/internal/githelper"
	"github.com/huangjin/coding-history/golang-backend/internal/model"
	"github.com/huangjin/coding-history/golang-backend/internal/service"
	"gorm.io/gorm"
)

type RepositoriesHandler struct {
	db          *gorm.DB
	repoSvc     *service.RepositoryService
	configSvc   *service.ConfigService
	commitSvc   *service.CommitService
	scanStatus  *ScanStatus
}

type ScanStatus struct {
	Finished     int    `json:"finished"`
	ScannedCount int    `json:"scannedCount"`
	Error        string `json:"error,omitempty"`
	StartedAt    *int64 `json:"startedAt,omitempty"`
}

const ScanStaleMs = 6 * 60 * 1000

func NewRepositoriesHandler(db *gorm.DB) *RepositoriesHandler {
	return &RepositoriesHandler{
		db:        db,
		repoSvc:   service.NewRepositoryService(db),
		configSvc: service.NewConfigService(db),
		commitSvc: service.NewCommitService(db),
		scanStatus: &ScanStatus{Finished: 0, ScannedCount: 0},
	}
}

func (h *RepositoriesHandler) GetAll(c *gin.Context) {
	repos, err := h.repoSvc.GetAllRepositories()
	if err != nil {
		slog.Error("Failed to get repositories", "error", err)
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, repos)
}

func (h *RepositoriesHandler) GetAuthors(c *gin.Context) {
	emails, err := h.configSvc.GetAllAuthorEmails()
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	type authorItem struct {
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	authors := make([]authorItem, len(emails))
	for i, email := range emails {
		authors[i] = authorItem{Email: email, Name: email}
	}
	c.JSON(200, authors)
}

func (h *RepositoriesHandler) GetByID(c *gin.Context) {
	id := c.Param("id")
	repo, err := h.repoSvc.GetByID(id)
	if err != nil {
		c.JSON(404, gin.H{"error": "Repository not found"})
		return
	}
	c.JSON(200, repo)
}

func (h *RepositoriesHandler) TriggerScan(c *gin.Context) {
	var req struct {
		StartDate     int64    `json:"startDate" binding:"required"`
		EndDate       int64    `json:"endDate" binding:"required"`
		RepositoryIDs []string `json:"repositoryIds"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	// Check if scan is stale
	if h.scanStatus.Finished == 1 {
		if h.scanStatus.StartedAt != nil && model.NowMs()-*h.scanStatus.StartedAt < ScanStaleMs {
			c.JSON(200, gin.H{"finished": h.scanStatus.Finished, "scannedCount": h.scanStatus.ScannedCount})
			return
		}
	}

	// Start async scan
	now := model.NowMs()
	h.scanStatus.Finished = 1
	h.scanStatus.ScannedCount = 0
	h.scanStatus.Error = ""
	h.scanStatus.StartedAt = &now

	go h.scanRepositoriesDateRange(req.StartDate, req.EndDate, req.RepositoryIDs)

	c.JSON(200, gin.H{"finished": 1, "scannedCount": 0})
}

func (h *RepositoriesHandler) GetScanStatus(c *gin.Context) {
	c.JSON(200, gin.H{
		"finished":     h.scanStatus.Finished,
		"scannedCount": h.scanStatus.ScannedCount,
		"error":        h.scanStatus.Error,
		"startedAt":    h.scanStatus.StartedAt,
	})
}

func (h *RepositoriesHandler) scanRepositoriesDateRange(startMs, endMs int64, repositoryIDs []string) {
	scannedCount := 0

	repos, _ := h.configSvc.GetEnabledRepositories()
	var reposToScan []struct{ ID, Name, Path string }
	if len(repositoryIDs) > 0 {
		for _, repo := range repos {
			for _, id := range repositoryIDs {
				if repo.ID == id {
					reposToScan = append(reposToScan, struct{ ID, Name, Path string }{repo.ID, repo.Name, repo.Path})
					break
				}
			}
		}
	} else {
		for _, repo := range repos {
			reposToScan = append(reposToScan, struct{ ID, Name, Path string }{repo.ID, repo.Name, repo.Path})
		}
	}

	for _, repo := range reposToScan {
		authorEmails, err := h.configSvc.GetAuthorEmailsByRepoID(repo.ID)
		if err != nil || len(authorEmails) == 0 {
			continue
		}

		if githelper.CheckIsRepo(repo.Path) && githelper.HasRemotes(repo.Path) {
			githelper.Pull(repo.Path)
		}

		scanner := service.NewGitScanService(repo.Path)
		commits, err := scanner.IncrementalScan(startMs, authorEmails, &endMs)
		if err != nil {
			slog.Error("[手动扫描失败]", "repo", repo.Name, "error", err)
			continue
		}

		if len(commits) > 0 {
			h.commitSvc.BatchInsertCommits(repo.ID, commits)
			result, _ := h.commitSvc.GetCommits(struct {
				StartDate     int64
				EndDate       int64
				RepositoryIDs []string
				AuthorEmails  []string
				Page          int
				PageSize      int
			}{0, model.NowMs(), []string{repo.ID}, nil, 1, 1})
			h.repoSvc.UpdateScanInfo(repo.ID, model.NowMs(), result.Total)
			scannedCount++
		}
	}

	h.scanStatus.Finished = 2
	h.scanStatus.ScannedCount = scannedCount
	h.scanStatus.StartedAt = nil
}

// Parse ID param as int64
func parseIDParam(c *gin.Context) (int64, bool) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "Invalid ID"})
		return 0, false
	}
	return id, true
}
