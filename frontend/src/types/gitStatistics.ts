export interface Repository {
  id: string;
  name: string;
  path: string;
  lastScanTime: number | null;
  totalCommits: number;
  initialScanToDate?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Author {
  name: string;
  email: string;
  isDefault?: boolean;
}

export interface CommitDateRange {
  earliest: number;
  latest: number;
}

export interface Commit {
  id: number;
  repoId: string;
  repoName: string;
  commitHash: string;
  authorName: string;
  authorEmail: string;
  commitDate: number;
  message: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  branch?: string | null; // 未上线分支名；null/空表示已上线或来自 release
  createdAt: number;
  isOvertime?: boolean; // 是否加班
  overtimeCommitTimes?: string[]; // 加班提交时间点
}

export type WorkStatus = 'relaxed' | 'normal' | 'busy' | 'crazy' | 'overtime' | 'superCrazyOvertime';
export type OvertimeMode = 'all' | 'overtime_days' | 'overtime_commits' | 'non_overtime_days';
export type CommitType = 'feat' | 'fix' | 'refactor' | 'docs' | 'merge' | 'release' | 'chore' | 'other';

export interface WorkStatusMetricsConfig {
  overtimeHour: number;
  thresholds: {
    relaxed: number;
    normal: number;
    busy: number;
    superCrazy: number;
  };
  labels: Record<WorkStatus, string>;
  colors: Record<WorkStatus, string>;
}

export interface CommitsByDate {
  date: string; // YYYY-MM-DD
  commits: Commit[];
  totalCommits: number;
  overtimeCount: number; // 当天加班提交数量
  latestOvertimeCommits: string[]; // 最晚的5个加班提交时间点
  workStatus: WorkStatus; // 工作状态
  hasRelease: boolean; // 是否有发版提交（chore(release)）
  repositories: string[]; // 当日修改的仓库列表
  branches: string[]; // 当日修改的分支列表
}

export interface CommitsQuery {
  startDate: number;
  endDate: number;
  repositoryIds?: string[];
  authorEmails?: string[];
  page: number;
  pageSize: number;
}

export interface CommitsByDateQuery {
  startDate: number;
  endDate: number;
  repositoryIds?: string[];
  authorEmails?: string[];
  overtimeMode?: OvertimeMode;
}

export interface CommitsResponse {
  data: Commit[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CommitsByDateResponse {
  data: CommitsByDate[];
  total: number;
  metricsConfig: WorkStatusMetricsConfig;
}

export interface StatisticsByRepository {
  repoId: string;
  repoName: string;
  commits: number;
  insertions: number;
  deletions: number;
}

export interface StatisticsByDate {
  date: string;
  commits: number;
  insertions: number;
  deletions: number;
}

export interface StatisticsResponse {
  totalCommits: number;
  totalInsertions: number;
  totalDeletions: number;
  totalFilesChanged: number;
  byRepository: StatisticsByRepository[];
  byDate: StatisticsByDate[];
}

export interface DataOverviewQuery {
  startDate: number;
  endDate: number;
  authorEmails?: string[];
}

export interface DataOverviewMetricWithRepo {
  repoId: string;
  repoName: string;
  count: number;
  insertions?: number;
  deletions?: number;
  filesChanged?: number;
  latestCommitDate?: number | null;
}

export interface DataOverviewMetricWithMonth {
  month: string;
  count: number;
  insertions?: number;
  deletions?: number;
  filesChanged?: number;
  latestCommitDate?: number | null;
}

export interface DataOverviewRepositoryMetric {
  repoId: string;
  repoName: string;
  count: number;
  insertions: number;
  deletions: number;
  filesChanged: number;
}

export interface DataOverviewOvertimeMonth {
  month: string;
  overtimeDays: number;
  activeDays: number;
  latestCommitDate: number | null;
}

export interface DataOverviewResponse {
  repositoryDistribution: DataOverviewRepositoryMetric[];
  topOvertimeMonth: DataOverviewOvertimeMonth | null;
  totals: {
    commits: number;
    overtimeCommits: number;
    overtimeDays: number;
    repositories: number;
    activeDays: number;
  };
  metricsConfig: WorkStatusMetricsConfig;
}
