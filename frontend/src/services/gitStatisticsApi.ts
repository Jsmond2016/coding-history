import axios from 'axios';
import type {
  CommitsQuery,
  CommitsResponse,
  CommitsByDateQuery,
  CommitsByDateResponse,
  DataOverviewQuery,
  DataOverviewResponse,
  StatisticsResponse,
  Repository,
  Author
} from '../types/gitStatistics';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  paramsSerializer: {
    serialize: (params) => {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            // 将数组序列化为逗号分隔的字符串
            if (value.length > 0) {
              searchParams.append(key, value.join(','));
            }
          } else {
            searchParams.append(key, String(value));
          }
        }
      });
      return searchParams.toString();
    }
  }
});

export const gitStatisticsApi = {
  // 获取仓库列表
  getRepositories: (): Promise<Repository[]> =>
    api.get('/repositories').then(res => res.data),

  // 获取作者列表
  getAuthors: (): Promise<Author[]> =>
    api.get('/repositories/authors').then(res => res.data),

  // 获取提交记录（按日期分组）
  getCommitsByDate: (params: CommitsByDateQuery): Promise<CommitsByDateResponse> =>
    api.get<CommitsByDateResponse>('/commits/by-date', { params }).then(res => res.data),

  // 获取提交记录（旧接口）
  getCommits: (params: CommitsQuery): Promise<CommitsResponse> =>
    api.get<CommitsResponse>('/commits', { params }).then(res => res.data),

  // 获取统计数据
  getStatistics: (params: Omit<CommitsQuery, 'page' | 'pageSize'>): Promise<StatisticsResponse> =>
    api.get<StatisticsResponse>('/statistics', { params }).then(res => res.data),

  getDataOverview: (params: DataOverviewQuery): Promise<DataOverviewResponse> =>
    api.get<DataOverviewResponse>('/statistics/overview', { params }).then(res => res.data),

  // 手动触发扫描（异步）：须传与统计筛选一致的日期范围；可选 repositoryIds 限定仓库
  triggerScan: (body: {
    startDate: number;
    endDate: number;
    repositoryIds?: string[];
  }): Promise<{ finished: 0 | 1 | 2; scannedCount: number }> =>
    api.post('/repositories/scan', body).then(res => res.data),

  // 查询扫描状态
  getScanStatus: (): Promise<{
    finished: 0 | 1 | 2;
    scannedCount: number;
    error?: string;
    startedAt?: number;
    staleThresholdMs?: number;
  }> => api.get('/repositories/scan/status').then(res => res.data)
};
