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
import { ScanTaskService } from '../services/ScanTaskService.js';
import { executeScanTask } from '../services/ScanTaskExecutor.js';
import { logger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 保存当前运行的定时任务实例（支持多个任务）
 * 用于管理和控制定时任务的启动、停止和重启
 */
let currentSchedulers: ScheduledTask[] = [];

/**
 * 扫描任务执行结果
 */
interface ScanTaskResult {
  scannedRepositories: string[];
  totalCommits: number;
  hasError: boolean;
  errorMessage?: string;
}

/**
 * 任务元数据
 */
interface TaskMetadata {
  taskName: string;
  cronExpression?: string;
}

/**
 * 加载配置文件
 * 
 * @returns {Config} 解析后的配置对象
 * @throws {Error} 当配置文件不存在或格式错误时抛出异常
 */
function loadConfig(): Config {
  const configPath = path.join(__dirname, '../../config/repositories.json');
  const configContent = readFileSync(configPath, 'utf-8');
  return JSON.parse(configContent);
}

/**
 * 规范化调度配置
 * 将字符串格式的配置转换为数组格式，保持向后兼容
 * 
 * @param {string | ScanSchedule[]} scanInterval - 调度配置（字符串或数组）
 * @returns {ScanSchedule[]} 规范化后的调度配置数组
 */
function normalizeScheduleConfig(scanInterval: string | ScanSchedule[]): ScanSchedule[] {
  if (typeof scanInterval === 'string') {
    // 向后兼容：单个字符串格式，转换为数组
    return [{ cron: scanInterval }];
  }
  return scanInterval;
}

/**
 * 获取任务元数据
 * 从配置中提取任务名称和 Cron 表达式
 * 
 * @param {ScanSchedule[]} scheduleTimes - 调度时间配置数组
 * @returns {TaskMetadata} 任务元数据对象
 */
function getTaskMetadata(scheduleTimes: ScanSchedule[]): TaskMetadata {
  const currentSchedule = scheduleTimes[0]; // 使用第一个定时任务配置
  return {
    taskName: currentSchedule?.description || '定时扫描任务',
    cronExpression: currentSchedule?.cron
  };
}

/**
 * 计算扫描起始时间
 * 根据上次扫描时间和一周前的时间，确定本次扫描的起始时间
 * 
 * 策略说明：
 * 1. 如果没有上次扫描时间，从2000-01-01开始（首次扫描）
 * 2. 如果上次扫描时间早于一周前，从一周前开始（确保同步最近一周）
 * 3. 如果上次扫描时间在一周内，从上次扫描时间开始（增量扫描）
 * 
 * @param {number | null} lastScanTime - 上次扫描时间（时间戳，毫秒）
 * @param {Date} oneWeekAgo - 一周前的日期对象
 * @returns {Date} 计算得到的扫描起始时间
 */
function calculateScanStartDate(lastScanTime: number | null, oneWeekAgo: Date): Date {
  if (!lastScanTime) {
    // 首次扫描：从2000-01-01开始
    const firstScanDate = new Date('2000-01-01');
    logger.info(`[首次扫描] 从 ${firstScanDate.toISOString()} 开始扫描`);
    return firstScanDate;
  }

  const lastScanDate = new Date(lastScanTime);
  
  if (lastScanDate < oneWeekAgo) {
    // 上次扫描时间早于一周前，从一周前开始扫描（确保同步最近一周）
    logger.info(`[一周同步] 上次扫描时间 ${lastScanDate.toISOString()} 早于一周前，从 ${oneWeekAgo.toISOString()} 开始扫描（确保同步最近一周）`);
    return oneWeekAgo;
  } else {
    // 增量扫描：从上次扫描时间开始
    logger.info(`[增量扫描] 从 ${lastScanDate.toISOString()} 开始扫描`);
    return lastScanDate;
  }
}

/**
 * 扫描单个仓库
 * 执行 Git 仓库的增量扫描，并将结果保存到数据库
 * 
 * @param {Object} params - 扫描参数
 * @param {Object} params.repo - 仓库配置对象
 * @param {string[]} params.authorEmails - 作者邮箱数组
 * @param {Date} params.oneWeekAgo - 一周前的日期对象
 * @param {RepositoryService} params.repositoryService - 仓库服务实例
 * @param {CommitService} params.commitService - 提交服务实例
 * @returns {Promise<{success: boolean; commitsCount: number; error?: string}>} 扫描结果
 */
async function scanSingleRepository(params: {
  repo: Config['repositories'][0];
  authorEmails: string[];
  oneWeekAgo: Date;
  repositoryService: RepositoryService;
  commitService: CommitService;
}): Promise<{ success: boolean; commitsCount: number; error?: string }> {
  const { repo, authorEmails, oneWeekAgo, repositoryService, commitService } = params;

  try {
    logger.info(`[定时扫描] 仓库: ${repo.name}`);

    // 获取上次扫描时间
    const lastScanTime = await repositoryService.getLastScanTime(repo.id);
    
    // 计算扫描起始时间
    const fromDate = calculateScanStartDate(lastScanTime, oneWeekAgo);

    // 执行增量扫描（使用所有配置的作者邮箱）
    const scanner = new GitScanService(repo.path);
    const commits = await scanner.incrementalScan(fromDate, authorEmails);

    logger.info(`[扫描完成] 发现 ${commits.length} 个提交记录`);

    if (commits.length === 0) {
      logger.info(`[无新数据] ${repo.name} 没有新的提交记录`);
      return { success: true, commitsCount: 0 };
    }

    // 保存到数据库（带去重）
    const insertResult = await commitService.batchInsertCommits(repo.id, commits);
    logger.info(`[数据入库] 新增: ${insertResult.inserted} 条, 跳过重复: ${insertResult.skipped} 条`);

    // 更新仓库信息（获取总提交数）
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

    return { success: true, commitsCount: insertResult.inserted };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error({
      msg: `Failed to scan repository ${repo.name}`,
      error: errorMsg,
      stack: errorStack,
      repositoryId: repo.id,
      repositoryPath: repo.path
    });

    return {
      success: false,
      commitsCount: 0,
      error: `扫描仓库 ${repo.name} 失败: ${errorMsg}`
    };
  }
}

/**
 * 记录定时任务日志
 * 将任务执行结果记录到数据库
 * 
 * @param {Object} params - 日志参数
 * @param {TaskMetadata} params.metadata - 任务元数据
 * @param {number} params.startTime - 任务开始时间（时间戳，毫秒）
 * @param {number} params.endTime - 任务结束时间（时间戳，毫秒）
 * @param {ScanTaskResult} params.result - 扫描任务结果
 * @param {LogService} params.logService - 日志服务实例
 */
async function recordTaskLog(params: {
  metadata: TaskMetadata;
  startTime: number;
  endTime: number;
  result: ScanTaskResult;
  logService: LogService;
}): Promise<void> {
  const { metadata, startTime, endTime, result, logService } = params;

  try {
    await logService.createScheduledTaskLog({
      taskName: metadata.taskName,
      cronExpression: metadata.cronExpression,
      startTime,
      endTime,
      status: result.hasError ? 'failed' : 'success',
      repositories: result.scannedRepositories,
      totalCommits: result.totalCommits,
      errorMessage: result.errorMessage
    });
  } catch (logError) {
    // 日志记录失败不应该影响主流程，只记录错误
    logger.error('记录定时任务日志失败:', logError);
  }
}

/**
 * 执行扫描任务
 * 
 * 主要功能：
 * 1. 加载配置并初始化服务
 * 2. 遍历所有启用的仓库，执行增量扫描
 * 3. 将扫描结果保存到数据库
 * 4. 记录任务执行日志
 * 
 * 扫描策略：
 * - 自动同步最近一周的代码记录
 * - 支持首次扫描和增量扫描
 * - 单个仓库失败不影响其他仓库的扫描
 * 
 * @returns {Promise<void>}
 */
async function executeScan(): Promise<void> {
  // 初始化服务和配置
  const config = loadConfig();
  const repositoryService = new RepositoryService();
  const commitService = new CommitService();
  const logService = new LogService();

  // 收集所有作者邮箱（用于过滤提交记录）
  const authorEmails = config.authors.map(author => author.email);

  // 获取任务元数据（任务名称和 Cron 表达式）
  const scheduleTimes = normalizeScheduleConfig(config.scanInterval);
  const metadata = getTaskMetadata(scheduleTimes);

  // 初始化任务执行结果
  const startTime = Date.now();
  const result: ScanTaskResult = {
    scannedRepositories: [],
    totalCommits: 0,
    hasError: false,
    errorMessage: undefined
  };

  logger.info('Starting scheduled scan...');

  // 计算最近一周的起始时间（当前时间 - 7天，设置为当天的00:00:00）
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  oneWeekAgo.setHours(0, 0, 0, 0);

  try {
    // 遍历所有启用的仓库，执行扫描
    for (const repo of config.repositories) {
      // 跳过未启用的仓库
      if (!repo.enabled) {
        logger.debug(`[跳过] 仓库 ${repo.name} 未启用`);
        continue;
      }

      // 记录正在扫描的仓库
      result.scannedRepositories.push(repo.name);

      // 扫描单个仓库
      const scanResult = await scanSingleRepository({
        repo,
        authorEmails,
        oneWeekAgo,
        repositoryService,
        commitService
      });

      // 累计提交数量
      result.totalCommits += scanResult.commitsCount;

      // 处理扫描失败的情况
      if (!scanResult.success && scanResult.error) {
        result.hasError = true;
        if (!result.errorMessage) {
          result.errorMessage = scanResult.error;
        } else {
          result.errorMessage += `; ${scanResult.error}`;
        }
      }
    }

    logger.info('Scheduled scan completed');
  } catch (error) {
    // 处理任务执行过程中的未捕获异常
    result.hasError = true;
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.errorMessage = `定时任务执行失败: ${errorMsg}`;
    logger.error('Scheduled scan failed:', error);
  } finally {
    // 无论成功或失败，都记录任务日志
    const endTime = Date.now();
    await recordTaskLog({
      metadata,
      startTime,
      endTime,
      result,
      logService
    });
  }
}

/**
 * 执行数据库中的定时任务
 * 根据任务ID执行对应的扫描任务
 */
async function executeDatabaseTask(taskId: number): Promise<void> {
  try {
    const taskService = new ScanTaskService();
    const task = await taskService.getTaskById(taskId);

    if (!task) {
      logger.error(`[定时任务] 任务 ID ${taskId} 不存在`);
      return;
    }

    if (!task.enabled) {
      logger.debug(`[定时任务] 任务 ${task.name} 已禁用，跳过执行`);
      return;
    }

    logger.info(`[定时任务] 开始执行数据库任务: ${task.name}`);

    // 执行任务
    const result = await executeScanTask(task, { taskId: task.id });

    // 更新最后执行时间
    await taskService.updateLastExecuteTime(task.id, Date.now());

    if (result.success) {
      logger.info(`[定时任务] 任务 ${task.name} 执行成功，扫描 ${result.scannedRepositories.length} 个仓库，新增 ${result.totalCommits} 条提交`);
    } else {
      logger.error(`[定时任务] 任务 ${task.name} 执行失败: ${result.errorMessage}`);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(`[定时任务] 执行数据库任务失败: ${errorMsg}`);
  }
}

/**
 * 启动定时任务调度器
 * 
 * 功能说明：
 * 1. 如果已有定时任务在运行，先停止旧任务
 * 2. 从配置文件读取定时任务配置（向后兼容）
 * 3. 从数据库加载启用的定时任务
 * 4. 支持多个定时任务同时运行
 * 
 * 配置格式：
 * - 字符串格式（向后兼容）：单个 Cron 表达式
 * - 数组格式（推荐）：支持多个定时任务，每个任务可配置描述信息
 * 
 * 数据库任务：
 * - 从 ScanTask 表中加载 taskType='scheduled' 且 enabled=true 的任务
 * - 每个任务使用自己的 Cron 表达式和扫描配置
 * 
 * @throws {Error} 当配置文件格式错误时可能抛出异常
 */
export async function startScheduler(): Promise<void> {
  // 如果已有定时任务在运行，先停止（避免重复启动）
  if (currentSchedulers.length > 0) {
    logger.info('[定时任务] 检测到已有任务运行，先停止旧任务');
    stopScheduler();
  }

  const taskService = new ScanTaskService();
  const schedulers: ScheduledTask[] = [];

  // 1. 加载配置文件中的定时任务（向后兼容）
  try {
    const config = loadConfig();
    const scheduleTimes = normalizeScheduleConfig(config.scanInterval);

    if (scheduleTimes.length > 0) {
      scheduleTimes.forEach((schedule, index) => {
        const cronExpr = schedule.cron;
        const description = schedule.description || `配置任务 ${index + 1}`;
        
        const task = cron.schedule(cronExpr, executeScan);
        schedulers.push(task);
        
        logger.info(`[定时任务] ${description} 调度已启动，Cron 表达式: ${cronExpr}`);
      });
    }
  } catch (error) {
    logger.warn('[定时任务] 加载配置文件任务失败，继续加载数据库任务:', error);
  }

  // 2. 加载数据库中的定时任务
  try {
    const dbTasks = await taskService.getEnabledScheduledTasks();

    if (dbTasks.length > 0) {
      dbTasks.forEach((task) => {
        if (!task.cronExpression) {
          logger.warn(`[定时任务] 任务 ${task.name} 没有 Cron 表达式，跳过`);
          return;
        }

        // 创建定时任务，执行时调用 executeDatabaseTask
        const scheduledTask = cron.schedule(task.cronExpression, () => {
          executeDatabaseTask(task.id).catch((error) => {
            logger.error(`[定时任务] 执行数据库任务 ${task.name} 失败:`, error);
          });
        });

        schedulers.push(scheduledTask);
        logger.info(`[定时任务] 数据库任务 "${task.name}" 调度已启动，Cron 表达式: ${task.cronExpression}`);
      });
    }
  } catch (error) {
    logger.error('[定时任务] 加载数据库任务失败:', error);
  }

  // 检查是否有任何任务
  if (schedulers.length === 0) {
    logger.warn('[定时任务] 未找到任何定时任务（配置文件或数据库），调度器未启动');
    return;
  }

  currentSchedulers = schedulers;
  logger.info(`[定时任务] 调度器已启动，共 ${currentSchedulers.length} 个定时任务`);
}

/**
 * 停止定时任务调度器
 * 
 * 功能说明：
 * 1. 停止所有正在运行的定时任务
 * 2. 清空任务列表
 * 3. 记录停止日志
 * 
 * 注意：停止后的任务无法自动恢复，需要调用 startScheduler() 重新启动
 */
export function stopScheduler(): void {
  if (currentSchedulers.length === 0) {
    logger.debug('[定时任务] 没有运行中的任务');
    return;
  }

  // 停止所有定时任务
  currentSchedulers.forEach((scheduler, index) => {
    scheduler.stop();
    logger.info(`[定时任务] 调度器 ${index + 1} 已停止`);
  });

  // 清空任务列表
  currentSchedulers = [];
  logger.info('[定时任务] 所有调度器已停止');
}

/**
 * 重启定时任务调度器
 * 
 * 功能说明：
 * 1. 停止当前所有定时任务
 * 2. 重新加载配置文件
 * 3. 重新加载数据库任务
 * 4. 使用新配置启动定时任务
 * 
 * 使用场景：
 * - 配置文件热重载时调用
 * - 数据库任务更新时调用
 * - 需要更新定时任务配置时调用
 * 
 * @returns {Promise<void>}
 * 
 * @example
 * // 在配置热重载时调用
 * await restartScheduler();
 */
export async function restartScheduler(): Promise<void> {
  logger.info('[定时任务] 正在重启调度器...');

  // 停止当前定时任务
  stopScheduler();

  // 启动新的定时任务（会读取最新配置和数据库任务）
  await startScheduler();

  logger.info('[定时任务] 调度器已使用新配置重启');
}

