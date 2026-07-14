import type { Commit, CommitsByDate, CommitType } from '../types/gitStatistics'

const shanghaiTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export const COMMIT_TYPE_OPTIONS: Array<{ value: CommitType; label: string }> = [
  { value: 'feat', label: 'Feature' },
  { value: 'fix', label: 'Fix' },
  { value: 'refactor', label: 'Refactor' },
  { value: 'docs', label: 'Docs' },
  { value: 'merge', label: 'Merge' },
  { value: 'release', label: 'Release' },
  { value: 'chore', label: 'Chore' },
  { value: 'other', label: 'Other' },
]

export function getCommitType(commit: Commit): CommitType {
  const message = commit.message.trim().toLowerCase()
  if (message.startsWith('chore(release)') || message.startsWith('chore: release')) return 'release'
  if (message.startsWith('merge ')) return 'merge'
  if (message.startsWith('feat')) return 'feat'
  if (message.startsWith('fix')) return 'fix'
  if (message.startsWith('refactor')) return 'refactor'
  if (message.startsWith('docs')) return 'docs'
  if (message.startsWith('chore')) return 'chore'
  return 'other'
}

function matchesKeyword(commit: Commit, keyword: string): boolean {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized) return true
  return [
    commit.commitHash,
    commit.message,
    commit.authorName,
    commit.authorEmail,
    commit.repoName,
    commit.branch ?? '',
  ].some((value) => value.toLowerCase().includes(normalized))
}

function rebuildDateGroup(group: CommitsByDate, commits: Commit[]): CommitsByDate {
  const overtimeCommits = commits.filter((commit) => commit.isOvertime)
  return {
    ...group,
    commits,
    totalCommits: commits.length,
    overtimeCount: overtimeCommits.length,
    latestOvertimeCommits: overtimeCommits
      .sort((a, b) => b.commitDate - a.commitDate)
      .slice(0, 5)
      .map((commit) => shanghaiTimeFormatter.format(new Date(commit.commitDate))),
    hasRelease: commits.some((commit) => getCommitType(commit) === 'release'),
    repositories: Array.from(new Set(commits.map((commit) => commit.repoName))),
    branches: Array.from(new Set(
      commits.map((commit) => commit.branch).filter((branch): branch is string => Boolean(branch)),
    )).sort(),
  }
}

export function filterCommitGroups(
  groups: CommitsByDate[],
  keyword: string,
  commitTypes: CommitType[],
): CommitsByDate[] {
  const typeSet = new Set(commitTypes)
  return groups
    .map((group) => rebuildDateGroup(
      group,
      group.commits.filter((commit) => (
        matchesKeyword(commit, keyword)
        && (typeSet.size === 0 || typeSet.has(getCommitType(commit)))
      )),
    ))
    .filter((group) => group.totalCommits > 0)
}
