import { prisma } from '../db/client.js';
import { ConfigService } from './ConfigService.js';

// 类型断言：Prisma Client 已包含这些模型，但 TypeScript 类型可能未及时更新
const prismaClient = prisma as any;

export type TaskType = 'manual' | 'scheduled';
export type ScanRangeType = '1day' | '3days' | '7days' | '2weeks' | '1month' | '3months' | '6months' | 'custom';

const PRIMARY_TASK_DEFAULT_CRON = '0 9 * * 1-5';
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

  /**
   * 获取所有任务（按 sortOrder 排序）
   */
  async getAllTasks(): Promise<ScanTask[]> {
    const tasks = await prismaClient.scanTask.findMany({
      orderBy: [
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
      where: { isPrimary: true }
    });

    if (!task) return null;

    return this.mapToScanTask(task);
  }

  /**
   * 设置主任务（全局仅允许一个）
   */
  async setPrimaryTask(id: number): Promise<ScanTask> {
    const now = BigInt(Date.now());
    const targetTask = await prismaClient.scanTask.findUnique({
      where: { id }
    });

    if (!targetTask) {
      throw new Error('任务不存在');
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
          taskType: 'scheduled',
          enabled: true,
          scanRangeType: PRIMARY_TASK_DEFAULT_SCAN_RANGE,
          startDate: null,
          endDate: null,
          cronExpression: targetTask.cronExpression?.trim() || PRIMARY_TASK_DEFAULT_CRON,
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
   * 获取预定义的默认任务列表（根据仓库配置动态生成）
   */
  async getDefaultTasks(): Promise<Omit<CreateScanTaskParams, 'enabled'>[]> {
    const configService = new ConfigService();
    const repositories = await configService.getEnabledRepositories();
    
    // 为每个仓库生成一个手动任务
    const repositoryTasks: Omit<CreateScanTaskParams, 'enabled'>[] = repositories.map(repo => ({
      name: repo.name,
      description: `手动同步仓库 ${repo.name} 的提交记录`,
      taskType: 'manual',
      scanRangeType: '2weeks', // 与统计页「同步」、迁移脚本默认一致（近 2 周）
      repositoryIds: [repo.id]
    }));

    // 保留原有的通用扫描任务
    const commonTasks: Omit<CreateScanTaskParams, 'enabled'>[] = [
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

    // 先返回仓库任务，再返回通用任务
    return [...repositoryTasks, ...commonTasks];
  }

  /**
   * 同步默认任务到数据库（确保每个仓库都有对应的手动任务）
   */
  async syncDefaultRepositoryTasks(): Promise<void> {
    const configService = new ConfigService();
    const repositories = await configService.getEnabledRepositories();
    
    for (const repo of repositories) {
      // 检查是否已存在该仓库的手动任务（通过 repositoryIds 匹配）
      const existingTask = await prismaClient.scanTask.findFirst({
        where: {
          taskType: 'manual',
          repositoryIds: JSON.stringify([repo.id])
        }
      });

      if (!existingTask) {
        // 如果不存在，创建默认任务
        const now = BigInt(Date.now());
        await prismaClient.scanTask.create({
          data: {
            name: repo.name,
            description: `手动同步仓库 ${repo.name} 的提交记录`,
            taskType: 'manual',
            scanRangeType: '2weeks', // 与统计页「同步」一致（近 2 周）
            repositoryIds: JSON.stringify([repo.id]),
            enabled: true,
            createdAt: now,
            updatedAt: now
          }
        });
      } else {
        // 如果存在，更新任务名称和描述（仓库名称可能变化）
        const now = BigInt(Date.now());
        await prismaClient.scanTask.update({
          where: { id: existingTask.id },
          data: {
            name: repo.name,
            description: `手动同步仓库 ${repo.name} 的提交记录`,
            updatedAt: now
          }
        });
      }
    }

    // 清理已删除或禁用的仓库的任务
    const allTasks = await prismaClient.scanTask.findMany({
      where: {
        taskType: 'manual',
        repositoryIds: { not: null }
      }
    });

    for (const task of allTasks) {
      if (task.repositoryIds) {
        const repoIds = JSON.parse(task.repositoryIds) as string[];
        if (repoIds.length === 1) {
          const repoId = repoIds[0];
          const repoExists = repositories.some(r => r.id === repoId);
          if (!repoExists) {
            // 仓库已删除或禁用，删除对应的任务
            await prismaClient.scanTask.delete({
              where: { id: task.id }
            });
          }
        }
      }
    }
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
