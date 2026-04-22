package dto

type CommitsByDateQuery struct {
	StartDate     string `form:"startDate" binding:"required"`
	EndDate       string `form:"endDate" binding:"required"`
	RepositoryIDs string `form:"repositoryIds"`
	AuthorEmails  string `form:"authorEmails"`
	IsOvertime    string `form:"isOvertime"`
}

type CommitsQuery struct {
	StartDate     string `form:"startDate" binding:"required"`
	EndDate       string `form:"endDate" binding:"required"`
	RepositoryIDs string `form:"repositoryIds"`
	AuthorEmails  string `form:"authorEmails"`
	Page          string `form:"page"`
	PageSize      string `form:"pageSize"`
}

type ScanRequest struct {
	StartDate     int64    `json:"startDate" binding:"required,gt=0"`
	EndDate       int64    `json:"endDate" binding:"required,gt=0"`
	RepositoryIDs []string `json:"repositoryIds"`
}

type CommitWithOvertime struct {
	ID                 int64    `json:"id"`
	RepoID             string   `json:"repoId"`
	RepoName           string   `json:"repoName"`
	CommitHash         string   `json:"commitHash"`
	AuthorName         string   `json:"authorName"`
	AuthorEmail        string   `json:"authorEmail"`
	CommitDate         int64    `json:"commitDate"`
	Message            string   `json:"message"`
	FilesChanged       int      `json:"filesChanged"`
	Insertions         int      `json:"insertions"`
	Deletions          int      `json:"deletions"`
	Branch             *string  `json:"branch"`
	CreatedAt          int64    `json:"createdAt"`
	IsOvertime         bool     `json:"isOvertime"`
	OvertimeCommitTimes []string `json:"overtimeCommitTimes,omitempty"`
}

type CommitsByDate struct {
	Date                  string              `json:"date"`
	Commits               []CommitWithOvertime `json:"commits"`
	TotalCommits          int                 `json:"totalCommits"`
	OvertimeCount         int                 `json:"overtimeCount"`
	LatestOvertimeCommits []string            `json:"latestOvertimeCommits"`
	WorkStatus            string              `json:"workStatus"`
	HasRelease            bool                `json:"hasRelease"`
	Repositories          []string            `json:"repositories"`
	Branches              []string            `json:"branches"`
}

type CommitsByDateResponse struct {
	Data  []CommitsByDate `json:"data"`
	Total int             `json:"total"`
}

type CommitsResponse struct {
	Data     []CommitWithRepoName `json:"data"`
	Total    int                  `json:"total"`
	Page     int                  `json:"page"`
	PageSize int                  `json:"pageSize"`
}

type CommitWithRepoName struct {
	ID           int64   `json:"id"`
	RepoID       string  `json:"repoId"`
	RepoName     string  `json:"repoName"`
	CommitHash   string  `json:"commitHash"`
	AuthorName   string  `json:"authorName"`
	AuthorEmail  string  `json:"authorEmail"`
	CommitDate   int64   `json:"commitDate"`
	Message      string  `json:"message"`
	FilesChanged int     `json:"filesChanged"`
	Insertions   int     `json:"insertions"`
	Deletions    int     `json:"deletions"`
	Branch       *string `json:"branch"`
	CreatedAt    int64   `json:"createdAt"`
}
