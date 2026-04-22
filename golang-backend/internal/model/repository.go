package model

import (
	"time"

	"gorm.io/gorm"
)

type Repository struct {
	ID                 string  `gorm:"primaryKey" json:"id"`
	Name               string  `gorm:"not null" json:"name"`
	Path               string  `gorm:"not null" json:"path"`
	Enabled            bool    `gorm:"default:true" json:"enabled"`
	LastScanTime       *int64  `gorm:"column:last_scan_time" json:"lastScanTime"`
	TotalCommits       int     `gorm:"column:total_commits;default:0" json:"totalCommits"`
	InitialScanToDate  *int64  `gorm:"column:initial_scan_to_date" json:"initialScanToDate"`
	CreatedAt          int64   `gorm:"column:created_at" json:"createdAt"`
	UpdatedAt          int64   `gorm:"column:updated_at" json:"updatedAt"`

	Commits []Commit `gorm:"foreignKey:RepoID;references:ID;onDelete:CASCADE" json:"commits,omitempty"`
	Authors []Author `gorm:"foreignKey:RepoID;references:ID;onDelete:CASCADE" json:"authors,omitempty"`
}

func (Repository) TableName() string { return "repositories" }

func (r *Repository) BeforeCreate(tx *gorm.DB) error {
	if r.CreatedAt == 0 {
		r.CreatedAt = NowMs()
	}
	if r.UpdatedAt == 0 {
		r.UpdatedAt = NowMs()
	}
	return nil
}

func NowMs() int64 {
	return time.Now().UnixMilli()
}
