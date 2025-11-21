import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { ScanRequestSchema } from '../schemas/api.schema.js';
import { RepositoryService } from '../services/RepositoryService.js';
import { GitScanService } from '../services/GitScanService.js';
import { CommitService } from '../services/CommitService.js';
import { logger } from '../config/logger.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import type { Config } from '../schemas/config.schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = new Hono();
const repositoryService = new RepositoryService();
const commitService = new CommitService();

/**
 * 加载配置文件
 */
function loadConfig(): Config {
  const configPath = path.join(__dirname, '../../config/repositories.json');
  const configContent = readFileSync(configPath, 'utf-8');
  return JSON.parse(configContent);
}

/**
 * 扫描仓库
 */
async function scanRepositories(repositoryIds?: string[]) {
  const config = loadConfig();
  let scannedCount = 0;

  for (const repoConfig of config.repositories) {
    if (!repoConfig.enabled) continue;
    if (repositoryIds && !repositoryIds.includes(repoConfig.id)) continue;

    try {
      logger.info(`[扫描开始] 仓库: ${repoConfig.name}, 路径: ${repoConfig.path}`);

      // 获取上次扫描时间
      const lastScanTime = await repositoryService.getLastScanTime(repoConfig.id);
      const fromDate = lastScanTime ? new Date(lastScanTime) : new Date('2000-01-01');
      
      logger.info(`[增量扫描] 从 ${fromDate.toISOString()} 开始扫描`);

      // 执行扫描
      const scanner = new GitScanService(repoConfig.path);
      const commits = await scanner.incrementalScan(fromDate, config.author.email);

      logger.info(`[扫描完成] 发现 ${commits.length} 个提交记录`);

      if (commits.length > 0) {
        // 保存提交记录（带去重）
        const insertResult = await commitService.batchInsertCommits(repoConfig.id, commits);
        
        logger.info(`[数据入库] 新增: ${insertResult.inserted} 条, 跳过重复: ${insertResult.skipped} 条`);

        // 更新仓库信息
        const result = await commitService.getCommits({
          startDate: 0,
          endDate: Date.now(),
          repositoryIds: [repoConfig.id],
          page: 1,
          pageSize: 1
        });
        const totalCommits = result.total;

        await repositoryService.updateRepositoryScanInfo(
          repoConfig.id,
          Date.now(),
          totalCommits
        );

        logger.info(`[仓库更新] ${repoConfig.name} 总计 ${totalCommits} 条提交记录`);
        scannedCount++;
      } else {
        logger.info(`[无新数据] ${repoConfig.name} 没有新的提交记录`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error({
        msg: `Failed to scan repository ${repoConfig.name}`,
        error: errorMessage,
        stack: errorStack,
        repositoryId: repoConfig.id,
        repositoryPath: repoConfig.path
      });
    }
  }

  return scannedCount;
}

// 获取所有仓库
app.get('/', async (c) => {
  const repositories = await repositoryService.getAllRepositories();
  return c.json(repositories);
});

// 获取单个仓库
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const repository = await repositoryService.getRepositoryById(id);
  
  if (!repository) {
    return c.json({ error: 'Repository not found' }, 404);
  }
  
  return c.json(repository);
});

// 手动触发扫描
app.post('/scan', zValidator('json', ScanRequestSchema), async (c) => {
  const { repositoryIds } = c.req.valid('json');
  
  try {
    const scannedCount = await scanRepositories(repositoryIds);
    return c.json({ success: true, scannedCount });
  } catch (error) {
    logger.error('Scan failed:', error);
    return c.json({ success: false, error: 'Scan failed' }, 500);
  }
});

export default app;

