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
  createdAt: number;
}

export interface CommitsQuery {
  startDate: number;
  endDate: number;
  repositoryIds?: string[];
  page: number;
  pageSize: number;
}

export interface CommitsResponse {
  data: Commit[];
  total: number;
  page: number;
  pageSize: number;
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

