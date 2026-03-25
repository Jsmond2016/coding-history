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

/** 超过该时间仍为「扫描中」则允许再次同步（应略大于前端轮询超时 5 分钟，避免僵死 finished=1） */
const SCAN_STALE_MS = 6 * 60 * 1000;

// 扫描状态管理（内存存储）
let scanStatus: {
  finished: 0 | 1 | 2; // 0=未开始, 1=扫描中, 2=已完成
  scannedCount: number;
  error?: string;
  /** 进入扫描中的时间戳（毫秒），用于检测僵死 */
  startedAt?: number;
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
 * 按筛选日期范围扫描并入库（git --since / --until）
 */
async function scanRepositoriesDateRangeAsync(
  startMs: number,
  endMs: number,
  repositoryIds?: string[]
) {
  let scannedCount = 0;

  // 直接使用客户端传入的毫秒区间（请用当天 startOf/endOf('day')），避免服务端 setHours 与客户端时区不一致
  const fromDate = new Date(startMs);
  const toDate = new Date(endMs);

  if (fromDate.getTime() >= toDate.getTime()) {
    throw new Error('扫描开始时间必须早于结束时间');
  }

  logger.info(`[手动扫描] 日期范围 ${fromDate.toISOString()} ~ ${toDate.toISOString()}`);

  const allRepos = await configService.getEnabledRepositories();
  const reposToScan =
    repositoryIds && repositoryIds.length > 0
      ? allRepos.filter((repo) => repositoryIds.includes(repo.id))
      : allRepos;

  for (const repo of reposToScan) {
    try {
      logger.info(`[手动扫描] 仓库: ${repo.name}, 路径: ${repo.path}`);

      const authorEmails = await configService.getAuthorEmailsByRepoId(repo.id);
      if (authorEmails.length === 0) {
        logger.warn(`[手动扫描] 跳过 ${repo.name}：未配置作者`);
        continue;
      }

      await pullRepository(repo.path, repo.name);

      const scanner = new GitScanService(repo.path);
      const commits = await scanner.incrementalScan(fromDate, authorEmails, toDate);

      logger.info(`[手动扫描] ${repo.name} 范围内共 ${commits.length} 条提交`);

      if (commits.length > 0) {
        const insertResult = await commitService.batchInsertCommits(repo.id, commits);
        logger.info(
          `[手动扫描] ${repo.name} 入库 新增 ${insertResult.inserted} 条, 跳过重复 ${insertResult.skipped} 条`
        );

        const result = await commitService.getCommits({
          startDate: 0,
          endDate: Date.now(),
          repositoryIds: [repo.id],
          page: 1,
          pageSize: 1
        });

        await repositoryService.updateRepositoryScanInfo(repo.id, Date.now(), result.total);
        scannedCount++;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error({
        msg: `[手动扫描失败] ${repo.name}`,
        error: errorMessage,
        stack: errorStack,
        repositoryId: repo.id
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

// 手动触发扫描（异步）：按请求体中的日期范围 + 可选仓库列表入库（与统计页筛选一致）
app.post('/scan', zValidator('json', ScanRequestSchema), async (c) => {
  const { startDate, endDate, repositoryIds } = c.req.valid('json');
  
  // 若仍处于「扫描中」：可能是上一次卡住未收尾，超时后允许发起新扫描（无 startedAt 的旧状态一律视为可覆盖）
  if (scanStatus.finished === 1) {
    const started = scanStatus.startedAt;
    if (started != null && Date.now() - started < SCAN_STALE_MS) {
      return c.json({
        finished: scanStatus.finished,
        scannedCount: scanStatus.scannedCount,
        stale: false
      });
    }
    logger.warn(
      started == null
        ? '[手动扫描] 扫描状态异常（无开始时间），将重新启动'
        : `[手动扫描] 上次扫描仍为进行中已超过 ${SCAN_STALE_MS / 60000} 分钟，视为僵死并重新启动`
    );
  }

  // 重置状态并开始扫描
  scanStatus = {
    finished: 1, // 扫描中
    scannedCount: 0,
    error: undefined,
    startedAt: Date.now()
  };

  scanRepositoriesDateRangeAsync(startDate, endDate, repositoryIds)
    .then((scannedCount) => {
      scanStatus = {
        finished: 2, // 已完成
        scannedCount,
        startedAt: undefined
      };
      logger.info(`[手动扫描] 完成，共 ${scannedCount} 个仓库有新增入库`);
    })
    .catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      scanStatus = {
        finished: 2, // 已完成（失败）
        scannedCount: 0,
        error: errorMessage,
        startedAt: undefined
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
    error: scanStatus.error,
    startedAt: scanStatus.startedAt,
    staleThresholdMs: SCAN_STALE_MS
  });
});

export default app;

