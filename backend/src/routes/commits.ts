import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CommitsQuerySchema, CommitsByDateQuerySchema } from '../schemas/api.schema.js';
import { CommitService } from '../services/CommitService.js';

const app = new Hono();
const commitService = new CommitService();

// 获取提交记录列表（按日期分组）
app.get('/by-date', zValidator('query', CommitsByDateQuerySchema), async (c) => {
  const query = c.req.valid('query');
  
  
  const result = await commitService.getCommitsByDate({
    startDate: query.startDate,
    endDate: query.endDate,
    repositoryIds: query.repositoryIds,
    isOvertime: query.isOvertime
  });


  return c.json({
    data: result.data,
    total: result.total
  });
});

// 获取提交记录列表（旧接口，保持兼容）
app.get('/', zValidator('query', CommitsQuerySchema), async (c) => {
  const query = c.req.valid('query');
  
  console.log('[Commits API] Query params:', {
    startDate: query.startDate,
    endDate: query.endDate,
    repositoryIds: query.repositoryIds,
    page: query.page,
    pageSize: query.pageSize
  });
  
  const result = await commitService.getCommits({
    startDate: query.startDate,
    endDate: query.endDate,
    repositoryIds: query.repositoryIds,
    page: query.page,
    pageSize: query.pageSize
  });

  console.log('[Commits API] Result:', {
    total: result.total,
    dataCount: result.data.length
  });

  return c.json({
    data: result.data,
    total: result.total,
    page: query.page,
    pageSize: query.pageSize
  });
});

export default app;

