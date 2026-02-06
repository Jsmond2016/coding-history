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
  isOvertime?: boolean; // 筛选是否加班
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

