package model

import "gorm.io/gorm"

type Commit struct {
	ID           int64  `gorm:"primaryKey;autoIncrement" json:"id"`
	RepoID       string `gorm:"column:repo_id;not null;uniqueIndex:idx_repo_hash" json:"repoId"`
	CommitHash   string `gorm:"column:commit_hash;not null;uniqueIndex:idx_repo_hash" json:"commitHash"`
	AuthorName   string `gorm:"column:author_name;not null" json:"authorName"`
	AuthorEmail  string `gorm:"column:author_email;not null" json:"authorEmail"`
	CommitDate   int64  `gorm:"column:commit_date;not null;index:idx_commits_repo_date;index:idx_commits_author;index:idx_commits_date;index:idx_commits_repo_branch_date" json:"commitDate"`
	Message      string `gorm:"not null" json:"message"`
	FilesChanged int    `gorm:"column:files_changed;default:0" json:"filesChanged"`
	Insertions   int    `gorm:"default:0" json:"insertions"`
	Deletions    int    `gorm:"default:0" json:"deletions"`
	Branch       *string `json:"branch"`
	CreatedAt    int64  `gorm:"column:created_at" json:"createdAt"`

	Repository Repository `gorm:"foreignKey:RepoID;references:ID;onDelete:CASCADE" json:"-"`
}

func (Commit) TableName() string { return "commits" }

func (c *Commit) BeforeCreate(tx *gorm.DB) error {
	if c.CreatedAt == 0 {
		c.CreatedAt = NowMs()
	}
	return nil
}
