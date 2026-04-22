package service

import (
	"fmt"
	"log/slog"
	"strings"

	"github.com/huangjin/coding-history/golang-backend/internal/githelper"
)

type GitScanService struct {
	repoPath string
}

func NewGitScanService(repoPath string) *GitScanService {
	return &GitScanService{repoPath: repoPath}
}

// ScanRepositoryFlat scans all refs with git log --all
func (s *GitScanService) ScanRepositoryFlat(fromDateMs *int64, toDateMs *int64, authorEmails []string) ([]githelper.ScannedCommit, error) {
	if !githelper.CheckIsRepo(s.repoPath) {
		return nil, fmt.Errorf("%s is not a valid git repository", s.repoPath)
	}

	opts := githelper.LogOptions{All: true}
	if fromDateMs != nil {
		opts.Since = githelper.MsToISO(*fromDateMs)
	}
	if toDateMs != nil {
		opts.Until = githelper.MsToISO(*toDateMs)
	}
	if len(authorEmails) > 0 {
		opts.Author = githelper.BuildAuthorPattern(authorEmails)
	}

	commits, err := githelper.ScanRepositoryFlat(s.repoPath, opts)
	if err != nil {
		return nil, err
	}

	commits = githelper.EnrichDiffStats(s.repoPath, commits)
	slog.Info("Flat scan (--all)", "commits", len(commits), "repo", s.repoPath)
	return commits, nil
}

// IncrementalScan scans from lastScanDate using flat --all
func (s *GitScanService) IncrementalScan(lastScanDateMs int64, authorEmails []string, toDateMs *int64) ([]githelper.ScannedCommit, error) {
	slog.Info("Incremental flat scan", "from", githelper.MsToISO(lastScanDateMs), "repo", s.repoPath)
	return s.ScanRepositoryFlat(&lastScanDateMs, toDateMs, authorEmails)
}

// ScanRepository scans by branch (legacy, for compatibility)
func (s *GitScanService) ScanRepository(fromDateMs *int64, toDateMs *int64, authorEmails []string) ([]githelper.ScannedCommit, error) {
	if !githelper.CheckIsRepo(s.repoPath) {
		return nil, fmt.Errorf("%s is not a valid git repository", s.repoPath)
	}

	branchesToScan, err := s.getBranchesToScan()
	if err != nil {
		return nil, err
	}
	slog.Info("Found branches to scan", "count", len(branchesToScan), "repo", s.repoPath)

	var allCommits []githelper.ScannedCommit
	for _, branchName := range branchesToScan {
		opts := githelper.LogOptions{Branch: branchName}
		if fromDateMs != nil {
			opts.Since = githelper.MsToISO(*fromDateMs)
		}
		if toDateMs != nil {
			opts.Until = githelper.MsToISO(*toDateMs)
		}
		if len(authorEmails) > 0 {
			opts.Author = githelper.BuildAuthorPattern(authorEmails)
		}

		branchCommits, err := githelper.ScanBranch(s.repoPath, branchName, opts)
		if err != nil {
			slog.Warn("Failed to scan branch", "branch", branchName, "error", err)
			continue
		}
		branchCommits = githelper.EnrichDiffStats(s.repoPath, branchCommits)

		storageBranch := branchName
		if strings.HasPrefix(branchName, "origin/") {
			storageBranch = strings.TrimPrefix(branchName, "origin/")
		}
		for i := range branchCommits {
			branchCommits[i].Branch = storageBranch
		}

		allCommits = append(allCommits, branchCommits...)
	}

	// Deduplicate by hash, prefer unreleased branch
	uniqueMap := make(map[string]githelper.ScannedCommit)
	for _, commit := range allCommits {
		existing, ok := uniqueMap[commit.Hash]
		currentIsUnreleased := commit.Branch != "" && commit.Branch != "release" && commit.Branch != "master"
		if !ok {
			uniqueMap[commit.Hash] = commit
		} else if currentIsUnreleased && (existing.Branch == "" || existing.Branch == "release" || existing.Branch == "master") {
			uniqueMap[commit.Hash] = commit
		}
	}

	result := make([]githelper.ScannedCommit, 0, len(uniqueMap))
	for _, c := range uniqueMap {
		result = append(result, c)
	}
	slog.Info("Unique commits found", "count", len(result), "branches", len(branchesToScan))
	return result, nil
}

func (s *GitScanService) getBranchesToScan() ([]string, error) {
	allBranches, err := githelper.GetAllBranches(s.repoPath)
	if err != nil {
		return nil, err
	}

	releaseRef := ""
	masterRef := ""
	for _, b := range allBranches {
		normalized := normalizeBranchName(b)
		if normalized == "release" {
			releaseRef = b
		}
		if normalized == "master" {
			masterRef = b
		}
	}

	// If both release and master exist, skip master
	filtered := allBranches
	if releaseRef != "" && masterRef != "" {
		filtered = make([]string, 0)
		for _, b := range allBranches {
			if normalizeBranchName(b) != "master" {
				filtered = append(filtered, b)
			}
		}
	}

	mainRef := releaseRef
	if mainRef == "" {
		mainRef = masterRef
	}

	var unreleased []string
	for _, branch := range filtered {
		if branch == mainRef {
			continue
		}
		if mainRef == "" {
			unreleased = append(unreleased, branch)
			continue
		}
		tip, err := githelper.RevParse(s.repoPath, branch)
		if err != nil || tip == "" {
			continue
		}
		if !githelper.IsAncestor(s.repoPath, tip, mainRef) {
			unreleased = append(unreleased, branch)
		}
	}

	var result []string
	result = append(result, unreleased...)
	if mainRef != "" {
		result = append(result, mainRef)
	}
	return result, nil
}

func normalizeBranchName(name string) string {
	return strings.TrimPrefix(name, "origin/")
}
