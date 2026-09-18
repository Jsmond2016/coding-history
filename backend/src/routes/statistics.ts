import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { DataOverviewQuerySchema, StatisticsQuerySchema } from '../schemas/api.schema.js';
import { CommitService } from '../services/CommitService.js';
import { cacheService } from '../services/CacheService.js';

const app = new Hono();
const commitService = new CommitService();

app.get('/overview', zValidator('query', DataOverviewQuerySchema), async (c) => {
  const query = c.req.valid('query');

  const params = {
    startDate: query.startDate,
    endDate: query.endDate,
    repositoryIds: query.repositoryIds,
    authorEmails: query.authorEmails
  };
  const overview = await cacheService.getOrSet('commits', { endpoint: 'overview', ...params }, 300, () =>
    commitService.getDataOverview(params)
  );

  return c.json(overview);
});

// 获取统计数据
app.get('/', zValidator('query', StatisticsQuerySchema), async (c) => {
  const query = c.req.valid('query');

  console.log('[Statistics API] Query params:', {
    startDate: query.startDate,
    endDate: query.endDate,
    repositoryIds: query.repositoryIds,
    authorEmails: query.authorEmails
  });

  const params = {
    startDate: query.startDate,
    endDate: query.endDate,
    repositoryIds: query.repositoryIds,
    authorEmails: query.authorEmails
  };
  const statistics = await cacheService.getOrSet('commits', { endpoint: 'statistics', ...params }, 300, () =>
    commitService.getStatistics(params)
  );

  console.log('[Statistics API] Result:', {
    totalCommits: statistics.totalCommits
  });

  return c.json(statistics);
});

export default app;
