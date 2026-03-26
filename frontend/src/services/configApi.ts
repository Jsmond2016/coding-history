import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000
});

export interface CommitDateRange {
  earliest: number;  // 最早提交时间（毫秒）
  latest: number;    // 最晚提交时间（毫秒）
}

export interface RepositoryConfig {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  authors: AuthorConfig[];
  lastScanTime: number | null;
  totalCommits: number;
  commitDateRange: CommitDateRange | null;  // 提交时间范围，无记录时为 null
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

export interface BatchCreateRepositoriesParams {
  repositories: Array<{ id: string; name: string; path: string; enabled?: boolean }>;
  author?: { name: string; email: string };
}

/**
 * 批量创建仓库配置（可同时为所有仓库设置默认作者）
 */
export const batchCreateRepositories = async (
  params: BatchCreateRepositoriesParams
): Promise<RepositoryConfig[]> => {
  const response = await api.post<{ data: RepositoryConfig[] }>('/config/repositories/batch', params);
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
 * 批量删除仓库配置
 */
export const batchDeleteRepositories = async (ids: string[]): Promise<{ success: boolean; deleted: number }> => {
  const response = await api.post<{ success: boolean; deleted: number }>('/config/repositories/batch-delete', {
    ids
  });
  return response.data;
};

export interface ScannedRepoItem {
  path: string;
  name: string;
  id: string;
}

/**
 * 扫描目录下的 Git 仓库
 */
export const scanDirectoryForRepos = async (rootPath: string): Promise<ScannedRepoItem[]> => {
  const response = await api.post<{ data: ScannedRepoItem[] }>('/config/scan-directory', { rootPath });
  return response.data.data;
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
