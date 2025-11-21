export interface Repository {
  id: string;
  name: string;
  path: string;
  last_scan_time: number | null;
  total_commits: number;
  created_at: number;
  updated_at: number;
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
  created_at: number;
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

