import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { ScanTaskService } from '../services/ScanTaskService.js';
import { executeScanTask } from '../services/ScanTaskExecutor.js';
import { logger } from '../config/logger.js';

/**
 * 保存当前运行的定时任务实例（支持多个任务）
 * 用于管理和控制定时任务的启动、停止和重启
 */
let currentSchedulers: ScheduledTask[] = [];

/**
 * 执行数据库中的定时任务
 * 根据任务ID执行对应的扫描任务
 */
async function executeDatabaseTask(taskId: number): Promise<void> {
  try {
    const taskService = new ScanTaskService();
    const task = await taskService.getTaskById(taskId);

    if (!task) {
      logger.error(`[定时任务] 任务 ID ${taskId} 不存在`);
      return;
    }

    if (!task.enabled) {
      logger.debug(`[定时任务] 任务 ${task.name} 已禁用，跳过执行`);
      return;
    }

    logger.info(`[定时任务] 开始执行数据库任务: ${task.name}`);

    // 执行任务
    const result = await executeScanTask(task, { taskId: task.id });

    // 更新最后执行时间
    await taskService.updateLastExecuteTime(task.id, Date.now());

    if (result.success) {
      logger.info(`[定时任务] 任务 ${task.name} 执行成功，扫描 ${result.scannedRepositories.length} 个仓库，新增 ${result.totalCommits} 条提交`);
    } else {
      logger.error(`[定时任务] 任务 ${task.name} 执行失败: ${result.errorMessage}`);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[定时任务] 执行数据库任务失败: ${errorMsg}`);
  }
}

/**
 * 启动定时任务调度器
 * 
 * 功能说明：
 * 1. 如果已有定时任务在运行，先停止旧任务
 * 2. 从数据库加载启用的定时任务
 * 3. 支持多个定时任务同时运行
 *
 * 数据库任务：
 * - 从 ScanTask 表中加载 taskType='scheduled' 且 enabled=true 的任务
 * - 每个任务使用自己的 Cron 表达式和扫描配置
 *
 * 注意：
 * - 启动时只注册调度器，不执行额外扫描
 * - 日常扫描依赖用户手动触发或定时任务按计划执行
 */
export async function startScheduler(): Promise<void> {
  // 如果已有定时任务在运行，先停止（避免重复启动）
  if (currentSchedulers.length > 0) {
    logger.info('[定时任务] 检测到已有任务运行，先停止旧任务');
    stopScheduler();
  }

  const taskService = new ScanTaskService();
  const schedulers: ScheduledTask[] = [];

  // 加载数据库中的定时任务
  try {
    const dbTasks = await taskService.getEnabledScheduledTasks();

    if (dbTasks.length > 0) {
      dbTasks.forEach((task) => {
        if (!task.cronExpression) {
          logger.warn(`[定时任务] 任务 ${task.name} 没有 Cron 表达式，跳过`);
          return;
        }

        const taskHandler = () => {
          executeDatabaseTask(task.id).catch((error) => {
            logger.error(`[定时任务] 执行数据库任务 ${task.name} 失败:`, error);
          });
        };

        const scheduledTask = cron.schedule(task.cronExpression, taskHandler, {
          timezone: 'Asia/Shanghai'  // 显式设置时区，确保定时任务按北京时间执行
        });

        schedulers.push(scheduledTask);
        logger.info(
          `[定时任务] 数据库任务 "${task.name}" 调度已启动，Cron 表达式: ${task.cronExpression}`
        );
      });
    }
  } catch (error) {
    logger.error('[定时任务] 加载数据库任务失败:', error);
  }

  // 检查是否有任何任务
  if (schedulers.length === 0) {
    logger.warn('[定时任务] 未找到任何定时任务，调度器未启动');
    return;
  }

  currentSchedulers = schedulers;
  logger.info(`[定时任务] 调度器已启动，共 ${currentSchedulers.length} 个定时任务`);
}

/**
 * 停止定时任务调度器
 * 
 * 功能说明：
 * 1. 停止所有正在运行的定时任务
 * 2. 清空任务列表
 * 3. 记录停止日志
 * 
 * 注意：停止后的任务无法自动恢复，需要调用 startScheduler() 重新启动
 */
export function stopScheduler(): void {
  if (currentSchedulers.length === 0) {
    logger.debug('[定时任务] 没有运行中的任务');
    return;
  }

  // 停止所有定时任务
  currentSchedulers.forEach((scheduler, index) => {
    scheduler.stop();
    logger.info(`[定时任务] 调度器 ${index + 1} 已停止`);
  });

  // 清空任务列表
  currentSchedulers = [];
  logger.info('[定时任务] 所有调度器已停止');
}

/**
 * 重启定时任务调度器
 * 
 * 功能说明：
 * 1. 停止当前所有定时任务
 * 2. 重新加载数据库任务
 * 3. 使用新配置启动定时任务
 * 
 * 使用场景：
 * - 数据库任务更新时调用
 * - 需要更新定时任务配置时调用
 * 
 * @returns {Promise<void>}
 */
export async function restartScheduler(): Promise<void> {
  logger.info('[定时任务] 正在重启调度器...');

  // 停止当前定时任务
  stopScheduler();

  // 启动新的定时任务（会读取最新数据库任务）
  await startScheduler();

  logger.info('[定时任务] 调度器已使用新配置重启');
}
