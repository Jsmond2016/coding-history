import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CommitsQuerySchema, CommitsByDateQuerySchema } from '../schemas/api.schema.js';
import { CommitService } from '../services/CommitService.js';
import { cacheService } from '../services/CacheService.js';

const app = new Hono();
const commitService = new CommitService();

// 获取全部已入库提交的时间范围
app.get('/date-range', async (c) => {
  const result = await cacheService.getOrSet('commits', { endpoint: 'date-range' }, 300, () =>
    commitService.getCommitDateRange()
  );

  return c.json(result);
});

// 获取提交记录列表（按日期分组）
app.get('/by-date', zValidator('query', CommitsByDateQuerySchema), async (c) => {
  const query = c.req.valid('query');


  const params = {
    startDate: query.startDate,
    endDate: query.endDate,
    repositoryIds: query.repositoryIds,
    authorEmails: query.authorEmails,
    overtimeMode: query.overtimeMode ?? (
      query.isOvertime === true
        ? 'overtime_days'
        : query.isOvertime === false
          ? 'non_overtime_days'
          : 'all'
    )
  };
  const result = await cacheService.getOrSet('commits', { endpoint: 'by-date', ...params }, 180, () =>
    commitService.getCommitsByDate(params)
  );


  return c.json({
    data: result.data,
    total: result.total,
    metricsConfig: result.metricsConfig
  });
});

// 获取提交记录列表（旧接口，保持兼容）
app.get('/', zValidator('query', CommitsQuerySchema), async (c) => {
  const query = c.req.valid('query');

  console.log('[Commits API] Query params:', {
    startDate: query.startDate,
    endDate: query.endDate,
    repositoryIds: query.repositoryIds,
    authorEmails: query.authorEmails,
    page: query.page,
    pageSize: query.pageSize
  });

  const params = {
    startDate: query.startDate,
    endDate: query.endDate,
    repositoryIds: query.repositoryIds,
    authorEmails: query.authorEmails,
    page: query.page,
    pageSize: query.pageSize
  };
  const result = await cacheService.getOrSet('commits', { endpoint: 'list', ...params }, 120, () =>
    commitService.getCommits(params)
  );

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
