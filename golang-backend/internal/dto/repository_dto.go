package dto

type RepositoryConfig struct {
	ID               string         `json:"id"`
	Name             string         `json:"name"`
	Path             string         `json:"path"`
	Enabled          bool           `json:"enabled"`
	Authors          []AuthorConfig `json:"authors"`
	LastScanTime     *int64         `json:"lastScanTime"`
	TotalCommits     int            `json:"totalCommits"`
	CommitDateRange  *CommitDateRange `json:"commitDateRange"`
	CreatedAt        int64          `json:"createdAt"`
	UpdatedAt        int64          `json:"updatedAt"`
}

type AuthorConfig struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	IsDefault bool   `json:"isDefault"`
}

type CommitDateRange struct {
	Earliest int64 `json:"earliest"`
	Latest   int64 `json:"latest"`
}

type CreateRepositoryRequest struct {
	ID      string `json:"id" binding:"required"`
	Name    string `json:"name" binding:"required"`
	Path    string `json:"path" binding:"required"`
	Enabled *bool  `json:"enabled"`
}

type UpdateRepositoryRequest struct {
	Name    *string `json:"name"`
	Path    *string `json:"path"`
	Enabled *bool   `json:"enabled"`
}

type BatchCreateRepositoriesRequest struct {
	Repositories []CreateRepositoryRequest `json:"repositories" binding:"required,dive"`
	Author       *BatchAuthorRequest       `json:"author"`
}

type BatchAuthorRequest struct {
	Name  string `json:"name" binding:"required"`
	Email string `json:"email" binding:"required,email"`
}

type BatchDeleteRepositoriesRequest struct {
	IDs []string `json:"ids" binding:"required,min=1"`
}

type CreateAuthorRequest struct {
	Name      string `json:"name" binding:"required"`
	Email     string `json:"email" binding:"required,email"`
	IsDefault *bool  `json:"isDefault"`
}

type ScanDirectoryRequest struct {
	RootPath string `json:"rootPath" binding:"required,min=1"`
}

type ScanDirectoryResult struct {
	Path string `json:"path"`
	Name string `json:"name"`
	ID   string `json:"id"`
}

type EnabledRepository struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Path    string `json:"path"`
	Enabled bool   `json:"enabled"`
}
