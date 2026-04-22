package githelper

import (
	"fmt"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

type ScannedCommit struct {
	Hash         string
	Message      string
	Date         int64 // milliseconds since epoch (author date)
	AuthorName   string
	AuthorEmail  string
	FilesChanged int
	Insertions   int
	Deletions    int
	Branch       string
}

type LogOptions struct {
	All    bool
	Since  string // ISO date string
	Until  string // ISO date string
	Author string // perl-regexp pattern for author emails
	Branch string // specific branch
}

// ScanRepositoryFlat runs git log --all and returns commits
func ScanRepositoryFlat(repoPath string, opts LogOptions) ([]ScannedCommit, error) {
	return scanLog(repoPath, opts)
}

// ScanBranch scans a single branch
func ScanBranch(repoPath, branch string, opts LogOptions) ([]ScannedCommit, error) {
	opts.Branch = branch
	opts.All = false
	return scanLog(repoPath, opts)
}

func scanLog(repoPath string, opts LogOptions) ([]ScannedCommit, error) {
	// Use unix timestamp for reliable date parsing
	format := "%H%n%s%n%at%n%an%n%ae%n---COMMIT---"
	args := []string{"-C", repoPath, "log", "--pretty=format:" + format}

	if opts.All {
		args = append(args, "--all")
	}
	if opts.Branch != "" {
		args = append(args, opts.Branch)
	}
	if opts.Since != "" {
		args = append(args, "--since", opts.Since)
	}
	if opts.Until != "" {
		args = append(args, "--until", opts.Until)
	}
	if opts.Author != "" {
		args = append(args, "--perl-regexp", "--author", opts.Author)
	}

	cmd := exec.Command("git", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("git log failed: %s: %w", string(output), err)
	}

	return parseLogOutput(string(output)), nil
}

func parseLogOutput(output string) []ScannedCommit {
	if strings.TrimSpace(output) == "" {
		return nil
	}

	commits := strings.Split(output, "---COMMIT---")
	var result []ScannedCommit

	for _, block := range commits {
		block = strings.TrimSpace(block)
		if block == "" {
			continue
		}
		lines := strings.SplitN(block, "\n", 5)
		if len(lines) < 5 {
			continue
		}

		hash := strings.TrimSpace(lines[0])
		message := strings.TrimSpace(lines[1])
		dateStr := strings.TrimSpace(lines[2])
		authorName := strings.TrimSpace(lines[3])
		authorEmail := strings.TrimSpace(lines[4])

		dateMs := parseUnixTimestamp(dateStr)

		result = append(result, ScannedCommit{
			Hash:        hash,
			Message:     message,
			Date:        dateMs,
			AuthorName:  authorName,
			AuthorEmail: authorEmail,
		})
	}
	return result
}

// parseUnixTimestamp converts git's %at (unix seconds) to milliseconds
func parseUnixTimestamp(s string) int64 {
	var sec int64
	fmt.Sscanf(s, "%d", &sec)
	return sec * 1000
}

// EnrichDiffStats adds file change stats to each commit
func EnrichDiffStats(repoPath string, commits []ScannedCommit) []ScannedCommit {
	for i := range commits {
		files, ins, dels := getDiffSummary(repoPath, commits[i].Hash)
		commits[i].FilesChanged = files
		commits[i].Insertions = ins
		commits[i].Deletions = dels
	}
	return commits
}

func getDiffSummary(repoPath, hash string) (files, insertions, deletions int) {
	cmd := exec.Command("git", "-C", repoPath, "diff", "--stat", hash+"^", hash)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return 0, 0, 0
	}

	lastLine := ""
	lines := strings.Split(string(output), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if strings.TrimSpace(lines[i]) != "" {
			lastLine = lines[i]
			break
		}
	}

	// Parse "3 files changed, 10 insertions(+), 5 deletions(-)"
	re := regexp.MustCompile(`(\d+) files? changed(?:, (\d+) insertion[s]?\(\+\))?(?:, (\d+) deletion[s]?\(-\))?`)
	matches := re.FindStringSubmatch(lastLine)
	if len(matches) >= 2 {
		fmt.Sscanf(matches[1], "%d", &files)
	}
	if len(matches) >= 3 && matches[2] != "" {
		fmt.Sscanf(matches[2], "%d", &insertions)
	}
	if len(matches) >= 4 && matches[3] != "" {
		fmt.Sscanf(matches[3], "%d", &deletions)
	}
	return
}

func CheckIsRepo(repoPath string) bool {
	cmd := exec.Command("git", "-C", repoPath, "rev-parse", "--is-inside-work-tree")
	return cmd.Run() == nil
}

func Pull(repoPath string) error {
	cmd := exec.Command("git", "-C", repoPath, "pull")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git pull failed: %s: %w", string(output), err)
	}
	return nil
}

func HasRemotes(repoPath string) bool {
	remotes, err := GetRemotes(repoPath)
	return err == nil && len(remotes) > 0
}

func GetRemotes(repoPath string) ([]string, error) {
	cmd := exec.Command("git", "-C", repoPath, "remote")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, err
	}
	var remotes []string
	for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
		if strings.TrimSpace(line) != "" {
			remotes = append(remotes, strings.TrimSpace(line))
		}
	}
	return remotes, nil
}

func GetAllBranches(repoPath string) ([]string, error) {
	var branches []string
	seen := make(map[string]bool)

	// Local branches
	cmd := exec.Command("git", "-C", repoPath, "branch", "--format=%(refname:short)")
	if output, err := cmd.CombinedOutput(); err == nil {
		for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
			line = strings.TrimSpace(line)
			if line != "" && !strings.Contains(line, "HEAD") && !seen[line] {
				branches = append(branches, line)
				seen[line] = true
			}
		}
	}

	// Remote branches
	cmd = exec.Command("git", "-C", repoPath, "branch", "-r", "--format=%(refname:short)")
	if output, err := cmd.CombinedOutput(); err == nil {
		for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
			line = strings.TrimSpace(line)
			if line != "" && !strings.Contains(line, "HEAD") && !strings.Contains(line, "->") {
				normalized := strings.TrimPrefix(line, "remotes/")
				if !seen[normalized] {
					branches = append(branches, normalized)
					seen[normalized] = true
				}
			}
		}
	}

	if len(branches) == 0 {
		cmd = exec.Command("git", "-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD")
		if output, err := cmd.CombinedOutput(); err == nil {
			if branch := strings.TrimSpace(string(output)); branch != "" {
				branches = append(branches, branch)
			}
		}
	}

	return branches, nil
}

func RevParse(repoPath, ref string) (string, error) {
	cmd := exec.Command("git", "-C", repoPath, "rev-parse", ref)
	output, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(output)), err
}

func IsAncestor(repoPath, tip, main string) bool {
	cmd := exec.Command("git", "-C", repoPath, "merge-base", "--is-ancestor", tip, main)
	return cmd.Run() == nil
}

func BuildAuthorPattern(emails []string) string {
	re := regexp.MustCompile(`[.*+?^${}()\[\]\\]`)
	escaped := make([]string, len(emails))
	for i, email := range emails {
		escaped[i] = re.ReplaceAllString(email, `\$0`)
	}
	return strings.Join(escaped, "|")
}

// MsToISO converts milliseconds to ISO date string for git --since/--until
func MsToISO(ms int64) string {
	t := time.UnixMilli(ms)
	return t.Format("2006-01-02T15:04:05")
}

// MsToDateStr converts milliseconds to YYYY-MM-DD
func MsToDateStr(ms int64) string {
	t := time.UnixMilli(ms)
	return t.Format("2006-01-02")
}
