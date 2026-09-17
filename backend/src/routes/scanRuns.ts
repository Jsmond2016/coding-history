import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ScanRunService } from '../services/ScanRunService.js';

const app = new Hono();
const scanRunService = new ScanRunService();
const CreateScanRunSchema = z.object({
  startDate: z.number().int().positive(),
  endDate: z.number().int().positive(),
  repositoryIds: z.array(z.string().min(1)).optional()
}).refine((value) => value.startDate < value.endDate, {
  message: '开始时间必须早于结束时间',
  path: ['endDate']
});

app.post('/', zValidator('json', CreateScanRunSchema), async (c) => {
  try {
    const run = await scanRunService.createManualRun(c.req.valid('json'));
    return c.json(run, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: message }, 400);
  }
});

app.get('/', async (c) => {
  const planIdValue = c.req.query('planId');
  const limitValue = c.req.query('limit');
  const runs = await scanRunService.listRuns({
    planId: planIdValue ? Number(planIdValue) : undefined,
    limit: limitValue ? Number(limitValue) : undefined
  });
  return c.json(runs);
});

app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: '无效的执行 ID' }, 400);
  const run = await scanRunService.getRun(id);
  return run ? c.json(run) : c.json({ error: '扫描执行不存在' }, 404);
});

export default app;
