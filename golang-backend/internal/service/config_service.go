package service

import (
	"github.com/huangjin/coding-history/golang-backend/internal/dto"
	"github.com/huangjin/coding-history/golang-backend/internal/model"
	"gorm.io/gorm"
)

type ConfigService struct {
	db            *gorm.DB
	commitSvc     *CommitService
}

func NewConfigService(db *gorm.DB) *ConfigService {
	return &ConfigService{
		db:        db,
		commitSvc: NewCommitService(db),
	}
}

func (s *ConfigService) GetRepositoryConfig(repoID string) (*dto.RepositoryConfig, error) {
	var repo model.Repository
	err := s.db.Preload("Authors", func(db *gorm.DB) *gorm.DB {
		return db.Order("created_at ASC")
	}).Where("id = ?", repoID).First(&repo).Error
	if err != nil {
		return nil, err
	}

	dateRange, _ := s.commitSvc.GetCommitDateRangeForRepo(repoID)

	return &dto.RepositoryConfig{
		ID:              repo.ID,
		Name:            repo.Name,
		Path:            repo.Path,
		Enabled:         repo.Enabled,
		LastScanTime:    repo.LastScanTime,
		TotalCommits:    repo.TotalCommits,
		CommitDateRange: dateRange,
		CreatedAt:       repo.CreatedAt,
		UpdatedAt:       repo.UpdatedAt,
		Authors:         mapAuthors(repo.Authors),
	}, nil
}

func (s *ConfigService) GetAllRepositoriesConfig() ([]dto.RepositoryConfig, error) {
	var repos []model.Repository
	err := s.db.Preload("Authors", func(db *gorm.DB) *gorm.DB {
		return db.Order("created_at ASC")
	}).Order("name ASC").Find(&repos).Error
	if err != nil {
		return nil, err
	}

	configs := make([]dto.RepositoryConfig, len(repos))
	for i, repo := range repos {
		dateRange, _ := s.commitSvc.GetCommitDateRangeForRepo(repo.ID)
		configs[i] = dto.RepositoryConfig{
			ID:              repo.ID,
			Name:            repo.Name,
			Path:            repo.Path,
			Enabled:         repo.Enabled,
			LastScanTime:    repo.LastScanTime,
			TotalCommits:    repo.TotalCommits,
			CommitDateRange: dateRange,
			CreatedAt:       repo.CreatedAt,
			UpdatedAt:       repo.UpdatedAt,
			Authors:         mapAuthors(repo.Authors),
		}
	}
	return configs, nil
}

func (s *ConfigService) GetAuthorsByRepoID(repoID string) ([]dto.AuthorConfig, error) {
	var authors []model.Author
	err := s.db.Where("repo_id = ?", repoID).Order("created_at ASC").Find(&authors).Error
	if err != nil {
		return nil, err
	}
	return mapAuthorsToDTO(authors), nil
}

func (s *ConfigService) GetEnabledRepositories() ([]dto.EnabledRepository, error) {
	var repos []model.Repository
	err := s.db.Select("id, name, path, enabled").Where("enabled = ?", true).Order("name ASC").Find(&repos).Error
	if err != nil {
		return nil, err
	}
	result := make([]dto.EnabledRepository, len(repos))
	for i, r := range repos {
		result[i] = dto.EnabledRepository{
			ID:      r.ID,
			Name:    r.Name,
			Path:    r.Path,
			Enabled: r.Enabled,
		}
	}
	return result, nil
}

func (s *ConfigService) GetAuthorEmailsByRepoID(repoID string) ([]string, error) {
	var authors []model.Author
	err := s.db.Select("email").Where("repo_id = ?", repoID).Find(&authors).Error
	if err != nil {
		return nil, err
	}
	emails := make([]string, len(authors))
	for i, a := range authors {
		emails[i] = a.Email
	}
	return emails, nil
}

func (s *ConfigService) GetAllAuthorEmails() ([]string, error) {
	var authors []model.Author
	err := s.db.Select("email").Find(&authors).Error
	if err != nil {
		return nil, err
	}
	seen := make(map[string]bool)
	var result []string
	for _, a := range authors {
		if !seen[a.Email] {
			seen[a.Email] = true
			result = append(result, a.Email)
		}
	}
	return result, nil
}

func mapAuthors(authors []model.Author) []dto.AuthorConfig {
	result := make([]dto.AuthorConfig, len(authors))
	for i, a := range authors {
		result[i] = dto.AuthorConfig{
			ID:        a.ID,
			Name:      a.Name,
			Email:     a.Email,
			IsDefault: a.IsDefault,
		}
	}
	return result
}

func mapAuthorsToDTO(authors []model.Author) []dto.AuthorConfig {
	return mapAuthors(authors)
}
