import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000
});

export interface RepositoryConfig {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  authors: AuthorConfig[];
  ignoredBranches: string[];
  lastScanTime: number | null;
  totalCommits: number;
  createdAt: number;
  updatedAt: number;
}

export interface AuthorConfig {
  id: number;
  name: string;
  email: string;
  isDefault: boolean;
}

export interface CreateRepositoryParams {
  id: string;
  name: string;
  path: string;
  enabled?: boolean;
}

export interface UpdateRepositoryParams {
  name?: string;
  path?: string;
  enabled?: boolean;
}

export interface CreateAuthorParams {
  name: string;
  email: string;
  isDefault?: boolean;
}

export interface CreateIgnoredBranchParams {
  branchName: string;
}

/**
 * 获取所有仓库配置
 */
export const getRepositoriesConfig = async (): Promise<RepositoryConfig[]> => {
  const response = await api.get<{ data: RepositoryConfig[] }>('/config/repositories');
  return response.data.data;
};

/**
 * 创建仓库配置
 */
export const createRepository = async (params: CreateRepositoryParams): Promise<RepositoryConfig> => {
  const response = await api.post<{ data: RepositoryConfig }>('/config/repositories', params);
  return response.data.data;
};

/**
 * 更新仓库配置
 */
export const updateRepository = async (repoId: string, params: UpdateRepositoryParams): Promise<RepositoryConfig> => {
  const response = await api.put<{ data: RepositoryConfig }>(`/config/repositories/${repoId}`, params);
  return response.data.data;
};

/**
 * 删除仓库配置
 */
export const deleteRepository = async (repoId: string): Promise<void> => {
  await api.delete(`/config/repositories/${repoId}`);
};

/**
 * 获取仓库作者列表
 */
export const getAuthors = async (repoId: string): Promise<AuthorConfig[]> => {
  const response = await api.get<{ data: AuthorConfig[] }>(`/config/repositories/${repoId}/authors`);
  return response.data.data;
};

/**
 * 添加作者
 */
export const createAuthor = async (repoId: string, params: CreateAuthorParams): Promise<AuthorConfig> => {
  const response = await api.post<{ data: AuthorConfig }>(`/config/repositories/${repoId}/authors`, params);
  return response.data.data;
};

/**
 * 删除作者
 */
export const deleteAuthor = async (repoId: string, authorId: number): Promise<void> => {
  await api.delete(`/config/repositories/${repoId}/authors/${authorId}`);
};

export interface IgnoredBranchItem {
  id: number;
  branchName: string;
}

/**
 * 获取忽略分支列表
 */
export const getIgnoredBranches = async (repoId: string): Promise<IgnoredBranchItem[]> => {
  const response = await api.get<{ data: IgnoredBranchItem[] }>(`/config/repositories/${repoId}/ignored-branches`);
  return response.data.data;
};

/**
 * 添加忽略分支
 */
export const createIgnoredBranch = async (repoId: string, params: CreateIgnoredBranchParams): Promise<{ id: number; branchName: string }> => {
  const response = await api.post<{ data: { id: number; branchName: string } }>(`/config/repositories/${repoId}/ignored-branches`, params);
  return response.data.data;
};

/**
 * 删除忽略分支
 */
export const deleteIgnoredBranch = async (repoId: string, branchId: number): Promise<void> => {
  await api.delete(`/config/repositories/${repoId}/ignored-branches/${branchId}`);
};

export interface DataMetricsConfig {
  id: number;
  thresholds: {
    relaxed: number;
    normal: number;
    busy: number;
    superCrazy: number;
  };
  overtimeHour: number;
  labels: Record<string, string>;
  colors: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface UpdateDataMetricsConfigParams {
  thresholds: {
    relaxed: number;
    normal: number;
    busy: number;
    superCrazy: number;
  };
  overtimeHour: number;
  labels: Record<string, string>;
  colors: Record<string, string>;
}

/**
 * 获取数据指标配置
 */
export const getDataMetricsConfig = async (): Promise<DataMetricsConfig> => {
  const response = await api.get<{ data: DataMetricsConfig }>('/config/data-metrics');
  return response.data.data;
};

/**
 * 更新数据指标配置
 */
export const updateDataMetricsConfig = async (params: UpdateDataMetricsConfigParams): Promise<DataMetricsConfig> => {
  const response = await api.put<{ data: DataMetricsConfig }>('/config/data-metrics', params);
  return response.data.data;
};

