import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { ConfigService } from '../services/ConfigService.js';
import { RepositoryService } from '../services/RepositoryService.js';
import { DataMetricsConfigService } from '../services/DataMetricsConfigService.js';
import { ScanTaskService } from '../services/ScanTaskService.js';
import { logger } from '../config/logger.js';
import { restartScheduler } from '../jobs/scanScheduler.js';
import { runDatabaseBackup } from '../jobs/dbBackupScheduler.js';
import type { WorkStatus } from '../config/workStatus.config.js';
import { prisma } from '../db/client.js';

const MAX_SCAN_DEPTH = 10;

/** 将字符串转为 kebab-case，用于仓库 id */
function toKebabId(name: string): string {
  return name
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .toLowerCase()
    .replace(/^-|-$/g, '') || 'repo';
}

/** 判断目录是否为 Git 仓库（包含 .git 且为目录） */
function isGitRepository(dirPath: string): boolean {
  try {
    const gitPath = path.join(dirPath, '.git');
    return fs.existsSync(gitPath) && fs.statSync(gitPath).isDirectory();
  } catch {
    return false;
  }
}

/** 扫描目录下所有 Git 仓库（递归子目录，限制深度） */
function scanDirectoryForGitRepos(rootPath: string): { path: string; name: string; id: string }[] {
  const resolvedRoot = path.resolve(rootPath);
  if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
    return [];
  }
  const results: { path: string; name: string; id: string }[] = [];

  function walk(currentPath: string, depth: number): void {
    if (depth > MAX_SCAN_DEPTH) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const fullPath = path.join(currentPath, entry.name);
      if (isGitRepository(fullPath)) {
        results.push({
          path: fullPath,
          name: entry.name,
          id: toKebabId(entry.name)
        });
        // 已是 Git 仓库，不再深入其内部
      } else {
        // 非 Git 仓库，递归扫描子目录
        walk(fullPath, depth + 1);
      }
    }
  }

  walk(resolvedRoot, 0);
  return results;
}

const app = new Hono();
const configService = new ConfigService();
const repositoryService = new RepositoryService();
const dataMetricsConfigService = new DataMetricsConfigService();
const taskService = new ScanTaskService();

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

const ScanDirectorySchema = z.object({
  rootPath: z.string().min(1, '请输入根目录路径')
});

const BatchAuthorSchema = z.object({
  name: z.string().min(1),
  email: z.string().email()
});

const BatchCreateRepositoriesSchema = z.object({
  repositories: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      path: z.string(),
      enabled: z.boolean().default(true)
    })
  ),
  author: BatchAuthorSchema.optional()
});

const BatchDeleteRepositoriesSchema = z.object({
  ids: z.array(z.string()).min(1, '请选择要删除的仓库')
});

// 扫描目录下的 Git 仓库
app.post('/scan-directory', zValidator('json', ScanDirectorySchema), async (c) => {
  try {
    const { rootPath } = c.req.valid('json');
    const repos = scanDirectoryForGitRepos(rootPath);
    return c.json({ data: repos });
  } catch (error) {
    logger.error('Failed to scan directory:', error);
    return c.json({ error: '扫描目录失败' }, 500);
  }
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

// 批量创建仓库配置（支持批量作者，用于扫描仓库后一键保存）
app.post('/repositories/batch', zValidator('json', BatchCreateRepositoriesSchema), async (c) => {
  try {
    const { repositories, author } = c.req.valid('json');
    if (repositories.length === 0) {
      return c.json({ error: 'repositories 不能为空' }, 400);
    }
    const now = BigInt(Date.now());

    for (const repo of repositories) {
      await repositoryService.upsertRepository({
        id: repo.id,
        name: repo.name,
        path: repo.path,
        enabled: repo.enabled
      });
      if (author?.name && author?.email) {
        await prisma.author.create({
          data: {
            repoId: repo.id,
            name: author.name.trim(),
            email: author.email.trim(),
            isDefault: true,
            createdAt: now,
            updatedAt: now
          }
        }).catch((err: unknown) => {
          if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') return;
          throw err;
        });
      }
    }

    await taskService.syncDefaultRepositoryTasks();

    const configs = await configService.getAllRepositoriesConfig();
    return c.json({ data: configs }, 201);
  } catch (error) {
    logger.error('Failed to batch create repositories:', error);
    return c.json({ error: 'Failed to batch create repositories' }, 500);
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

    // 如果仓库启用，同步创建对应的默认手动任务
    if (data.enabled) {
      await taskService.syncDefaultRepositoryTasks();
    }

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

    // 同步默认仓库任务（如果仓库名称或启用状态变化）
    if (data.name !== undefined || data.enabled !== undefined) {
      await taskService.syncDefaultRepositoryTasks();
    }

    const config = await configService.getRepositoryConfig(repoId);
    return c.json({ data: config });
  } catch (error) {
    logger.error('Failed to update repository:', error);
    return c.json({ error: 'Failed to update repository' }, 500);
  }
});

// 批量删除仓库配置（先删该仓库下的提交记录，因 DB 中外键为 ON DELETE RESTRICT）
app.post('/repositories/batch-delete', zValidator('json', BatchDeleteRepositoriesSchema), async (c) => {
  try {
    const { ids } = c.req.valid('json');
    await prisma.commit.deleteMany({
      where: { repoId: { in: ids } }
    });
    const result = await prisma.repository.deleteMany({
      where: { id: { in: ids } }
    });
    await taskService.syncDefaultRepositoryTasks();
    return c.json({ success: true, deleted: result.count });
  } catch (error) {
    logger.error('Failed to batch delete repositories:', error);
    return c.json({ error: 'Failed to batch delete repositories' }, 500);
  }
});

// 删除仓库配置（先删该仓库下的提交记录，因 DB 中外键为 ON DELETE RESTRICT）
app.delete('/repositories/:id', async (c) => {
  try {
    const repoId = c.req.param('id');

    const { prisma } = await import('../db/client.js');
    await prisma.commit.deleteMany({
      where: { repoId }
    });
    await prisma.repository.delete({
      where: { id: repoId }
    });
    await taskService.syncDefaultRepositoryTasks();

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

// 手动备份数据库
app.post('/database/backup', async (c) => {
  try {
    const result = runDatabaseBackup();
    if (result.success) {
      return c.json({
        success: true,
        message: '数据库备份成功',
        destPath: result.destPath
      });
    } else {
      return c.json({
        success: false,
        error: result.error || '备份失败'
      }, 500);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to backup database:', error);
    return c.json({ error: errorMessage }, 500);
  }
});

export default app;

