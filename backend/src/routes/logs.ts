import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { LogsQuerySchema } from '../schemas/api.schema.js';
import { LogService } from '../services/LogService.js';

const app = new Hono();
const logService = new LogService();

// 查询服务器日志
app.get('/server', zValidator('query', LogsQuerySchema), async (c) => {
  const query = c.req.valid('query');
  
  try {
    const result = await logService.getServerLogs({
      startTime: query.startTime,
      endTime: query.endTime,
      page: query.page,
      pageSize: query.pageSize,
      type: query.type
    });

    return c.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({ error: errorMessage }, 500);
  }
});

// 查询请求日志
app.get('/request', zValidator('query', LogsQuerySchema), async (c) => {
  const query = c.req.valid('query');
  
  try {
    const result = await logService.getRequestLogs({
      startTime: query.startTime,
      endTime: query.endTime,
      page: query.page,
      pageSize: query.pageSize,
      statusCode: query.statusCode,
      module: query.module
    });

    return c.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({ error: errorMessage }, 500);
  }
});

// 查询定时任务日志
app.get('/scheduled-task', zValidator('query', LogsQuerySchema), async (c) => {
  const query = c.req.valid('query');
  
  try {
    const result = await logService.getScheduledTaskLogs({
      startTime: query.startTime,
      endTime: query.endTime,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status
    });

    return c.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({ error: errorMessage }, 500);
  }
});

// 手动清理旧日志
app.post('/clean', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const days = body.days || 30;
    
    const result = await logService.cleanOldLogs(days);
    
    return c.json({
      message: `已清理 ${result.deleted} 条旧日志`,
      deleted: result.deleted
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return c.json({ error: errorMessage }, 500);
  }
});

export default app;

