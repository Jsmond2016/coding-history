import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import type { Config, ScanSchedule } from '../schemas/config.schema.js';
import { RepositoryService } from '../services/RepositoryService.js';
import { GitScanService } from '../services/GitScanService.js';
import { CommitService } from '../services/CommitService.js';
import { LogService } from '../services/LogService.js';
import { logger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 保存当前运行的定时任务实例（支持多个任务）
let currentSchedulers: ScheduledTask[] = [];

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
 * 自动同步最近一周的代码记录
 */
async function executeScan() {
  const config = loadConfig();
  const repositoryService = new RepositoryService();
  const commitService = new CommitService();
  const logService = new LogService();

  // 收集所有作者邮箱
  const authorEmails = config.authors.map(author => author.email);

  // 获取当前定时任务的 cron 表达式和描述
  const scheduleTimes: ScanSchedule[] = typeof config.scanInterval === 'string'
    ? [{ cron: config.scanInterval }]
    : config.scanInterval;
  const currentSchedule = scheduleTimes[0]; // 使用第一个定时任务配置
  const taskName = currentSchedule?.description || '定时扫描任务';
  const cronExpression = currentSchedule?.cron;

  const startTime = Date.now();
  const scannedRepositories: string[] = [];
  let totalCommits = 0;
  let hasError = false;
  let errorMessage: string | undefined;

  logger.info('Starting scheduled scan...');

  // 计算最近一周的起始时间（当前时间 - 7天）
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  oneWeekAgo.setHours(0, 0, 0, 0); // 设置为当天的00:00:00

  try {
    for (const repo of config.repositories) {
      if (!repo.enabled) continue;

      try {
        logger.info(`[定时扫描] 仓库: ${repo.name}`);
        scannedRepositories.push(repo.name);

        // 获取上次扫描时间
        const lastScanTime = await repositoryService.getLastScanTime(repo.id);
        
        // 确定扫描起始时间：
        // 1. 如果没有上次扫描时间，从2000-01-01开始（首次扫描）
        // 2. 如果上次扫描时间早于一周前，从一周前开始（确保同步最近一周）
        // 3. 如果上次扫描时间在一周内，从上次扫描时间开始（增量扫描）
        let fromDate: Date;
        if (!lastScanTime) {
          fromDate = new Date('2000-01-01');
          logger.info(`[首次扫描] 从 ${fromDate.toISOString()} 开始扫描`);
        } else {
          const lastScanDate = new Date(lastScanTime);
          // 如果上次扫描时间早于一周前，从一周前开始扫描
          if (lastScanDate < oneWeekAgo) {
            fromDate = oneWeekAgo;
            logger.info(`[一周同步] 上次扫描时间 ${lastScanDate.toISOString()} 早于一周前，从 ${fromDate.toISOString()} 开始扫描（确保同步最近一周）`);
          } else {
            fromDate = lastScanDate;
            logger.info(`[增量扫描] 从 ${fromDate.toISOString()} 开始扫描`);
          }
        }

        // 执行增量扫描（使用所有配置的作者邮箱）
        const scanner = new GitScanService(repo.path);
        const commits = await scanner.incrementalScan(fromDate, authorEmails);

        logger.info(`[扫描完成] 发现 ${commits.length} 个提交记录`);

        if (commits.length > 0) {
          // 保存到数据库（带去重）
          const insertResult = await commitService.batchInsertCommits(repo.id, commits);

          logger.info(`[数据入库] 新增: ${insertResult.inserted} 条, 跳过重复: ${insertResult.skipped} 条`);
          totalCommits += insertResult.inserted;

          // 更新仓库信息
          const result = await commitService.getCommits({
            startDate: 0,
            endDate: Date.now(),
            repositoryIds: [repo.id],
            page: 1,
            pageSize: 1
          });
          const repoTotalCommits = result.total;

          await repositoryService.updateRepositoryScanInfo(
            repo.id,
            Date.now(),
            repoTotalCommits
          );

          logger.info(`[仓库更新] ${repo.name} 总计 ${repoTotalCommits} 条提交记录`);
        } else {
          logger.info(`[无新数据] ${repo.name} 没有新的提交记录`);
        }
      } catch (error) {
        hasError = true;
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        
        if (!errorMessage) {
          errorMessage = `扫描仓库 ${repo.name} 失败: ${errorMsg}`;
        } else {
          errorMessage += `; ${repo.name}: ${errorMsg}`;
        }
        
        logger.error({
          msg: `Failed to scan repository ${repo.name}`,
          error: errorMsg,
          stack: errorStack,
          repositoryId: repo.id,
          repositoryPath: repo.path
        });
      }
    }

    logger.info('Scheduled scan completed');
  } catch (error) {
    hasError = true;
    const errorMsg = error instanceof Error ? error.message : String(error);
    errorMessage = `定时任务执行失败: ${errorMsg}`;
    logger.error('Scheduled scan failed:', error);
  } finally {
    // 记录定时任务日志
    const endTime = Date.now();
    try {
      await logService.createScheduledTaskLog({
        taskName,
        cronExpression,
        startTime,
        endTime,
        status: hasError ? 'failed' : 'success',
        repositories: scannedRepositories,
        totalCommits,
        errorMessage
      });
    } catch (logError) {
      logger.error('记录定时任务日志失败:', logError);
    }
  }
}

/**
 * 启动定时任务调度器
 * 从配置文件读取定时任务时间配置
 */
export function startScheduler() {
  // 如果已有定时任务在运行，先停止
  if (currentSchedulers.length > 0) {
    stopScheduler();
  }

  const config = loadConfig();
  
  // 统一转换为数组格式
  let scheduleTimes: ScanSchedule[];
  
  if (typeof config.scanInterval === 'string') {
    // 向后兼容：单个字符串格式，转换为数组
    scheduleTimes = [{ cron: config.scanInterval }];
  } else {
    // 新的数组格式
    scheduleTimes = config.scanInterval;
  }

  if (scheduleTimes.length === 0) {
    logger.warn('[定时任务] 未配置任何定时任务时间，调度器未启动');
    return;
  }

  // 创建多个定时任务
  currentSchedulers = scheduleTimes.map((schedule, index) => {
    const cronExpr = schedule.cron;
    const description = schedule.description || `定时任务 ${index + 1}`;
    
    const task = cron.schedule(cronExpr, executeScan);
    logger.info(`[定时任务] ${description} 调度已启动，Cron 表达式: ${cronExpr}`);
    return task;
  });

  logger.info(`[定时任务] 调度器已启动，共 ${currentSchedulers.length} 个定时任务`);
}

/**
 * 停止定时任务调度器
 */
export function stopScheduler() {
  if (currentSchedulers.length > 0) {
    currentSchedulers.forEach((scheduler, index) => {
      scheduler.stop();
      logger.info(`[定时任务] 调度器 ${index + 1} 已停止`);
    });
    currentSchedulers = [];
    logger.info('[定时任务] 所有调度器已停止');
  }
}

/**
 * 重启定时任务调度器（用于配置热重载）
 */
export async function restartScheduler() {
  logger.info('[定时任务] 正在重启调度器...');

  // 停止当前定时任务
  stopScheduler();

  // 启动新的定时任务（会读取最新配置）
  startScheduler();

  logger.info('[定时任务] 调度器已使用新配置重启');
}

