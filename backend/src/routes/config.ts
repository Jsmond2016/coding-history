import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ConfigService } from '../services/ConfigService.js';
import { RepositoryService } from '../services/RepositoryService.js';
import { DataMetricsConfigService } from '../services/DataMetricsConfigService.js';
import { logger } from '../config/logger.js';
import { restartScheduler } from '../jobs/scanScheduler.js';
import type { WorkStatus } from '../config/workStatus.config.js';
import { prisma } from '../db/client.js';

const app = new Hono();
const configService = new ConfigService();
const repositoryService = new RepositoryService();
const dataMetricsConfigService = new DataMetricsConfigService();

// Schema 定义
const CreateRepositorySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  enabled: z.boolean().default(true)
});

const UpdateRepositorySchema = z.object({
  name: z.string().optional(),
  path: z.string().optional(),
  enabled: z.boolean().optional()
});

const CreateAuthorSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  isDefault: z.boolean().default(false)
});

const CreateIgnoredBranchSchema = z.object({
  branchName: z.string()
});

// 获取所有仓库配置
app.get('/repositories', async (c) => {
  try {
    const configs = await configService.getAllRepositoriesConfig();
    return c.json({ data: configs });
  } catch (error) {
    logger.error('Failed to get repositories config:', error);
    return c.json({ error: 'Failed to get repositories config' }, 500);
  }
});

// 创建仓库配置
app.post('/repositories', zValidator('json', CreateRepositorySchema), async (c) => {
  try {
    const data = c.req.valid('json');
    const now = BigInt(Date.now());

    // 创建仓库（包括 enabled 状态）
    await repositoryService.upsertRepository({
      id: data.id,
      name: data.name,
      path: data.path,
      enabled: data.enabled
    });

    const config = await configService.getRepositoryConfig(data.id);
    return c.json({ data: config }, 201);
  } catch (error) {
    logger.error('Failed to create repository:', error);
    return c.json({ error: 'Failed to create repository' }, 500);
  }
});

// 更新仓库配置
app.put('/repositories/:id', zValidator('json', UpdateRepositorySchema), async (c) => {
  try {
    const repoId = c.req.param('id');
    const data = c.req.valid('json');
    const now = BigInt(Date.now());

    await prisma.repository.update({
      where: { id: repoId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.path !== undefined && { path: data.path }),
        ...(data.enabled !== undefined && { enabled: data.enabled }),
        updatedAt: now
      }
    });

    const config = await configService.getRepositoryConfig(repoId);
    return c.json({ data: config });
  } catch (error) {
    logger.error('Failed to update repository:', error);
    return c.json({ error: 'Failed to update repository' }, 500);
  }
});

// 删除仓库配置
app.delete('/repositories/:id', async (c) => {
  try {
    const repoId = c.req.param('id');

    const { prisma } = await import('../db/client.js');
    await prisma.repository.delete({
      where: { id: repoId }
    });

    return c.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete repository:', error);
    return c.json({ error: 'Failed to delete repository' }, 500);
  }
});

// 获取仓库作者列表
app.get('/repositories/:id/authors', async (c) => {
  try {
    const repoId = c.req.param('id');
    const authors = await configService.getAuthorsByRepoId(repoId);
    return c.json({ data: authors });
  } catch (error) {
    logger.error('Failed to get authors:', error);
    return c.json({ error: 'Failed to get authors' }, 500);
  }
});

// 添加作者
app.post('/repositories/:id/authors', zValidator('json', CreateAuthorSchema), async (c) => {
  try {
    const repoId = c.req.param('id');
    const data = c.req.valid('json');
    const now = BigInt(Date.now());

    const author = await prisma.author.create({
      data: {
        repoId,
        name: data.name,
        email: data.email,
        isDefault: data.isDefault,
        createdAt: now,
        updatedAt: now
      }
    });

    return c.json({ data: {
      id: author.id,
      name: author.name,
      email: author.email,
      isDefault: author.isDefault
    } }, 201);
  } catch (error) {
    logger.error('Failed to create author:', error);
    return c.json({ error: 'Failed to create author' }, 500);
  }
});

// 删除作者
app.delete('/repositories/:id/authors/:authorId', async (c) => {
  try {
    const authorId = parseInt(c.req.param('authorId'), 10);
    if (isNaN(authorId)) {
      return c.json({ error: 'Invalid author ID' }, 400);
    }

    await prisma.author.delete({
      where: { id: authorId }
    });

    return c.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete author:', error);
    return c.json({ error: 'Failed to delete author' }, 500);
  }
});

// 获取忽略分支列表
app.get('/repositories/:id/ignored-branches', async (c) => {
  try {
    const repoId = c.req.param('id');
    const branches = await prisma.ignoredBranch.findMany({
      where: { repoId },
      orderBy: { createdAt: 'asc' }
    });
    return c.json({ data: branches.map((b: { id: number; branchName: string }) => ({ id: b.id, branchName: b.branchName })) });
  } catch (error) {
    logger.error('Failed to get ignored branches:', error);
    return c.json({ error: 'Failed to get ignored branches' }, 500);
  }
});

// 添加忽略分支
app.post('/repositories/:id/ignored-branches', zValidator('json', CreateIgnoredBranchSchema), async (c) => {
  try {
    const repoId = c.req.param('id');
    const data = c.req.valid('json');
    const now = BigInt(Date.now());

    const branch = await prisma.ignoredBranch.create({
      data: {
        repoId,
        branchName: data.branchName,
        createdAt: now
      }
    });

    return c.json({ data: { id: branch.id, branchName: branch.branchName } }, 201);
  } catch (error) {
    logger.error('Failed to create ignored branch:', error);
    return c.json({ error: 'Failed to create ignored branch' }, 500);
  }
});

// 删除忽略分支
app.delete('/repositories/:id/ignored-branches/:branchId', async (c) => {
  try {
    const branchId = parseInt(c.req.param('branchId'), 10);
    if (isNaN(branchId)) {
      return c.json({ error: 'Invalid branch ID' }, 400);
    }

    await prisma.ignoredBranch.delete({
      where: { id: branchId }
    });

    return c.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete ignored branch:', error);
    return c.json({ error: 'Failed to delete ignored branch' }, 500);
  }
});

// Schema 定义
const UpdateDataMetricsConfigSchema = z.object({
  thresholds: z.object({
    relaxed: z.number().int().min(0),
    normal: z.number().int().min(0),
    busy: z.number().int().min(0),
    superCrazy: z.number().int().min(0)
  }),
  overtimeHour: z.number().int().min(0).max(23),
  labels: z.record(z.string(), z.string()),
  colors: z.record(z.string(), z.string())
});

// 获取数据指标配置
app.get('/data-metrics', async (c) => {
  try {
    const config = await dataMetricsConfigService.getConfig();
    return c.json({ data: config });
  } catch (error) {
    logger.error('Failed to get data metrics config:', error);
    return c.json({ error: 'Failed to get data metrics config' }, 500);
  }
});

// 更新数据指标配置
app.put('/data-metrics', zValidator('json', UpdateDataMetricsConfigSchema), async (c) => {
  try {
    const data = c.req.valid('json');
    const config = await dataMetricsConfigService.updateConfig(data);
    return c.json({ data: config });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to update data metrics config:', error);
    return c.json({ error: errorMessage || 'Failed to update data metrics config' }, 500);
  }
});

export default app;

