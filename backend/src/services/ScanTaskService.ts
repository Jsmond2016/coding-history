import { prisma } from '../db/client.js';
// 类型断言：Prisma Client 已包含这些模型，但 TypeScript 类型可能未及时更新
const prismaClient = prisma as any;

export type TaskType = 'manual' | 'scheduled';
export type ScanRangeType = '1day' | '3days' | '7days' | '2weeks' | '1month' | '3months' | '6months' | 'custom';

const PRIMARY_TASK_DEFAULT_CRON = '30 9 * * 1-5';
const PRIMARY_TASK_DEFAULT_SCAN_RANGE: ScanRangeType = '3days';

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
  isPrimary: boolean;
  enabled: boolean;
  lastExecuteTime?: number;
  sortOrder: number;
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
  isPrimary?: boolean;
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
  isPrimary?: boolean;
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
        isPrimary: params.isPrimary ?? false,
        enabled: params.enabled ?? true,
        createdAt: now,
        updatedAt: now
      }
    });

    return this.mapToScanTask(task);
  }

  /** 获取定时扫描计划。历史手动任务保留在数据库中，但不再进入业务列表。 */
  async getAllTasks(): Promise<ScanTask[]> {
    const tasks = await prismaClient.scanTask.findMany({
      where: { taskType: 'scheduled' },
      orderBy: [
        { isPrimary: 'desc' },
        { sortOrder: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    return tasks.map((task: any) => this.mapToScanTask(task));
  }

  /**
   * 批量更新任务排序
   * @param sortOrders 任务ID和排序顺序的数组
   */
  async batchUpdateSortOrder(sortOrders: Array<{ id: number; sortOrder: number }>): Promise<void> {
    const now = BigInt(Date.now());

    for (const item of sortOrders) {
      await prismaClient.scanTask.update({
        where: { id: item.id },
        data: {
          sortOrder: item.sortOrder,
          updatedAt: now
        }
      });
    }
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
   * 获取当前主任务
   */
  async getPrimaryTask(): Promise<ScanTask | null> {
    const task = await prismaClient.scanTask.findFirst({
      where: { isPrimary: true, taskType: 'scheduled' }
    });

    if (!task) return null;

    return this.mapToScanTask(task);
  }

  /** 设置默认计划（全局仅允许一个），不隐式改写计划的其他配置。 */
  async setPrimaryTask(id: number): Promise<ScanTask> {
    const now = BigInt(Date.now());
    const targetTask = await prismaClient.scanTask.findUnique({
      where: { id }
    });

    if (!targetTask) {
      throw new Error('任务不存在');
    }
    if (targetTask.taskType !== 'scheduled') {
      throw new Error('仅定时扫描计划可设为默认计划');
    }

    await prismaClient.$transaction(async (tx: any) => {
      await tx.scanTask.updateMany({
        where: { isPrimary: true },
        data: {
          isPrimary: false,
          updatedAt: now
        }
      });

      await tx.scanTask.update({
        where: { id },
        data: {
          isPrimary: true,
          updatedAt: now
        }
      });
    });

    const task = await prismaClient.scanTask.findUnique({
      where: { id }
    });

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
    if (params.isPrimary !== undefined) updateData.isPrimary = params.isPrimary;
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
    const task = await this.getTaskById(id);
    if (!task) throw new Error('扫描计划不存在');
    if (task.taskType !== 'scheduled') throw new Error('历史手动任务不可在计划管理中操作');
    if (task.isPrimary) throw new Error('默认计划不能删除，请先将其他计划设为默认');
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
    const task = await this.getTaskById(id);
    if (!task) throw new Error('扫描计划不存在');
    if (task.isPrimary) throw new Error('默认计划不能停用，请先将其他计划设为默认');
    return this.updateTask(id, { enabled: false });
  }

  /** 将新数据源加入默认计划；没有默认计划时创建一个。 */
  async addRepositoriesToPrimaryTask(repositoryIds: string[]): Promise<ScanTask> {
    const uniqueIds = Array.from(new Set(repositoryIds.filter(Boolean)));
    let primaryTask = await this.getPrimaryTask();

    if (!primaryTask) {
      const createdTask = await this.createTask({
        name: '默认工作日扫描',
        description: '工作日上午 09:30 自动同步最近 3 天提交',
        taskType: 'scheduled',
        scanRangeType: PRIMARY_TASK_DEFAULT_SCAN_RANGE,
        cronExpression: PRIMARY_TASK_DEFAULT_CRON,
        repositoryIds: uniqueIds,
        isPrimary: false,
        enabled: true
      });
      return this.setPrimaryTask(createdTask.id);
    }

    return this.updateTask(primaryTask.id, {
      repositoryIds: Array.from(new Set([...(primaryTask.repositoryIds ?? []), ...uniqueIds]))
    });
  }

  /** 从所有定时计划中移除已删除的数据源引用。 */
  async removeRepositoriesFromPlans(repositoryIds: string[]): Promise<void> {
    const removedIds = new Set(repositoryIds);
    const plans = await this.getAllTasks();
    for (const plan of plans) {
      if (!plan.repositoryIds?.some((id) => removedIds.has(id))) continue;
      await this.updateTask(plan.id, {
        repositoryIds: plan.repositoryIds.filter((id) => !removedIds.has(id))
      });
    }
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
      isPrimary: Boolean(task.isPrimary),
      enabled: task.enabled,
      lastExecuteTime: task.lastExecuteTime ? Number(task.lastExecuteTime) : undefined,
      sortOrder: task.sortOrder ?? 0,
      createdAt: Number(task.createdAt),
      updatedAt: Number(task.updatedAt)
    };
  }
}
