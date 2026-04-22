package service

import (
	"github.com/huangjin/coding-history/golang-backend/internal/model"
	"gorm.io/gorm"
)

type RepositoryService struct {
	db *gorm.DB
}

func NewRepositoryService(db *gorm.DB) *RepositoryService {
	return &RepositoryService{db: db}
}

func (s *RepositoryService) GetAllRepositories() ([]model.Repository, error) {
	var repos []model.Repository
	err := s.db.Order("name ASC").Find(&repos).Error
	return repos, err
}

func (s *RepositoryService) GetByID(id string) (*model.Repository, error) {
	var repo model.Repository
	err := s.db.Where("id = ?", id).First(&repo).Error
	if err != nil {
		return nil, err
	}
	return &repo, nil
}

func (s *RepositoryService) Upsert(repo *model.Repository) error {
	now := model.NowMs()
	var existing model.Repository
	err := s.db.Where("id = ?", repo.ID).First(&existing).Error
	if err == gorm.ErrRecordNotFound {
		repo.CreatedAt = now
		repo.UpdatedAt = now
		return s.db.Create(repo).Error
	}
	if err != nil {
		return err
	}
	updates := map[string]interface{}{
		"name":       repo.Name,
		"path":       repo.Path,
		"updated_at": now,
	}
	if repo.Enabled != existing.Enabled {
		updates["enabled"] = repo.Enabled
	}
	return s.db.Model(&model.Repository{}).Where("id = ?", repo.ID).Updates(updates).Error
}

func (s *RepositoryService) UpdateScanInfo(repoID string, lastScanTime int64, totalCommits int) error {
	return s.db.Model(&model.Repository{}).Where("id = ?", repoID).Updates(map[string]interface{}{
		"last_scan_time": lastScanTime,
		"total_commits":  totalCommits,
		"updated_at":     model.NowMs(),
	}).Error
}

func (s *RepositoryService) Update(repoID string, updates map[string]interface{}) error {
	updates["updated_at"] = model.NowMs()
	return s.db.Model(&model.Repository{}).Where("id = ?", repoID).Updates(updates).Error
}

func (s *RepositoryService) Delete(repoID string) error {
	return s.db.Where("id = ?", repoID).Delete(&model.Repository{}).Error
}

func (s *RepositoryService) DeleteBatch(ids []string) error {
	return s.db.Where("id IN ?", ids).Delete(&model.Repository{}).Error
}

func (s *RepositoryService) GetEnabledRepositories() ([]model.Repository, error) {
	var repos []model.Repository
	err := s.db.Where("enabled = ?", true).Order("name ASC").Find(&repos).Error
	return repos, err
}
