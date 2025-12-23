import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { ScanRequestSchema } from '../schemas/api.schema.js';
import { RepositoryService } from '../services/RepositoryService.js';
import { ConfigService } from '../services/ConfigService.js';
import { GitScanService } from '../services/GitScanService.js';
import { CommitService } from '../services/CommitService.js';
import { logger } from '../config/logger.js';
import simpleGit, { SimpleGit } from 'simple-git';

const app = new Hono();
const repositoryService = new RepositoryService();
const configService = new ConfigService();
const commitService = new CommitService();

// 扫描状态管理（内存存储）
let scanStatus: {
  finished: 0 | 1 | 2; // 0=未开始, 1=扫描中, 2=已完成
  scannedCount: number;
  error?: string;
} = {
  finished: 0,
  scannedCount: 0
};


/**
 * 更新 Git 仓库代码（执行 git pull）
 */
async function pullRepository(repoPath: string, repoName: string): Promise<boolean> {
  try {
    const git: SimpleGit = simpleGit(repoPath);
    
    // 检查是否为有效的 Git 仓库
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      logger.warn(`  [Git Pull] ${repoName} 不是有效的 Git 仓库，跳过更新`);
      return false;
    }

    // 检查是否有远程仓库配置
    const remotes = await git.getRemotes(true);
    if (remotes.length === 0) {
      logger.info(`  [Git Pull] ${repoName} 没有配置远程仓库，跳过更新`);
      return false;
    }

    logger.info(`  [Git Pull] 正在更新 ${repoName}...`);
    
    // 执行 git pull
    const pullResult = await git.pull();
    
    if (pullResult.summary.changes > 0 || pullResult.summary.insertions > 0 || pullResult.summary.deletions > 0) {
      logger.info(`  [Git Pull] ✓ ${repoName} 更新成功: ${pullResult.summary.changes} 个文件变更, +${pullResult.summary.insertions}/-${pullResult.summary.deletions}`);
    } else {
      logger.info(`  [Git Pull] ✓ ${repoName} 已是最新版本`);
    }
    
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn(`  [Git Pull] ⚠ ${repoName} 更新失败: ${errorMessage}，将继续扫描`);
    return false;
  }
}

/**
 * 异步扫描仓库（扫描最近2周的数据）
 */
async function scanRepositoriesAsync(repositoryIds?: string[]) {
  let scannedCount = 0;

  // 计算2周前的日期
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const fromDate = twoWeeksAgo;

  logger.info(`[手动扫描] 开始扫描最近2周的提交数据（从 ${fromDate.toISOString()} 开始）`);

  // 获取要扫描的仓库列表
  const allRepos = await configService.getEnabledRepositories();
  const reposToScan = repositoryIds && repositoryIds.length > 0
    ? allRepos.filter(repo => repositoryIds.includes(repo.id))
    : allRepos;

  for (const repo of reposToScan) {
    try {
      logger.info(`[扫描开始] 仓库: ${repo.name}, 路径: ${repo.path}`);

      // 获取该仓库的作者邮箱列表
      const authorEmails = await configService.getAuthorEmailsByRepoId(repo.id);
      if (authorEmails.length === 0) {
        logger.warn(`[跳过] 仓库 ${repo.name} 没有配置作者，跳过`);
        continue;
      }

      logger.info(`[手动扫描] 作者邮箱: ${authorEmails.join(', ')}`);

      // 先更新仓库代码到最新
      await pullRepository(repo.path, repo.name);

      // 执行扫描（最近2周，使用该仓库配置的作者邮箱）
      const scanner = new GitScanService(repo.path);
      const commits = await scanner.incrementalScan(fromDate, authorEmails, new Date());

      logger.info(`[扫描完成] 发现 ${commits.length} 个提交记录`);
      if (commits.length > 0) {
        logger.info(`[提交样本] 第一个: ${commits[0].hash} - ${commits[0].authorEmail} - ${new Date(commits[0].date).toISOString()}`);
      }

      if (commits.length > 0) {
        // 保存提交记录（带去重）
        const insertResult = await commitService.batchInsertCommits(repo.id, commits);

        logger.info(`[数据入库] 新增: ${insertResult.inserted} 条, 跳过重复: ${insertResult.skipped} 条`);

        // 更新仓库信息
        const result = await commitService.getCommits({
          startDate: 0,
          endDate: Date.now(),
          repositoryIds: [repo.id],
          page: 1,
          pageSize: 1
        });
        const totalCommits = result.total;

        await repositoryService.updateRepositoryScanInfo(
          repo.id,
          Date.now(),
          totalCommits
        );

        logger.info(`[仓库更新] ${repo.name} 总计 ${totalCommits} 条提交记录`);
        scannedCount++;
      } else {
        logger.info(`[无新数据] ${repo.name} 没有新的提交记录`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error({
        msg: `Failed to scan repository ${repo.name}`,
        error: errorMessage,
        stack: errorStack,
        repositoryId: repo.id,
        repositoryPath: repo.path
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

// 获取作者列表（必须在 /:id 路由之前定义）
// 注意：此接口已废弃，请使用 /api/v1/config/repositories/:id/authors
app.get('/authors', async (c) => {
  try {
    // 获取所有仓库的所有作者（去重）
    const allAuthors = await configService.getAllAuthorEmails();
    // 返回格式兼容旧接口
    const authors = Array.from(new Set(allAuthors)).map(email => ({
      email,
      name: email.split('@')[0] // 简单提取名称
    }));
    return c.json(authors);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('[获取作者列表] 失败:', error);
    return c.json({ error: errorMessage }, 500);
  }
});

// 获取单个仓库（必须在 /authors 等具体路由之后）
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const repository = await repositoryService.getRepositoryById(id);

  if (!repository) {
    return c.json({ error: 'Repository not found' }, 404);
  }

  return c.json(repository);
});

// 手动触发扫描（异步）
app.post('/scan', zValidator('json', ScanRequestSchema), async (c) => {
  const { repositoryIds } = c.req.valid('json');
  
  // 如果已经在扫描中，返回当前状态
  if (scanStatus.finished === 1) {
    return c.json({ 
      finished: scanStatus.finished, 
      scannedCount: scanStatus.scannedCount 
    });
  }

  // 重置状态并开始扫描（允许重新开始）
  scanStatus = {
    finished: 1, // 扫描中
    scannedCount: 0,
    error: undefined
  };

  // 异步执行扫描
  scanRepositoriesAsync(repositoryIds)
    .then((scannedCount) => {
      scanStatus = {
        finished: 2, // 已完成
        scannedCount
      };
      logger.info(`[手动扫描] 完成，共扫描 ${scannedCount} 个仓库`);
    })
    .catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      scanStatus = {
        finished: 2, // 已完成（失败）
        scannedCount: 0,
        error: errorMessage
      };
      logger.error('[手动扫描] 失败:', error);
    });

  // 立即返回状态
  return c.json({ 
    finished: scanStatus.finished, 
    scannedCount: scanStatus.scannedCount 
  });
});

// 查询扫描状态
app.get('/scan/status', async (c) => {
  return c.json({
    finished: scanStatus.finished,
    scannedCount: scanStatus.scannedCount,
    error: scanStatus.error
  });
});

export default app;

