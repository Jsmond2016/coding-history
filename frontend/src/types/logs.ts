export type ServerLogType = 'start' | 'stop' | 'error';
export type ScheduledTaskStatus = 'success' | 'failed';

export interface ServerLog {
  id: number;
  type: ServerLogType;
  message: string;
  errorStack?: string;
  timestamp: number;
  createdAt: number;
}

export interface RequestLog {
  id: number;
  method: string;
  url: string;
  routeName?: string;
  statusCode: number;
  requestBody?: string;
  responseBody?: string;
  duration: number;
  timestamp: number;
  createdAt: number;
}

export interface ScheduledTaskLog {
  id: number;
  taskName: string;
  cronExpression?: string;
  startTime: number;
  endTime?: number;
  status: ScheduledTaskStatus;
  repositories: string[];
  totalCommits: number;
  errorMessage?: string;
  createdAt: number;
}

export interface LogsQueryParams {
  startTime?: number;
  endTime?: number;
  page?: number;
  pageSize?: number;
  type?: ServerLogType;
  status?: ScheduledTaskStatus;
  statusCode?: number;
}

export interface LogsResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

