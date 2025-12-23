#!/usr/bin/env node
/**
 * Git 仓库初始化扫描脚本
 * 
 * 用法:
 *   pnpm init-scan              # 扫描最近3个月
 *   pnpm init-scan --months 6   # 扫描最近6个月
 *   pnpm init-scan --months 12  # 扫描最近12个月
 */

// 加载环境变量
import 'dotenv/config';

import simpleGit, { SimpleGit } from 'simple-git';
import { RepositoryService } from '../services/RepositoryService.js';
import { ConfigService } from '../services/ConfigService.js';
import { GitScanService } from '../services/GitScanService.js';
import { CommitService } from '../services/CommitService.js';
import { logger } from '../config/logger.js';

/**
 * 解析命令行参数
 */
function parseArgs(): { months: number } {
  const args = process.argv.slice(2);
  let months = 3; // 默认3个月

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--months' && args[i + 1]) {
      const value = parseInt(args[i + 1], 10);
      if (!isNaN(value) && value > 0 && value <= 24) {
        months = value;
      } else {
        logger.warn(`无效的月份参数: ${args[i + 1]}，使用默认值 3 个月`);
      }
      break;
    }
  }

  return { months };
}

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
    // 不抛出错误，允许继续扫描
    return false;
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
  targetStartDate: Date, // 目标起始日期
  endDate: Date,
  authorEmails: string[],
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

      // 执行扫描（使用日期范围限制，支持多作者）
      const scanner = new GitScanService(repoConfig.path);
      // 将结束日期设置为下一周的开始，确保包含本周的所有提交
      const weekEndPlusOne = new Date(week.end);
      weekEndPlusOne.setDate(weekEndPlusOne.getDate() + 1);
      const commits = await scanner.incrementalScan(week.start, authorEmails, weekEndPlusOne);

      if (commits.length > 0) {
        // 统计分支信息
        const branches = new Set(commits.map(c => c.branch).filter((b): b is string => !!b));
        const branchInfo = branches.size > 0 
          ? `，涉及 ${branches.size} 个分支: ${Array.from(branches).slice(0, 5).join(', ')}${branches.size > 5 ? '...' : ''}`
          : '';
        
        // 保存提交记录（带去重，支持多分支）
        const insertResult = await commitService.batchInsertCommits(repoConfig.id, commits);
        
        logger.info(`    ✓ 发现: ${commits.length} 条${branchInfo}, 新增: ${insertResult.inserted} 条, 跳过: ${insertResult.skipped} 条`);

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

  // 检查是否已完成（扫描到当前时间）
  const completed = lastScannedDate.getTime() >= endDate.getTime();

  return {
    scanned: totalScanned,
    inserted: totalInserted,
    skipped: totalSkipped,
    completed
  };
}

/**
 * 初始化扫描
 */
async function initScan() {
  const { months } = parseArgs();
  const configService = new ConfigService();
  const repositoryService = new RepositoryService();
  const commitService = new CommitService();
  
  logger.info('='.repeat(60));
  logger.info(`[初始化扫描] 开始扫描最近 ${months} 个月的提交记录（支持断点续传）...`);
  logger.info('='.repeat(60));

  const targetDate = new Date();
  targetDate.setMonth(targetDate.getMonth() - months);
  const now = new Date();
  const targetDateTimestamp = targetDate.getTime();

  let totalScanned = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let successCount = 0;
  let failCount = 0;
  let completedCount = 0;

  // 获取所有启用的仓库配置
  const repos = await configService.getEnabledRepositories();
  logger.info(`[初始化] 找到 ${repos.length} 个启用的仓库\n`);

  for (const repo of repos) {

    // 检查该仓库是否已完成初始扫描
    const isCompleted = await repositoryService.isInitialScanCompleted(repo.id, targetDateTimestamp);
    if (isCompleted) {
      logger.info(`[跳过] ${repo.name} (已完成初始扫描到目标日期)`);
      completedCount++;
      continue;
    }

    try {
      logger.info(`\n[扫描仓库] ${repo.name}`);
      logger.info(`  路径: ${repo.path}`);
      
      // 先更新仓库代码到最新
      await pullRepository(repo.path, repo.name);
      
      // 获取当前扫描进度
      const currentScanToDate = await repositoryService.getInitialScanToDate(repo.id);
      if (currentScanToDate) {
        logger.info(`  继续扫描: 从 ${new Date(currentScanToDate).toISOString().split('T')[0]} 继续`);
      } else {
        logger.info(`  首次扫描: 从 ${targetDate.toISOString().split('T')[0]} 开始`);
      }
      logger.info(`  目标日期: ${targetDate.toISOString().split('T')[0]}`);

      // 获取该仓库的作者邮箱列表
      const authorEmails = await configService.getAuthorEmailsByRepoId(repo.id);
      if (authorEmails.length === 0) {
        logger.warn(`  [跳过] 仓库 ${repo.name} 没有配置作者，跳过`);
        continue;
      }

      // 分阶段扫描（支持断点续传）
      const result = await scanRepositoryInPhases(
        repo,
        targetDate,
        now,
        authorEmails,
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
        repositoryIds: [repo.id],
        page: 1,
        pageSize: 1
      });

      await repositoryService.updateRepositoryScanInfo(
        repo.id,
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
      logger.error(`[扫描失败] ${repo.name}: ${errorMessage}`);
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

  process.exit(0);
}

// 运行初始化扫描
initScan().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  logger.error({
    msg: 'Initial scan failed',
    error: errorMessage,
    stack: errorStack
  });
  process.exit(1);
});

