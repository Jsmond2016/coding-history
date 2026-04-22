package dto

type StatisticsResponse struct {
	TotalCommits    int               `json:"totalCommits"`
	TotalInsertions int               `json:"totalInsertions"`
	TotalDeletions  int               `json:"totalDeletions"`
	TotalFilesChanged int             `json:"totalFilesChanged"`
	ByRepository    []ByRepository    `json:"byRepository"`
	ByDate          []ByDate          `json:"byDate"`
}

type ByRepository struct {
	RepoID     string `json:"repoId"`
	RepoName   string `json:"repoName"`
	Commits    int    `json:"commits"`
	Insertions int    `json:"insertions"`
	Deletions  int    `json:"deletions"`
}

type ByDate struct {
	Date       string `json:"date"`
	Commits    int    `json:"commits"`
	Insertions int    `json:"insertions"`
	Deletions  int    `json:"deletions"`
}
