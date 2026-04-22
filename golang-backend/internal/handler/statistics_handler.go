package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/huangjin/coding-history/golang-backend/internal/service"
	"gorm.io/gorm"
)

type StatisticsHandler struct {
	commitSvc *service.CommitService
}

func NewStatisticsHandler(db *gorm.DB) *StatisticsHandler {
	return &StatisticsHandler{commitSvc: service.NewCommitService(db)}
}

func (h *StatisticsHandler) GetStatistics(c *gin.Context) {
	startDate, _ := strconv.ParseInt(c.Query("startDate"), 10, 64)
	endDate, _ := strconv.ParseInt(c.Query("endDate"), 10, 64)
	repositoryIds := splitComma(c.Query("repositoryIds"))
	authorEmails := splitComma(c.Query("authorEmails"))

	result, err := h.commitSvc.GetStatistics(struct {
		StartDate     int64
		EndDate       int64
		RepositoryIDs []string
		AuthorEmails  []string
	}{
		StartDate: startDate, EndDate: endDate,
		RepositoryIDs: repositoryIds, AuthorEmails: authorEmails,
	})
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, result)
}
