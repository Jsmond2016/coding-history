import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CreateScanTaskSchema, UpdateScanTaskSchema, TriggerTaskSchema } from '../schemas/api.schema.js';
import { ScanTaskService } from '../services/ScanTaskService.js';
import { executeScanTask } from '../services/ScanTaskExecutor.js';
import { logger } from '../config/logger.js';
import { restartScheduler } from '../jobs/scanScheduler.js';

const app = new Hono();
const taskService = new ScanTaskService();

// 获取所有任务列表
app.get('/', async (c) => {
  try {
    // 同步默认仓库任务（确保每个仓库都有对应的手动任务）
    await taskService.syncDefaultRepositoryTasks();
    const tasks = await taskService.getAllTasks();
    return c.json(tasks);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[获取任务列表] 失败:', error);
    return c.json({ error: errorMessage }, 500);
  }
});

// 获取预定义默认任务列表
app.get('/default', async (c) => {
  try {
    const defaultTasks = await taskService.getDefaultTasks();
    return c.json(defaultTasks);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[获取默认任务列表] 失败:', error);
    return c.json({ error: errorMessage }, 500);
  }
});

// 获取单个任务详情
app.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid task ID' }, 400);
  }

  try {
    const task = await taskService.getTaskById(id);

    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }

    return c.json(task);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[获取任务详情] 失败:', error);
    return c.json({ error: errorMessage }, 500);
  }
});

// 创建新任务
app.post('/', zValidator('json', CreateScanTaskSchema), async (c) => {
  const params = c.req.valid('json');

  try {
    // 验证自定义时间范围
    if (params.scanRangeType === 'custom') {
      if (!params.startDate || !params.endDate) {
        return c.json({ error: '自定义时间范围必须提供开始时间和结束时间' }, 400);
      }
    }

    // 验证定时任务必须有 Cron 表达式
    if (params.taskType === 'scheduled' && !params.cronExpression) {
      return c.json({ error: '定时任务必须提供 Cron 表达式' }, 400);
    }

    const task = await taskService.createTask(params);

    // 如果是启用的定时任务，重启调度器使配置生效
    if (task.enabled && task.taskType === 'scheduled') {
      await restartScheduler();
      logger.info(`[创建任务] 定时任务 ${task.name} 已创建，调度器已重启`);
    }

    return c.json(task, 201);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[创建任务] 失败:', error);
    return c.json({ error: errorMessage }, 500);
  }
});

// 更新任务
app.put('/:id', zValidator('json', UpdateScanTaskSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  const params = c.req.valid('json');

  if (isNaN(id)) {
    return c.json({ error: 'Invalid task ID' }, 400);
  }

  try {
    // 验证自定义时间范围
    if (params.scanRangeType === 'custom' || (await taskService.getTaskById(id))?.scanRangeType === 'custom') {
      const finalStartDate = params.startDate ?? (await taskService.getTaskById(id))?.startDate;
      const finalEndDate = params.endDate ?? (await taskService.getTaskById(id))?.endDate;
      
      if (!finalStartDate || !finalEndDate) {
        return c.json({ error: '自定义时间范围必须提供开始时间和结束时间' }, 400);
      }
    }

    // 验证定时任务必须有 Cron 表达式
    if (params.taskType === 'scheduled' || (await taskService.getTaskById(id))?.taskType === 'scheduled') {
      const finalCron = params.cronExpression ?? (await taskService.getTaskById(id))?.cronExpression;
      if (!finalCron) {
        return c.json({ error: '定时任务必须提供 Cron 表达式' }, 400);
      }
    }

    const task = await taskService.updateTask(id, params);

    // 如果是定时任务，重启调度器使配置生效
    if (task.taskType === 'scheduled') {
      await restartScheduler();
      logger.info(`[更新任务] 定时任务 ${task.name} 已更新，调度器已重启`);
    }

    return c.json(task);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[更新任务] 失败:', error);
    return c.json({ error: errorMessage }, 500);
  }
});

// 删除任务
app.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid task ID' }, 400);
  }

  try {
    const task = await taskService.getTaskById(id);
    await taskService.deleteTask(id);

    // 如果删除的是定时任务，重启调度器
    if (task?.taskType === 'scheduled') {
      await restartScheduler();
      logger.info(`[删除任务] 定时任务 ${task.name} 已删除，调度器已重启`);
    }

    return c.json({ message: 'Task deleted successfully' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[删除任务] 失败:', error);
    return c.json({ error: errorMessage }, 500);
  }
});

// 启用任务
app.post('/:id/enable', async (c) => {
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid task ID' }, 400);
  }

  try {
    const task = await taskService.enableTask(id);

    // 如果是定时任务，重启调度器使配置生效
    if (task.taskType === 'scheduled') {
      await restartScheduler();
      logger.info(`[启用任务] 定时任务 ${task.name} 已启用，调度器已重启`);
    }

    return c.json(task);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[启用任务] 失败:', error);
    return c.json({ error: errorMessage }, 500);
  }
});

// 禁用任务
app.post('/:id/disable', async (c) => {
  const id = parseInt(c.req.param('id'));

  if (isNaN(id)) {
    return c.json({ error: 'Invalid task ID' }, 400);
  }

  try {
    const task = await taskService.disableTask(id);

    // 如果是定时任务，重启调度器使配置生效
    if (task.taskType === 'scheduled') {
      await restartScheduler();
      logger.info(`[禁用任务] 定时任务 ${task.name} 已禁用，调度器已重启`);
    }

    return c.json(task);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[禁用任务] 失败:', error);
    return c.json({ error: errorMessage }, 500);
  }
});

// 手动触发任务执行
app.post('/:id/trigger', zValidator('json', TriggerTaskSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  const { repositoryIds } = c.req.valid('json');

  if (isNaN(id)) {
    return c.json({ error: 'Invalid task ID' }, 400);
  }

  try {
    const task = await taskService.getTaskById(id);

    if (!task) {
      return c.json({ error: 'Task not found' }, 404);
    }

    // 如果提供了仓库ID列表，临时更新任务的仓库列表
    let taskToExecute = task;
    if (repositoryIds && repositoryIds.length > 0) {
      taskToExecute = {
        ...task,
        repositoryIds
      };
    }

    // 异步执行任务
    const startTime = Date.now();
    executeScanTask(taskToExecute, { taskId: id })
      .then(async (result) => {
        // 更新任务最后执行时间
        await taskService.updateLastExecuteTime(id, startTime);
        logger.info(`[任务触发] 任务 ${task.name} 执行完成`, result);
      })
      .catch(async (error) => {
        logger.error(`[任务触发] 任务 ${task.name} 执行失败:`, error);
        // 即使失败也更新执行时间
        await taskService.updateLastExecuteTime(id, startTime).catch(() => {});
      });

    // 立即返回
    return c.json({
      message: 'Task triggered successfully',
      taskId: id,
      taskName: task.name
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[触发任务] 失败:', error);
    return c.json({ error: errorMessage }, 500);
  }
});

export default app;

