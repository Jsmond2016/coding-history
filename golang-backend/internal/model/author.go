package model

import "gorm.io/gorm"

type Author struct {
	ID        int64  `gorm:"primaryKey;autoIncrement" json:"id"`
	RepoID    string `gorm:"column:repo_id;not null;uniqueIndex:idx_repo_email" json:"repoId"`
	Name      string `gorm:"not null" json:"name"`
	Email     string `gorm:"not null;uniqueIndex:idx_repo_email" json:"email"`
	IsDefault bool   `gorm:"column:is_default;default:false" json:"isDefault"`
	CreatedAt int64  `gorm:"column:created_at" json:"createdAt"`
	UpdatedAt int64  `gorm:"column:updated_at" json:"updatedAt"`

	Repository Repository `gorm:"foreignKey:RepoID;references:ID;onDelete:CASCADE" json:"-"`
}

func (Author) TableName() string { return "authors" }

func (a *Author) BeforeCreate(tx *gorm.DB) error {
	if a.CreatedAt == 0 {
		a.CreatedAt = NowMs()
	}
	if a.UpdatedAt == 0 {
		a.UpdatedAt = NowMs()
	}
	return nil
}
