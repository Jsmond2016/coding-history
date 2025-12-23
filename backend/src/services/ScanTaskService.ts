import { prisma } from '../db/client.js';

// 类型断言：Prisma Client 已包含这些模型，但 TypeScript 类型可能未及时更新
const prismaClient = prisma as any;

export type TaskType = 'manual' | 'scheduled';
export type ScanRangeType = '2weeks' | '1month' | '3months' | '6months' | 'custom';

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
  createdAt: number;
  updatedAt: number;
}

export interface CreateScanTaskParams {
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

export interface UpdateScanTaskParams {
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

export class ScanTaskService {
  /**
   * 创建扫描任务
   */
  async createTask(params: CreateScanTaskParams): Promise<ScanTask> {
    const now = BigInt(Date.now());
    const task = await prismaClient.scanTask.create({
      data: {
        name: params.name,
        description: params.description,
        taskType: params.taskType,
        scanRangeType: params.scanRangeType,
        startDate: params.startDate ? BigInt(params.startDate) : null,
        endDate: params.endDate ? BigInt(params.endDate) : null,
        cronExpression: params.cronExpression,
        repositoryIds: params.repositoryIds ? JSON.stringify(params.repositoryIds) : null,
        enabled: params.enabled ?? true,
        createdAt: now,
        updatedAt: now
      }
    });

    return this.mapToScanTask(task);
  }

  /**
   * 获取所有任务
   */
  async getAllTasks(): Promise<ScanTask[]> {
    const tasks = await prismaClient.scanTask.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });

    return tasks.map((task: any) => this.mapToScanTask(task));
  }

  /**
   * 获取启用的定时任务（用于调度器）
   */
  async getEnabledScheduledTasks(): Promise<ScanTask[]> {
    const tasks = await prismaClient.scanTask.findMany({
      where: {
        taskType: 'scheduled',
        enabled: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    return tasks.map((task: any) => this.mapToScanTask(task));
  }

  /**
   * 根据ID获取任务
   */
  async getTaskById(id: number): Promise<ScanTask | null> {
    const task = await prismaClient.scanTask.findUnique({
      where: { id }
    });

    if (!task) return null;

    return this.mapToScanTask(task);
  }

  /**
   * 更新任务
   */
  async updateTask(id: number, params: UpdateScanTaskParams): Promise<ScanTask> {
    const now = BigInt(Date.now());
    const updateData: any = {
      updatedAt: now
    };

    if (params.name !== undefined) updateData.name = params.name;
    if (params.description !== undefined) updateData.description = params.description;
    if (params.taskType !== undefined) updateData.taskType = params.taskType;
    if (params.scanRangeType !== undefined) updateData.scanRangeType = params.scanRangeType;
    if (params.startDate !== undefined) updateData.startDate = params.startDate ? BigInt(params.startDate) : null;
    if (params.endDate !== undefined) updateData.endDate = params.endDate ? BigInt(params.endDate) : null;
    if (params.cronExpression !== undefined) updateData.cronExpression = params.cronExpression;
    if (params.repositoryIds !== undefined) updateData.repositoryIds = params.repositoryIds ? JSON.stringify(params.repositoryIds) : null;
    if (params.enabled !== undefined) updateData.enabled = params.enabled;

    const task = await prismaClient.scanTask.update({
      where: { id },
      data: updateData
    });

    return this.mapToScanTask(task);
  }

  /**
   * 删除任务
   */
  async deleteTask(id: number): Promise<void> {
    await prismaClient.scanTask.delete({
      where: { id }
    });
  }

  /**
   * 启用任务
   */
  async enableTask(id: number): Promise<ScanTask> {
    return this.updateTask(id, { enabled: true });
  }

  /**
   * 禁用任务
   */
  async disableTask(id: number): Promise<ScanTask> {
    return this.updateTask(id, { enabled: false });
  }

  /**
   * 更新任务最后执行时间
   */
  async updateLastExecuteTime(id: number, executeTime: number): Promise<void> {
    await prismaClient.scanTask.update({
      where: { id },
      data: {
        lastExecuteTime: BigInt(executeTime),
        updatedAt: BigInt(Date.now())
      }
    });
  }

  /**
   * 获取预定义的默认任务列表
   */
  getDefaultTasks(): Omit<CreateScanTaskParams, 'enabled'>[] {
    return [
      {
        name: '扫描近2周代码提交数据',
        description: '扫描最近2周的代码提交记录',
        taskType: 'manual',
        scanRangeType: '2weeks'
      },
      {
        name: '扫描近1个月代码提交数据',
        description: '扫描最近1个月的代码提交记录',
        taskType: 'manual',
        scanRangeType: '1month'
      },
      {
        name: '扫描近3个月代码提交数据',
        description: '扫描最近3个月的代码提交记录',
        taskType: 'manual',
        scanRangeType: '3months'
      },
      {
        name: '扫描近6个月代码提交数据',
        description: '扫描最近6个月的代码提交记录',
        taskType: 'manual',
        scanRangeType: '6months'
      },
      {
        name: '自定义时间范围扫描',
        description: '自定义指定时间范围扫描，最大支持6个月跨度',
        taskType: 'manual',
        scanRangeType: 'custom'
      }
    ];
  }

  /**
   * 将数据库模型映射为 ScanTask 接口
   */
  private mapToScanTask(task: any): ScanTask {
    return {
      id: task.id,
      name: task.name,
      description: task.description,
      taskType: task.taskType as TaskType,
      scanRangeType: task.scanRangeType as ScanRangeType,
      startDate: task.startDate ? Number(task.startDate) : undefined,
      endDate: task.endDate ? Number(task.endDate) : undefined,
      cronExpression: task.cronExpression,
      repositoryIds: task.repositoryIds ? JSON.parse(task.repositoryIds) : undefined,
      enabled: task.enabled,
      lastExecuteTime: task.lastExecuteTime ? Number(task.lastExecuteTime) : undefined,
      createdAt: Number(task.createdAt),
      updatedAt: Number(task.updatedAt)
    };
  }
}

