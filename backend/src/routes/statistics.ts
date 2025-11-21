import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { StatisticsQuerySchema } from '../schemas/api.schema.js';
import { CommitService } from '../services/CommitService.js';

const app = new Hono();
const commitService = new CommitService();

// 获取统计数据
app.get('/', zValidator('query', StatisticsQuerySchema), async (c) => {
  const query = c.req.valid('query');
  
  const statistics = await commitService.getStatistics({
    startDate: query.startDate,
    endDate: query.endDate,
    repositoryIds: query.repositoryIds
  });

  return c.json(statistics);
});

export default app;

