package handler

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/huangjin/coding-history/golang-backend/internal/config"
	"github.com/huangjin/coding-history/golang-backend/internal/dto"
	"github.com/huangjin/coding-history/golang-backend/internal/model"
	"github.com/huangjin/coding-history/golang-backend/internal/scheduler"
	"github.com/huangjin/coding-history/golang-backend/internal/service"
	"gorm.io/gorm"
)

const MaxScanDepth = 10

type ConfigHandler struct {
	db              *gorm.DB
	cfg             *config.Config
	configSvc       *service.ConfigService
	repoSvc         *service.RepositoryService
	dataMetricsSvc  *service.DataMetricsConfigService
	taskSvc         *service.ScanTaskService
	settingSvc      *service.AppSettingService
	backupScheduler *scheduler.DBBackupScheduler
}

func NewConfigHandler(db *gorm.DB, cfg *config.Config, bs *scheduler.DBBackupScheduler) *ConfigHandler {
	return &ConfigHandler{
		db:              db,
		cfg:             cfg,
		configSvc:       service.NewConfigService(db),
		repoSvc:         service.NewRepositoryService(db),
		dataMetricsSvc:  service.NewDataMetricsConfigService(db),
		taskSvc:         service.NewScanTaskService(db),
		settingSvc:      service.NewAppSettingService(db),
		backupScheduler: bs,
	}
}

// POST /scan-directory
func (h *ConfigHandler) ScanDirectory(c *gin.Context) {
	var req dto.ScanDirectoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	repos := scanDirectoryForGitRepos(req.RootPath)
	c.JSON(200, gin.H{"data": repos})
}

// GET /repositories
func (h *ConfigHandler) GetRepositories(c *gin.Context) {
	configs, err := h.configSvc.GetAllRepositoriesConfig()
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"data": configs})
}

// POST /repositories/batch
func (h *ConfigHandler) BatchCreateRepositories(c *gin.Context) {
	var req dto.BatchCreateRepositoriesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	if len(req.Repositories) == 0 {
		c.JSON(400, gin.H{"error": "repositories 不能为空"})
		return
	}

	now := model.NowMs()
	for _, repoReq := range req.Repositories {
		enabled := true
		if repoReq.Enabled != nil {
			enabled = *repoReq.Enabled
		}
		h.repoSvc.Upsert(&model.Repository{
			ID: repoReq.ID, Name: repoReq.Name, Path: repoReq.Path, Enabled: enabled,
		})
		if req.Author != nil {
			author := model.Author{
				RepoID: repoReq.ID, Name: req.Author.Name, Email: req.Author.Email,
				IsDefault: true, CreatedAt: now, UpdatedAt: now,
			}
			h.db.Create(&author)
		}
	}

	h.taskSvc.SyncDefaultRepositoryTasks()

	configs, _ := h.configSvc.GetAllRepositoriesConfig()
	c.JSON(201, gin.H{"data": configs})
}

// POST /repositories
func (h *ConfigHandler) CreateRepository(c *gin.Context) {
	var req dto.CreateRepositoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	h.repoSvc.Upsert(&model.Repository{ID: req.ID, Name: req.Name, Path: req.Path, Enabled: enabled})

	if enabled {
		h.taskSvc.SyncDefaultRepositoryTasks()
	}

	config, _ := h.configSvc.GetRepositoryConfig(req.ID)
	c.JSON(201, gin.H{"data": config})
}

// PUT /repositories/:id
func (h *ConfigHandler) UpdateRepository(c *gin.Context) {
	repoID := c.Param("id")
	var req dto.UpdateRepositoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Path != nil {
		updates["path"] = *req.Path
	}
	if req.Enabled != nil {
		updates["enabled"] = *req.Enabled
	}
	h.repoSvc.Update(repoID, updates)

	if req.Name != nil || req.Enabled != nil {
		h.taskSvc.SyncDefaultRepositoryTasks()
	}

	config, _ := h.configSvc.GetRepositoryConfig(repoID)
	c.JSON(200, gin.H{"data": config})
}

// DELETE /repositories/:id
func (h *ConfigHandler) DeleteRepository(c *gin.Context) {
	repoID := c.Param("id")
	h.db.Where("repo_id = ?", repoID).Delete(&model.Commit{})
	h.repoSvc.Delete(repoID)
	h.taskSvc.SyncDefaultRepositoryTasks()
	c.JSON(200, gin.H{"success": true})
}

// POST /repositories/batch-delete
func (h *ConfigHandler) BatchDeleteRepositories(c *gin.Context) {
	var req dto.BatchDeleteRepositoriesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	h.db.Where("repo_id IN ?", req.IDs).Delete(&model.Commit{})
	result := h.repoSvc.DeleteBatch(req.IDs)
	h.taskSvc.SyncDefaultRepositoryTasks()
	c.JSON(200, gin.H{"success": true, "deleted": result})
}

// GET /repositories/:id/authors
func (h *ConfigHandler) GetAuthors(c *gin.Context) {
	repoID := c.Param("id")
	authors, err := h.configSvc.GetAuthorsByRepoID(repoID)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"data": authors})
}

// POST /repositories/:id/authors
func (h *ConfigHandler) CreateAuthor(c *gin.Context) {
	repoID := c.Param("id")
	var req dto.CreateAuthorRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	isDefault := false
	if req.IsDefault != nil {
		isDefault = *req.IsDefault
	}
	now := model.NowMs()
	author := model.Author{
		RepoID: repoID, Name: req.Name, Email: req.Email,
		IsDefault: isDefault, CreatedAt: now, UpdatedAt: now,
	}
	if err := h.db.Create(&author).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	c.JSON(201, gin.H{"data": dto.AuthorConfig{
		ID: author.ID, Name: author.Name, Email: author.Email, IsDefault: author.IsDefault,
	}})
}

// DELETE /repositories/:id/authors/:authorId
func (h *ConfigHandler) DeleteAuthor(c *gin.Context) {
	authorIDStr := c.Param("authorId")
	var authorID int64
	fmt.Sscanf(authorIDStr, "%d", &authorID)
	if authorID == 0 {
		c.JSON(400, gin.H{"error": "Invalid author ID"})
		return
	}
	h.db.Where("id = ?", authorID).Delete(&model.Author{})
	c.JSON(200, gin.H{"success": true})
}

// GET /data-metrics
func (h *ConfigHandler) GetDataMetrics(c *gin.Context) {
	config, err := h.dataMetricsSvc.GetConfig()
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"data": config})
}

// PUT /data-metrics
func (h *ConfigHandler) UpdateDataMetrics(c *gin.Context) {
	var req dto.UpdateDataMetricsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	config, err := h.dataMetricsSvc.UpdateConfig(&req)
	if err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"data": config})
}

// POST /database/backup
func (h *ConfigHandler) BackupDatabase(c *gin.Context) {
	result := scheduler.RunDatabaseBackup(h.db, h.cfg)
	if result.Success {
		c.JSON(200, gin.H{"success": true, "message": "数据库备份成功", "destPath": result.DestPath})
	} else {
		c.JSON(500, gin.H{"success": false, "error": result.Error})
	}
}

// GET /backup-config
func (h *ConfigHandler) GetBackupConfig(c *gin.Context) {
	backupDir := h.settingSvc.GetBackupDir()
	backupCron := h.settingSvc.GetBackupCron("0 19 * * 5")
	c.JSON(200, gin.H{"data": dto.BackupConfig{BackupDir: backupDir, BackupCron: backupCron}})
}

// PUT /backup-config
func (h *ConfigHandler) UpdateBackupConfig(c *gin.Context) {
	var req dto.UpdateBackupConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	if req.BackupDir != nil {
		if err := h.settingSvc.SetBackupDir(*req.BackupDir); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
	}
	if req.BackupCron != nil {
		if err := h.settingSvc.SetBackupCron(*req.BackupCron); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
	}

	backupDir := h.settingSvc.GetBackupDir()
	backupCron := h.settingSvc.GetBackupCron("0 19 * * 5")
	c.JSON(200, gin.H{"data": dto.BackupConfig{BackupDir: backupDir, BackupCron: backupCron}})
}

func scanDirectoryForGitRepos(rootPath string) []dto.ScanDirectoryResult {
	resolved := rootPath
	if !filepath.IsAbs(rootPath) {
		abs, err := filepath.Abs(rootPath)
		if err != nil {
			return nil
		}
		resolved = abs
	}

	info, err := os.Stat(resolved)
	if err != nil || !info.IsDir() {
		return nil
	}

	var results []dto.ScanDirectoryResult
	walkDirForGitRepos(resolved, 0, &results)
	return results
}

func walkDirForGitRepos(currentPath string, depth int, results *[]dto.ScanDirectoryResult) {
	if depth > MaxScanDepth {
		return
	}

	entries, err := os.ReadDir(currentPath)
	if err != nil {
		return
	}

	for _, entry := range entries {
		name := entry.Name()
		if !entry.IsDir() || strings.HasPrefix(name, ".") {
			continue
		}
		fullPath := filepath.Join(currentPath, name)
		gitPath := filepath.Join(fullPath, ".git")
		if info, err := os.Stat(gitPath); err == nil && info.IsDir() {
			*results = append(*results, dto.ScanDirectoryResult{
				Path: fullPath,
				Name: name,
				ID:   toKebabID(name),
			})
		} else {
			walkDirForGitRepos(fullPath, depth+1, results)
		}
	}
}

func toKebabID(name string) string {
	re := regexp.MustCompile(`[^a-zA-Z0-9-]`)
	id := re.ReplaceAllString(strings.ReplaceAll(name, " ", "-"), "")
	id = regexp.MustCompile(`-+`).ReplaceAllString(id, "-")
	id = strings.Trim(id, "-")
	if id == "" {
		id = "repo"
	}
	return strings.ToLower(id)
}
