import axios from 'axios';
import type { CommitsQuery, CommitsResponse, StatisticsResponse, Repository } from '../types/gitStatistics';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000
});

export const gitStatisticsApi = {
  // 获取仓库列表
  getRepositories: (): Promise<Repository[]> =>
    api.get('/repositories').then(res => res.data),

  // 获取提交记录
  getCommits: (params: CommitsQuery): Promise<CommitsResponse> =>
    api.get<CommitsResponse>('/commits', { params }).then(res => res.data),

  // 获取统计数据
  getStatistics: (params: Omit<CommitsQuery, 'page' | 'pageSize'>): Promise<StatisticsResponse> =>
    api.get<StatisticsResponse>('/statistics', { params }).then(res => res.data),

  // 手动触发扫描
  triggerScan: (repositoryIds?: string[]): Promise<{ success: boolean; scannedCount: number }> =>
    api.post('/repositories/scan', { repositoryIds }).then(res => res.data)
};

