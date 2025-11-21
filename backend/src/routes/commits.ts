import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CommitsQuerySchema } from '../schemas/api.schema.js';
import { CommitService } from '../services/CommitService.js';

const app = new Hono();
const commitService = new CommitService();

// 获取提交记录列表
app.get('/', zValidator('query', CommitsQuerySchema), async (c) => {
  const query = c.req.valid('query');
  
  const result = await commitService.getCommits({
    startDate: query.startDate,
    endDate: query.endDate,
    repositoryIds: query.repositoryIds,
    page: query.page,
    pageSize: query.pageSize
  });

  return c.json({
    data: result.data,
    total: result.total,
    page: query.page,
    pageSize: query.pageSize
  });
});

export default app;

