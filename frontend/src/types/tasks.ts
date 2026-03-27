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
  enabled?: boolean;
}

export interface TriggerTaskParams {
  repositoryIds?: string[];
}

