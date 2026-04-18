import axios from 'axios';
import type {
  ServerLog,
  RequestLog,
  ScheduledTaskLog,
  LogsQueryParams,
  LogsResponse
} from '../types/logs';
import { API_BASE_URL } from '../config/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  paramsSerializer: {
    serialize: (params) => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      return searchParams.toString();
    }
  }
});

export const logsApi = {
  // 获取服务器日志
  getServerLogs: (params?: LogsQueryParams): Promise<LogsResponse<ServerLog>> =>
    api.get<LogsResponse<ServerLog>>('/logs/server', { params }).then(res => res.data),

  // 获取请求日志
  getRequestLogs: (params?: LogsQueryParams): Promise<LogsResponse<RequestLog>> =>
    api.get<LogsResponse<RequestLog>>('/logs/request', { params }).then(res => res.data),

  // 获取定时任务日志
  getScheduledTaskLogs: (params?: LogsQueryParams): Promise<LogsResponse<ScheduledTaskLog>> =>
    api.get<LogsResponse<ScheduledTaskLog>>('/logs/scheduled-task', { params }).then(res => res.data),

  // 清理旧日志
  cleanOldLogs: (days?: number): Promise<{ message: string; deleted: number }> =>
    api.post('/logs/clean', { days }).then(res => res.data)
};

