import axios from 'axios';
import type {
  ScanTask,
  CreateTaskParams,
  UpdateTaskParams,
  TriggerTaskParams
} from '../types/tasks';
import { API_BASE_URL } from '../config/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000
});

export const tasksApi = {
  // 获取所有任务
  getTasks: (): Promise<ScanTask[]> =>
    api.get<ScanTask[]>('/tasks').then(res => res.data),

  // 获取预定义默认任务列表
  getDefaultTasks: (): Promise<Omit<CreateTaskParams, 'enabled'>[]> =>
    api.get<Omit<CreateTaskParams, 'enabled'>[]>('/tasks/default').then(res => res.data),

  // 获取单个任务详情
  getTaskById: (id: number): Promise<ScanTask> =>
    api.get<ScanTask>(`/tasks/${id}`).then(res => res.data),

  // 创建任务
  createTask: (params: CreateTaskParams): Promise<ScanTask> =>
    api.post<ScanTask>('/tasks', params).then(res => res.data),

  // 更新任务
  updateTask: (id: number, params: UpdateTaskParams): Promise<ScanTask> =>
    api.put<ScanTask>(`/tasks/${id}`, params).then(res => res.data),

  // 删除任务
  deleteTask: (id: number): Promise<{ message: string }> =>
    api.delete(`/tasks/${id}`).then(res => res.data),

  // 启用任务
  enableTask: (id: number): Promise<ScanTask> =>
    api.post<ScanTask>(`/tasks/${id}/enable`).then(res => res.data),

  // 禁用任务
  disableTask: (id: number): Promise<ScanTask> =>
    api.post<ScanTask>(`/tasks/${id}/disable`).then(res => res.data),

  // 触发任务执行
  triggerTask: (id: number, params?: TriggerTaskParams): Promise<{ message: string; taskId: number; taskName: string }> =>
    api.post(`/tasks/${id}/trigger`, params || {}).then(res => res.data),

  // 批量更新任务排序
  batchUpdateSortOrder: (sortOrders: Array<{ id: number; sortOrder: number }>): Promise<{ message: string; count: number }> =>
    api.post('/tasks/batch-sort', { sortOrders }).then(res => res.data)
};

