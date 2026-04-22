package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/huangjin/coding-history/golang-backend/internal/service"
	"gorm.io/gorm"
)

type CommitsHandler struct {
	db         *gorm.DB
	commitSvc  *service.CommitService
}

func NewCommitsHandler(db *gorm.DB) *CommitsHandler {
	return &CommitsHandler{
		db:        db,
		commitSvc: service.NewCommitService(db),
	}
}

func (h *CommitsHandler) GetCommitsByDate(c *gin.Context) {
	startDate, _ := strconv.ParseInt(c.Query("startDate"), 10, 64)
	endDate, _ := strconv.ParseInt(c.Query("endDate"), 10, 64)
	repositoryIds := splitComma(c.Query("repositoryIds"))
	authorEmails := splitComma(c.Query("authorEmails"))

	var isOvertime *bool
	if v := c.Query("isOvertime"); v != "" {
		b := v == "true"
		isOvertime = &b
	}

	result, err := h.commitSvc.GetCommitsByDate(struct {
		StartDate     int64
		EndDate       int64
		RepositoryIDs []string
		AuthorEmails  []string
		IsOvertime    *bool
	}{
		StartDate: startDate, EndDate: endDate,
		RepositoryIDs: repositoryIds, AuthorEmails: authorEmails,
		IsOvertime: isOvertime,
	})
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, result)
}

func (h *CommitsHandler) GetCommits(c *gin.Context) {
	startDate, _ := strconv.ParseInt(c.Query("startDate"), 10, 64)
	endDate, _ := strconv.ParseInt(c.Query("endDate"), 10, 64)
	repositoryIds := splitComma(c.Query("repositoryIds"))
	authorEmails := splitComma(c.Query("authorEmails"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))

	result, err := h.commitSvc.GetCommits(struct {
		StartDate     int64
		EndDate       int64
		RepositoryIDs []string
		AuthorEmails  []string
		Page          int
		PageSize      int
	}{
		StartDate: startDate, EndDate: endDate,
		RepositoryIDs: repositoryIds, AuthorEmails: authorEmails,
		Page: page, PageSize: pageSize,
	})
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{
		"data":     result.Data,
		"total":    result.Total,
		"page":     page,
		"pageSize": pageSize,
	})
}

func splitComma(s string) []string {
	if s == "" {
		return nil
	}
	return splitString(s, ",")
}

func splitString(s, sep string) []string {
	if s == "" {
		return nil
	}
	var result []string
	for _, v := range splitSlice(s, sep) {
		if v != "" {
			result = append(result, v)
		}
	}
	return result
}

func splitSlice(s, sep string) []string {
	var result []string
	start := 0
	for i := 0; i <= len(s)-len(sep); i++ {
		if s[i:i+len(sep)] == sep {
			result = append(result, s[start:i])
			start = i + len(sep)
			i += len(sep) - 1
		}
	}
	result = append(result, s[start:])
	return result
}
