import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import repositoriesRoute from './routes/repositories.js';
import commitsRoute from './routes/commits.js';
import statisticsRoute from './routes/statistics.js';
import { startScheduler } from './jobs/scanScheduler.js';
import { logger } from './config/logger.js';
import { RepositoryService } from './services/RepositoryService.js';
import { GitScanService } from './services/GitScanService.js';
import { CommitService } from './services/CommitService.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import type { Config } from './schemas/config.schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = new Hono();

// 中间件
app.use('*', honoLogger());
app.use('*', cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

// 路由注册
app.route('/api/v1/repositories', repositoriesRoute);
app.route('/api/v1/commits', commitsRoute);
app.route('/api/v1/statistics', statisticsRoute);

// 健康检查
app.get('/health', (c) => c.json({ status: 'ok' }));

// 加载配置
function loadConfig(): Config {
  const configPath = path.join(__dirname, '../config/repositories.json');
  const configContent = readFileSync(configPath, 'utf-8');
  return JSON.parse(configContent);
}

// 初始化仓库配置
async function initRepositories() {
  try {
    const config = loadConfig();
    const repositoryService = new RepositoryService();
    
    // 将配置中的仓库信息同步到数据库
    for (const repo of config.repositories) {
      await repositoryService.upsertRepository({
        id: repo.id,
        name: repo.name,
        path: repo.path
      });
    }
    
    logger.info(`[初始化] 已同步 ${config.repositories.length} 个仓库配置到数据库`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error({
      msg: 'Failed to initialize repositories',
      error: errorMessage,
      stack: errorStack
    });
    throw error;
  }
}

/**
 * 将时间范围分割成多个周
 */
function splitIntoWeeks(startDate: Date, endDate: Date): Array<{ start: Date; end: Date }> {
  const weeks: Array<{ start: Date; end: Date }> = [];
  let currentStart = new Date(startDate);
  
  while (currentStart < endDate) {
    const currentEnd = new Date(currentStart);
    currentEnd.setDate(currentEnd.getDate() + 7); // 一周
    
    // 确保不超过结束日期
    const weekEnd = currentEnd > endDate ? endDate : currentEnd;
    
    weeks.push({
      start: new Date(currentStart),
      end: weekEnd
    });
    
    currentStart = new Date(weekEnd);
    // 避免无限循环，如果日期相同则前进一天
    if (currentStart.getTime() === weekEnd.getTime()) {
      currentStart.setDate(currentStart.getDate() + 1);
    }
  }
  
  return weeks;
}

/**
 * 分阶段扫描单个仓库（支持断点续传）
 */
async function scanRepositoryInPhases(
  repoConfig: { id: string; name: string; path: string },
  targetStartDate: Date, // 目标起始日期（3个月前）
  endDate: Date,
  authorEmail: string,
  repositoryService: RepositoryService,
  commitService: CommitService
): Promise<{ scanned: number; inserted: number; skipped: number; completed: boolean }> {
  // 获取当前扫描进度
  const currentScanToDate = await repositoryService.getInitialScanToDate(repoConfig.id);
  
  // 确定实际开始日期：如果有进度，从未完成的日期继续；否则从目标日期开始
  const actualStartDate = currentScanToDate 
    ? new Date(currentScanToDate) 
    : targetStartDate;
  
  if (actualStartDate >= endDate) {
    logger.info(`  [已完成] 已扫描到 ${new Date(currentScanToDate!).toISOString().split('T')[0]}，无需继续扫描`);
    return { scanned: 0, inserted: 0, skipped: 0, completed: true };
  }

  // 只扫描未完成的部分
  const weeks = splitIntoWeeks(actualStartDate, endDate);
  let totalScanned = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let lastScannedDate = actualStartDate;

  logger.info(`  [分阶段扫描] 从 ${actualStartDate.toISOString().split('T')[0]} 继续，共 ${weeks.length} 个阶段`);

  for (let i = 0; i < weeks.length; i++) {
    const week = weeks[i];
    const weekNumber = i + 1;
    
    try {
      logger.info(`  [阶段 ${weekNumber}/${weeks.length}] ${week.start.toISOString().split('T')[0]} ~ ${week.end.toISOString().split('T')[0]}`);

      // 执行扫描（使用日期范围限制）
      const scanner = new GitScanService(repoConfig.path);
      // 将结束日期设置为下一周的开始，确保包含本周的所有提交
      const weekEndPlusOne = new Date(week.end);
      weekEndPlusOne.setDate(weekEndPlusOne.getDate() + 1);
      const commits = await scanner.incrementalScan(week.start, authorEmail, weekEndPlusOne);

      if (commits.length > 0) {
        // 保存提交记录（带去重）
        const insertResult = await commitService.batchInsertCommits(repoConfig.id, commits);
        
        logger.info(`    ✓ 发现: ${commits.length} 条, 新增: ${insertResult.inserted} 条, 跳过: ${insertResult.skipped} 条`);

        totalScanned += commits.length;
        totalInserted += insertResult.inserted;
        totalSkipped += insertResult.skipped;
      } else {
        logger.info(`    - 无提交记录`);
      }

      // 更新扫描进度（记录到本周结束日期）
      lastScannedDate = week.end;
      await repositoryService.updateInitialScanToDate(repoConfig.id, week.end.getTime());
      logger.info(`    [进度更新] 已扫描到 ${week.end.toISOString().split('T')[0]}`);

      // 每个阶段之间稍作延迟，避免过载
      if (i < weeks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`  [阶段 ${weekNumber} 失败] ${errorMessage}`);
      // 即使失败，也更新进度到当前阶段的开始日期，下次从这个阶段重新开始
      await repositoryService.updateInitialScanToDate(repoConfig.id, week.start.getTime());
      logger.info(`    [进度保存] 失败后保存进度到 ${week.start.toISOString().split('T')[0]}，下次从此继续`);
      // 继续下一个阶段，不中断整个扫描
    }
  }

  // 检查是否已完成（扫描到目标日期）
  const completed = lastScannedDate <= targetStartDate;

  return {
    scanned: totalScanned,
    inserted: totalInserted,
    skipped: totalSkipped,
    completed
  };
}

// 启动时扫描最近3个月的数据（支持断点续传）
async function initialScan() {
  const config = loadConfig();
  const repositoryService = new RepositoryService();
  const commitService = new CommitService();
  
  logger.info('='.repeat(60));
  logger.info('[启动扫描] 开始扫描最近3个月的提交记录（支持断点续传）...');
  logger.info('='.repeat(60));

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const now = new Date();
  const targetDateTimestamp = threeMonthsAgo.getTime();

  let totalScanned = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let successCount = 0;
  let failCount = 0;
  let completedCount = 0;

  for (const repoConfig of config.repositories) {
    if (!repoConfig.enabled) {
      logger.info(`[跳过] ${repoConfig.name} (已禁用)`);
      continue;
    }

    // 检查该仓库是否已完成初始扫描
    const isCompleted = await repositoryService.isInitialScanCompleted(repoConfig.id, targetDateTimestamp);
    if (isCompleted) {
      logger.info(`[跳过] ${repoConfig.name} (已完成初始扫描到目标日期)`);
      completedCount++;
      continue;
    }

    try {
      logger.info(`\n[扫描仓库] ${repoConfig.name}`);
      logger.info(`  路径: ${repoConfig.path}`);
      
      // 获取当前扫描进度
      const currentScanToDate = await repositoryService.getInitialScanToDate(repoConfig.id);
      if (currentScanToDate) {
        logger.info(`  继续扫描: 从 ${new Date(currentScanToDate).toISOString().split('T')[0]} 继续`);
      } else {
        logger.info(`  首次扫描: 从 ${threeMonthsAgo.toISOString().split('T')[0]} 开始`);
      }
      logger.info(`  目标日期: ${threeMonthsAgo.toISOString().split('T')[0]}`);

      // 分阶段扫描（支持断点续传）
      const result = await scanRepositoryInPhases(
        repoConfig,
        threeMonthsAgo,
        now,
        config.author.email,
        repositoryService,
        commitService
      );

      totalScanned += result.scanned;
      totalInserted += result.inserted;
      totalSkipped += result.skipped;

      // 更新仓库信息
      const dbResult = await commitService.getCommits({
        startDate: 0,
        endDate: Date.now(),
        repositoryIds: [repoConfig.id],
        page: 1,
        pageSize: 1
      });

      await repositoryService.updateRepositoryScanInfo(
        repoConfig.id,
        Date.now(),
        dbResult.total
      );

      if (result.completed) {
        logger.info(`  [完成] 已扫描到目标日期，仓库总计: ${dbResult.total} 条提交记录`);
        completedCount++;
      } else {
        logger.info(`  [部分完成] 已保存进度，仓库总计: ${dbResult.total} 条提交记录，下次继续扫描`);
      }
      
      successCount++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[扫描失败] ${repoConfig.name}: ${errorMessage}`);
      failCount++;
      // 继续扫描下一个仓库，不中断整个流程
    }
  }

  logger.info('\n' + '='.repeat(60));
  logger.info('[扫描完成] 统计信息:');
  logger.info(`  已完成仓库: ${completedCount} 个`);
  logger.info(`  进行中仓库: ${successCount - completedCount} 个`);
  logger.info(`  失败仓库: ${failCount} 个`);
  logger.info(`  扫描提交总数: ${totalScanned} 条`);
  logger.info(`  新增入库: ${totalInserted} 条`);
  logger.info(`  跳过重复: ${totalSkipped} 条`);
  logger.info('='.repeat(60) + '\n');
}

// 启动服务器
const port = 3000;

async function startServer() {
  try {
    logger.info('[应用启动] 正在初始化...');

    // 初始化仓库配置
    await initRepositories();

    // 启动时扫描最近3个月数据
    await initialScan();

    // 启动定时任务
    startScheduler();

    logger.info(`[服务就绪] 服务器运行在端口 ${port}`);

    serve({
      fetch: app.fetch,
      port
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error({
      msg: 'Failed to start server',
      error: errorMessage,
      stack: errorStack
    });
    throw error;
  }
}

startServer().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  logger.error({
    msg: 'Failed to start server',
    error: errorMessage,
    stack: errorStack
  });
  process.exit(1);
});

export default app;

