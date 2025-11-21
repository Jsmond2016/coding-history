import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { StatisticsQuerySchema } from '../schemas/api.schema.js';
import { CommitService } from '../services/CommitService.js';

const app = new Hono();
const commitService = new CommitService();

// 获取统计数据
app.get('/', zValidator('query', StatisticsQuerySchema), async (c) => {
  const query = c.req.valid('query');
  
  console.log('[Statistics API] Query params:', {
    startDate: query.startDate,
    endDate: query.endDate,
    repositoryIds: query.repositoryIds
  });
  
  const statistics = await commitService.getStatistics({
    startDate: query.startDate,
    endDate: query.endDate,
    repositoryIds: query.repositoryIds
  });

  console.log('[Statistics API] Result:', {
    totalCommits: statistics.totalCommits
  });

  return c.json(statistics);
});

export default app;

