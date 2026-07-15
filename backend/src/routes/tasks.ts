import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CreateScanTaskSchema, UpdateScanTaskSchema, TriggerTaskSchema } from '../schemas/api.schema.js';
import { ScanTaskService } from '../services/ScanTaskService.js';
import { ScanRunService } from '../services/ScanRunService.js';
import { logger } from '../config/logger.js';
import { restartScheduler } from '../jobs/scanScheduler.js';

const app = new Hono();
const taskService = new ScanTaskService();
const scanRunService = new ScanRunService();

const parseTaskId = (value: string): number | null => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const getScheduledPlan = async (id: number) => {
  const task = await taskService.getTaskById(id);
  return task?.taskType === 'scheduled' ? task : null;
};

// 计划管理只展示定时计划，历史手动任务保留在数据库中。
app.get('/', async (c) => {
  try {
    return c.json(await taskService.getAllTasks());
  } catch (error) {
    logger.error('[获取扫描计划] 失败:', error);
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

app.get('/primary', async (c) => {
  try {
    return c.json(await taskService.getPrimaryTask());
  } catch (error) {
    logger.error('[获取默认计划] 失败:', error);
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

app.get('/:id', async (c) => {
  const id = parseTaskId(c.req.param('id'));
  if (!id) return c.json({ error: '无效的计划 ID' }, 400);
  const task = await getScheduledPlan(id);
  return task ? c.json(task) : c.json({ error: '扫描计划不存在' }, 404);
});

app.post('/', zValidator('json', CreateScanTaskSchema), async (c) => {
  const params = c.req.valid('json');
  if (params.taskType !== 'scheduled') return c.json({ error: '任务管理仅支持定时扫描计划' }, 400);
  if (params.scanRangeType === 'custom') return c.json({ error: '定时计划不支持固定日期范围' }, 400);
  if (!params.cronExpression?.trim()) return c.json({ error: '定时计划必须设置执行时间' }, 400);
  if (!params.repositoryIds?.length) return c.json({ error: '定时计划至少需要一个数据源' }, 400);

  try {
    const task = await taskService.createTask({ ...params, taskType: 'scheduled' });
    if (task.enabled) await restartScheduler();
    return c.json(task, 201);
  } catch (error) {
    logger.error('[创建扫描计划] 失败:', error);
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

app.put('/:id', zValidator('json', UpdateScanTaskSchema), async (c) => {
  const id = parseTaskId(c.req.param('id'));
  if (!id) return c.json({ error: '无效的计划 ID' }, 400);
  const params = c.req.valid('json');

  try {
    const current = await getScheduledPlan(id);
    if (!current) return c.json({ error: '扫描计划不存在' }, 404);
    if (params.taskType && params.taskType !== 'scheduled') return c.json({ error: '计划类型不能改为手动任务' }, 400);
    if (params.scanRangeType === 'custom') return c.json({ error: '定时计划不支持固定日期范围' }, 400);
    const cronExpression = params.cronExpression ?? current.cronExpression;
    const repositoryIds = params.repositoryIds ?? current.repositoryIds;
    if (!cronExpression?.trim()) return c.json({ error: '定时计划必须设置执行时间' }, 400);
    if (!repositoryIds?.length) return c.json({ error: '定时计划至少需要一个数据源' }, 400);
    if (current.isPrimary && params.enabled === false) {
      return c.json({ error: '默认计划不能停用，请先将其他计划设为默认' }, 400);
    }

    const task = await taskService.updateTask(id, { ...params, taskType: 'scheduled' });
    await restartScheduler();
    return c.json(task);
  } catch (error) {
    logger.error('[更新扫描计划] 失败:', error);
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

app.delete('/:id', async (c) => {
  const id = parseTaskId(c.req.param('id'));
  if (!id) return c.json({ error: '无效的计划 ID' }, 400);
  try {
    await taskService.deleteTask(id);
    await restartScheduler();
    return c.json({ success: true });
  } catch (error) {
    logger.error('[删除扫描计划] 失败:', error);
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});

app.post('/:id/enable', async (c) => {
  const id = parseTaskId(c.req.param('id'));
  if (!id) return c.json({ error: '无效的计划 ID' }, 400);
  try {
    const task = await getScheduledPlan(id);
    if (!task) return c.json({ error: '扫描计划不存在' }, 404);
    const updated = await taskService.enableTask(id);
    await restartScheduler();
    return c.json(updated);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});

app.post('/:id/disable', async (c) => {
  const id = parseTaskId(c.req.param('id'));
  if (!id) return c.json({ error: '无效的计划 ID' }, 400);
  try {
    const task = await getScheduledPlan(id);
    if (!task) return c.json({ error: '扫描计划不存在' }, 404);
    const updated = await taskService.disableTask(id);
    await restartScheduler();
    return c.json(updated);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});

app.post('/:id/trigger', zValidator('json', TriggerTaskSchema), async (c) => {
  const id = parseTaskId(c.req.param('id'));
  if (!id) return c.json({ error: '无效的计划 ID' }, 400);
  try {
    const task = await getScheduledPlan(id);
    if (!task) return c.json({ error: '扫描计划不存在' }, 404);
    const requestedRepositoryIds = c.req.valid('json').repositoryIds;
    const planRepositoryIds = new Set(task.repositoryIds ?? []);
    const effectiveRepositoryIds = requestedRepositoryIds?.length
      ? requestedRepositoryIds.filter((repositoryId) => planRepositoryIds.has(repositoryId))
      : task.repositoryIds;
    if (!effectiveRepositoryIds?.length) return c.json({ error: '没有可执行的数据源' }, 400);
    const run = await scanRunService.createPlanRun(
      { ...task, repositoryIds: effectiveRepositoryIds },
      'manual'
    );
    return c.json({ runId: run.id, taskId: id, taskName: task.name }, 202);
  } catch (error) {
    logger.error('[触发扫描计划] 失败:', error);
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});

app.post('/:id/set-primary', async (c) => {
  const id = parseTaskId(c.req.param('id'));
  if (!id) return c.json({ error: '无效的计划 ID' }, 400);
  try {
    const primaryTask = await taskService.setPrimaryTask(id);
    return c.json(primaryTask);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});

export default app;
