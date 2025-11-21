import cron from 'node-cron';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import type { Config } from '../schemas/config.schema.js';
import { RepositoryService } from '../services/RepositoryService.js';
import { GitScanService } from '../services/GitScanService.js';
import { CommitService } from '../services/CommitService.js';
import { logger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 加载配置文件
 */
function loadConfig(): Config {
  const configPath = path.join(__dirname, '../../config/repositories.json');
  const configContent = readFileSync(configPath, 'utf-8');
  return JSON.parse(configContent);
}

/**
 * 执行扫描任务
 */
async function executeScan() {
  const config = loadConfig();
  const repositoryService = new RepositoryService();
  const commitService = new CommitService();

  logger.info('Starting scheduled scan...');

  try {
    for (const repo of config.repositories) {
      if (!repo.enabled) continue;

      try {
        logger.info(`[定时扫描] 仓库: ${repo.name}`);
        
        // 获取上次扫描时间
        const lastScanTime = await repositoryService.getLastScanTime(repo.id);
        const fromDate = lastScanTime 
          ? new Date(lastScanTime)
          : new Date('2000-01-01');

        logger.info(`[增量扫描] 从 ${fromDate.toISOString()} 开始扫描`);

        // 执行增量扫描
        const scanner = new GitScanService(repo.path);
        const commits = await scanner.incrementalScan(fromDate, config.author.email);

        logger.info(`[扫描完成] 发现 ${commits.length} 个提交记录`);

        if (commits.length > 0) {
          // 保存到数据库（带去重）
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

    logger.info('Scheduled scan completed');
  } catch (error) {
    logger.error('Scheduled scan failed:', error);
  }
}

/**
 * 启动定时任务调度器
 */
export function startScheduler() {
  const config = loadConfig();

  // 启动定时任务
  cron.schedule(config.scanInterval, executeScan);

  logger.info(`Scheduler started with cron: ${config.scanInterval}`);
}

