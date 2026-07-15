import axios from 'axios';
import type { ScanRun } from '../types/tasks';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000
});

export const scanRunsApi = {
  create: (params: {
    startDate: number;
    endDate: number;
    repositoryIds?: string[];
  }): Promise<ScanRun> => api.post<ScanRun>('/scan-runs', params).then((response) => response.data),

  get: (id: number): Promise<ScanRun> =>
    api.get<ScanRun>(`/scan-runs/${id}`).then((response) => response.data),

  list: (params?: { planId?: number; limit?: number }): Promise<ScanRun[]> =>
    api.get<ScanRun[]>('/scan-runs', { params }).then((response) => response.data)
};
