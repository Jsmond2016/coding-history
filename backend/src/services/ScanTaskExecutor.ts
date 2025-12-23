import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import simpleGit, { SimpleGit } from 'simple-git';
import type { Config } from '../schemas/config.schema.js';
import type { ScanTask, ScanRangeType } from './ScanTaskService.js';
import { RepositoryService } from './RepositoryService.js';
import { GitScanService } from './GitScanService.js';
import { CommitService } from './CommitService.js';
import { LogService } from './LogService.js';
import { logger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ScanTaskExecutionResult {
  success: boolean;
  scannedRepositories: string[];
  totalCommits: number;
  errorMessage?: string;
}

export interface ExecuteScanTaskOptions {
  taskId?: number; // 任务ID，用于日志关联
}

/**
 * 加载配置文件
 */
function loadConfig(): Config {
  const configPath = path.join(__dirname, '../../config/repositories.json');
  const configContent = readFileSync(configPath, 'utf-8');
  return JSON.parse(configContent);
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
    return false;
  }
}

/**
 * 验证自定义时间范围（最大6个月跨度）
 * 
 * @param startDate 开始时间
 * @param endDate 结束时间
 * @returns {boolean} 是否有效
 * @throws {Error} 当时间范围无效时抛出异常
 */
export function validateDateRange(startDate: Date, endDate: Date): boolean {
  if (startDate >= endDate) {
    throw new Error('开始时间必须早于结束时间');
  }

  // 计算时间跨度（毫秒）
  const spanMs = endDate.getTime() - startDate.getTime();
  // 6个月 = 180天 = 180 * 24 * 60 * 60 * 1000 毫秒
  const maxSpanMs = 180 * 24 * 60 * 60 * 1000;

  if (spanMs > maxSpanMs) {
    throw new Error(`时间跨度不能超过6个月（当前跨度：${Math.ceil(spanMs / (24 * 60 * 60 * 1000))}天）`);
  }

  return true;
}

/**
 * 根据扫描范围类型计算扫描时间范围
 * 
 * @param scanRangeType 扫描范围类型
 * @param startDate 自定义开始时间（仅 custom 类型需要）
 * @param endDate 自定义结束时间（仅 custom 类型需要）
 * @returns {{fromDate: Date; toDate: Date}} 扫描时间范围
 */
export function calculateScanDateRange(
  scanRangeType: ScanRangeType,
  startDate?: number,
  endDate?: number
): { fromDate: Date; toDate: Date } {
  const now = new Date();
  now.setHours(23, 59, 59, 999); // 设置为当天的结束时间

  let fromDate: Date;

  switch (scanRangeType) {
    case '2weeks':
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 14);
      fromDate.setHours(0, 0, 0, 0);
      break;

    case '1month':
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30);
      fromDate.setHours(0, 0, 0, 0);
      break;

    case '3months':
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 90);
      fromDate.setHours(0, 0, 0, 0);
      break;

    case '6months':
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 180);
      fromDate.setHours(0, 0, 0, 0);
      break;

    case 'custom':
      if (!startDate || !endDate) {
        throw new Error('自定义时间范围必须提供开始时间和结束时间');
      }
      fromDate = new Date(startDate);
      const toDate = new Date(endDate);
      
      // 验证时间范围
      validateDateRange(fromDate, toDate);
      
      fromDate.setHours(0, 0, 0, 0);
      toDate.setHours(23, 59, 59, 999);
      
      return { fromDate, toDate };

    default:
      throw new Error(`不支持的扫描范围类型: ${scanRangeType}`);
  }

  return { fromDate, toDate: now };
}

/**
 * 执行扫描任务
 * 
 * @param task 扫描任务对象
 * @param options 执行选项
 * @returns {Promise<ScanTaskExecutionResult>} 执行结果
 */
export async function executeScanTask(task: ScanTask, options?: ExecuteScanTaskOptions): Promise<ScanTaskExecutionResult> {
  const config = loadConfig();
  const repositoryService = new RepositoryService();
  const commitService = new CommitService();
  const logService = new LogService();

  // 收集所有作者邮箱
  const authorEmails = config.authors.map(author => author.email);

  // 计算扫描时间范围
  let fromDate: Date;
  let toDate: Date;
  
  try {
    const dateRange = calculateScanDateRange(
      task.scanRangeType,
      task.startDate,
      task.endDate
    );
    fromDate = dateRange.fromDate;
    toDate = dateRange.toDate;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[任务执行] 计算时间范围失败: ${errorMsg}`);
    return {
      success: false,
      scannedRepositories: [],
      totalCommits: 0,
      errorMessage: errorMsg
    };
  }

  logger.info(`[任务执行] 开始执行任务: ${task.name}`);
  logger.info(`[任务执行] 扫描时间范围: ${fromDate.toISOString()} 至 ${toDate.toISOString()}`);

  const result: ScanTaskExecutionResult = {
    success: true,
    scannedRepositories: [],
    totalCommits: 0,
    errorMessage: undefined
  };

  // 确定要扫描的仓库列表
  const repositoriesToScan = task.repositoryIds && task.repositoryIds.length > 0
    ? config.repositories.filter(repo => task.repositoryIds!.includes(repo.id) && repo.enabled)
    : config.repositories.filter(repo => repo.enabled);

  if (repositoriesToScan.length === 0) {
    logger.warn('[任务执行] 没有可扫描的仓库');
    return {
      success: false,
      scannedRepositories: [],
      totalCommits: 0,
      errorMessage: '没有可扫描的仓库'
    };
  }

  // 遍历仓库执行扫描
  for (const repoConfig of repositoriesToScan) {
    try {
      logger.info(`[任务执行] 扫描仓库: ${repoConfig.name}`);

      // 先更新仓库代码到最新
      await pullRepository(repoConfig.path, repoConfig.name);

      // 执行扫描
      const scanner = new GitScanService(repoConfig.path);
      const commits = await scanner.incrementalScan(fromDate, authorEmails, toDate);

      logger.info(`[任务执行] 发现 ${commits.length} 个提交记录`);

      if (commits.length > 0) {
        // 保存到数据库（带去重）
        const insertResult = await commitService.batchInsertCommits(repoConfig.id, commits);
        logger.info(`[任务执行] 新增: ${insertResult.inserted} 条, 跳过重复: ${insertResult.skipped} 条`);

        result.totalCommits += insertResult.inserted;

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

        logger.info(`[任务执行] ${repoConfig.name} 总计 ${dbResult.total} 条提交记录`);
      } else {
        logger.info(`[任务执行] ${repoConfig.name} 没有新的提交记录`);
      }

      result.scannedRepositories.push(repoConfig.name);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({
        msg: `[任务执行] 扫描仓库 ${repoConfig.name} 失败`,
        error: errorMsg,
        repositoryId: repoConfig.id,
        repositoryPath: repoConfig.path
      });

      result.success = false;
      if (!result.errorMessage) {
        result.errorMessage = `扫描仓库 ${repoConfig.name} 失败: ${errorMsg}`;
      } else {
        result.errorMessage += `; ${repoConfig.name}: ${errorMsg}`;
      }
    }
  }

  // 记录任务执行日志
  const executeTime = Date.now();
  try {
    await logService.createScheduledTaskLog({
      taskName: task.name,
      cronExpression: task.cronExpression,
      startTime: executeTime,
      endTime: executeTime,
      status: result.success ? 'success' : 'failed',
      repositories: result.scannedRepositories,
      totalCommits: result.totalCommits,
      errorMessage: result.errorMessage,
      taskId: options?.taskId
    });
  } catch (logError) {
    logger.error('记录任务执行日志失败:', logError);
  }

  logger.info(`[任务执行] 任务执行完成: ${task.name}, 成功: ${result.success}, 提交数: ${result.totalCommits}`);

  return result;
}

