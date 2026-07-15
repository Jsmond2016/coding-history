export type TaskType = 'manual' | 'scheduled';
export type ScanRangeType = '1day' | '3days' | '7days' | '2weeks' | '1month' | '3months' | '6months' | 'custom';

export interface ScanTask {
  id: number;
  name: string;
  description?: string;
  taskType: TaskType;
  scanRangeType: ScanRangeType;
  startDate?: number;
  endDate?: number;
  cronExpression?: string;
  repositoryIds?: string[];
  isPrimary: boolean;
  enabled: boolean;
  lastExecuteTime?: number;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreateTaskParams {
  name: string;
  description?: string;
  taskType: TaskType;
  scanRangeType: ScanRangeType;
  startDate?: number;
  endDate?: number;
  cronExpression?: string;
  repositoryIds?: string[];
  isPrimary?: boolean;
  enabled?: boolean;
}

export interface UpdateTaskParams {
  name?: string;
  description?: string;
  taskType?: TaskType;
  scanRangeType?: ScanRangeType;
  startDate?: number;
  endDate?: number;
  cronExpression?: string;
  repositoryIds?: string[];
  isPrimary?: boolean;
  enabled?: boolean;
}

export interface TriggerTaskParams {
  repositoryIds?: string[];
}

export type ScanRunStatus = 'queued' | 'running' | 'success' | 'partial' | 'failed';

export interface ScanRunRepositoryResult {
  id: number;
  repoId: string;
  repoName: string;
  status: 'success' | 'skipped' | 'failed';
  insertedCommits: number;
  skippedCommits: number;
  errorMessage?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface ScanRun {
  id: number;
  planId?: number;
  triggerSource: 'manual' | 'scheduled';
  status: ScanRunStatus;
  requestedRepositoryIds: string[];
  rangeStart: number;
  rangeEnd: number;
  startedAt?: number;
  finishedAt?: number;
  insertedCommits: number;
  skippedCommits: number;
  errorMessage?: string;
  createdAt: number;
  results: ScanRunRepositoryResult[];
}
