import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { DataOverviewQuerySchema, StatisticsQuerySchema } from '../schemas/api.schema.js';
import { CommitService } from '../services/CommitService.js';

const app = new Hono();
const commitService = new CommitService();

app.get('/overview', zValidator('query', DataOverviewQuerySchema), async (c) => {
  const query = c.req.valid('query');

  const overview = await commitService.getDataOverview({
    startDate: query.startDate,
    endDate: query.endDate,
    authorEmails: query.authorEmails
  });

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

  const statistics = await commitService.getStatistics({
    startDate: query.startDate,
    endDate: query.endDate,
    repositoryIds: query.repositoryIds,
    authorEmails: query.authorEmails
  });

  console.log('[Statistics API] Result:', {
    totalCommits: statistics.totalCommits
  });

  return c.json(statistics);
});

export default app;
