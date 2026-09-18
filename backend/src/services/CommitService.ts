import { prisma } from '../db/client.js';
import type { ScannedCommit } from './GitScanService.js';
import { calculateWorkStatus, type WorkStatus, type WorkStatusConfig } from '../config/workStatus.config.js';
import { DataMetricsConfigService } from './DataMetricsConfigService.js';
import { logger } from '../config/logger.js';
import { cacheService } from './CacheService.js';

const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';
const shanghaiDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHANGHAI_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
const shanghaiTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SHANGHAI_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});
const shanghaiHourFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SHANGHAI_TIME_ZONE,
  hour: '2-digit',
  hourCycle: 'h23'
});

function formatShanghaiDate(timestamp: number): string {
  return shanghaiDateFormatter.format(new Date(timestamp));
}

function formatShanghaiTime(timestamp: number): string {
  return shanghaiTimeFormatter.format(new Date(timestamp));
}

function getShanghaiHour(timestamp: number): number {
  const hour = shanghaiHourFormatter.format(new Date(timestamp));
  return Number(hour);
}

/**
 * 扫描入库的「时间起点」补洞：
 * 若仅用「最近 N 天」作为 git --since，一旦中间几天同步失败，窗口会向前滑，
 * 库内最新提交若早于窗口起点，则 3-10～窗口起点之间的提交永远不会再被扫到。
 * 当库内最新提交早于 plannedRangeStart 时，将起点前推到「最新提交日前 2 天 0 点」（且不低于 maxLookbackDays）。
 */
export function resolveScanFromDateWithGapFill(
  plannedRangeStart: Date,
  dbLatestCommitMs: number | null,
  maxLookbackDays = 365
): Date {
  const floor = new Date();
  floor.setDate(floor.getDate() - maxLookbackDays);
  floor.setHours(0, 0, 0, 0);

  if (plannedRangeStart.getTime() < floor.getTime()) {
    return floor;
  }

  if (dbLatestCommitMs == null || dbLatestCommitMs >= plannedRangeStart.getTime()) {
    return plannedRangeStart;
  }

  const extended = new Date(dbLatestCommitMs);
  extended.setDate(extended.getDate() - 2);
  extended.setHours(0, 0, 0, 0);

  return extended.getTime() < floor.getTime() ? floor : extended;
}

export interface CommitWithRepoName {
  id: number;
  repoId: string;
  repoName: string;
  commitHash: string;
  authorName: string;
  authorEmail: string;
  commitDate: number;
  message: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  branch?: string; // 提交所在的分支
  createdAt: number;
}

export interface CommitWithOvertime extends CommitWithRepoName {
  isOvertime: boolean; // 是否加班（提交时间 >= 19:00）
  overtimeCommitTimes?: string[]; // 加班提交的时间点（最多5个）
}

export interface CommitsByDate {
  date: string; // YYYY-MM-DD
  commits: CommitWithOvertime[];
  totalCommits: number;
  overtimeCount: number; // 当天加班提交数量
  latestOvertimeCommits: string[]; // 最晚的5个加班提交时间点
  workStatus: WorkStatus; // 工作状态
  hasRelease: boolean; // 是否有发版提交（chore(release)）
  repositories: string[]; // 当日修改的仓库列表
  branches: string[]; // 当日修改的分支列表
}

export class CommitService {
  private dataMetricsConfigService: DataMetricsConfigService;

  constructor() {
    this.dataMetricsConfigService = new DataMetricsConfigService();
  }

  /**
   * 某仓库在库中的最新提交时间（毫秒），无记录时为 null
   */
  async getMaxCommitDateMsForRepo(repoId: string): Promise<number | null> {
    const row = await prisma.commit.aggregate({
      where: { repoId },
      _max: { commitDate: true }
    });
    const v = row._max.commitDate;
    return v == null ? null : Number(v);
  }

  /**
   * 获取仓库的提交时间范围（最早和最晚的提交时间）
   * @returns { earliest: 最早提交时间（毫秒）, latest: 最晚提交时间（毫秒） } 或 null（无记录时）
   */
  async getCommitDateRangeForRepo(repoId: string): Promise<{ earliest: number; latest: number } | null> {
    const result = await prisma.commit.aggregate({
      where: { repoId },
      _min: { commitDate: true },
      _max: { commitDate: true }
    });

    const earliest = result._min.commitDate;
    const latest = result._max.commitDate;

    if (earliest == null || latest == null) {
      return null;
    }

    return {
      earliest: Number(earliest),
      latest: Number(latest)
    };
  }

  /**
   * 获取所有已入库提交的时间范围。
   */
  async getCommitDateRange(): Promise<{ earliest: number; latest: number } | null> {
    const result = await prisma.commit.aggregate({
      _min: { commitDate: true },
      _max: { commitDate: true }
    });

    const earliest = result._min.commitDate;
    const latest = result._max.commitDate;

    if (earliest == null || latest == null) {
      return null;
    }

    return {
      earliest: Number(earliest),
      latest: Number(latest)
    };
  }

  /**
   * 批量插入提交记录（按 repoId + commitHash 去重，同一 commit 只插一次）
   * 来自未上线分支的写 branch=分支名，来自 release 的写 branch=null
   */
  async batchInsertCommits(repoId: string, commits: ScannedCommit[]): Promise<{ inserted: number; skipped: number }> {
    if (commits.length === 0) return { inserted: 0, skipped: 0 };

    const now = BigInt(Date.now());
    const uniqueHashes = [...new Set(commits.map(c => c.hash))];

    const existing = await prisma.commit.findMany({
      where: { repoId, commitHash: { in: uniqueHashes } },
      select: { commitHash: true }
    });
    const existingSet = new Set(existing.map(c => c.commitHash));
    const newCommits = commits.filter(c => !existingSet.has(c.hash));
    if (newCommits.length === 0) {
      return { inserted: 0, skipped: commits.length };
    }

    // 同一 hash 可能有多条（来自不同分支），只插一条：取第一条（扫描层已按「优先未上线分支」去重）
    const byHash = new Map<string, ScannedCommit>();
    for (const c of newCommits) {
      if (!byHash.has(c.hash)) byHash.set(c.hash, c);
    }
    const toInsert = Array.from(byHash.values());

    const branchForDb = (branch: string | undefined): string | null => {
      if (!branch || branch === 'release' || branch === 'master') return null;
      return branch;
    };

    try {
      await prisma.commit.createMany({
        data: toInsert.map(commit => ({
          repoId,
          commitHash: commit.hash,
          authorName: commit.authorName,
          authorEmail: commit.authorEmail,
          commitDate: BigInt(commit.date),
          message: commit.message,
          filesChanged: commit.filesChanged,
          insertions: commit.insertions,
          deletions: commit.deletions,
          branch: branchForDb(commit.branch),
          createdAt: now
        }))
      });
    } catch (error) {
      logger.warn('Batch insert failed, trying individual inserts:', error);
      let inserted = 0;
      for (const commit of toInsert) {
        try {
          await prisma.commit.create({
            data: {
              repoId,
              commitHash: commit.hash,
              authorName: commit.authorName,
              authorEmail: commit.authorEmail,
              commitDate: BigInt(commit.date),
              message: commit.message,
              filesChanged: commit.filesChanged,
              insertions: commit.insertions,
              deletions: commit.deletions,
              branch: branchForDb(commit.branch),
              createdAt: now
            }
          });
          inserted++;
        } catch {
          logger.debug(`Skipped duplicate commit ${commit.hash}`);
        }
      }
      if (inserted > 0) {
        await cacheService.invalidate('commits');
      }
      return { inserted, skipped: commits.length - inserted };
    }

    await cacheService.invalidate('commits');
    return {
      inserted: toInsert.length,
      skipped: commits.length - toInsert.length
    };
  }

  /**
   * 检查提交是否为加班（根据配置的加班时间阈值）
   */
  private isOvertimeCommit(commitDate: number, overtimeHour: number): boolean {
    return getShanghaiHour(commitDate) >= overtimeHour;
  }

  /**
   * 格式化时间为 HH:mm
   */
  private formatTime(timestamp: number): string {
    return formatShanghaiTime(timestamp);
  }

  /**
   * 查询提交记录（按日期分组）
   */
  async getCommitsByDate(params: {
    startDate: number;
    endDate: number;
    repositoryIds?: string[];
    authorEmails?: string[];
    overtimeMode?: 'all' | 'overtime_days' | 'overtime_commits' | 'non_overtime_days';
  }) {
    const { startDate, endDate, repositoryIds, authorEmails, overtimeMode = 'all' } = params;

    const where: any = {
      commitDate: {
        gte: BigInt(startDate),
        lte: BigInt(endDate)
      },
      ...(repositoryIds && repositoryIds.length > 0 ? { repoId: { in: repositoryIds } } : {}),
      ...(authorEmails && authorEmails.length > 0 ? { authorEmail: { in: authorEmails } } : {})
    };

    // 查询所有符合条件的提交
    const commits = await prisma.commit.findMany({
      where,
      include: {
        repository: {
          select: { name: true }
        }
      },
      orderBy: { commitDate: 'desc' }
    });

    // 获取数据指标配置
    const dataMetricsConfig = await this.dataMetricsConfigService.getConfig();
    const workStatusConfig: WorkStatusConfig = {
      thresholds: dataMetricsConfig.thresholds,
      overtimeHour: dataMetricsConfig.overtimeHour
    };

    const commitsWithOvertime: CommitWithOvertime[] = await Promise.all(
      commits.map(async (commit) => {
          const commitDate = Number(commit.commitDate);
          const isOvertimeCommit = this.isOvertimeCommit(commitDate, dataMetricsConfig.overtimeHour);

          return {
            id: commit.id,
            repoId: commit.repoId,
            commitHash: commit.commitHash,
            authorName: commit.authorName,
            authorEmail: commit.authorEmail,
            commitDate,
            message: commit.message,
            filesChanged: commit.filesChanged,
            insertions: commit.insertions,
            deletions: commit.deletions,
            branch: commit.branch || undefined,
            createdAt: Number(commit.createdAt),
            repoName: commit.repository.name,
            isOvertime: isOvertimeCommit,
            overtimeCommitTimes: isOvertimeCommit ? [this.formatTime(commitDate)] : undefined
          };
        })
    );

    // 按日期分组，并对同一仓库同一 commit hash 进行去重
    // 确保同一个 commit 在同一天只统计一次，但收集所有分支信息
    const commitsByDateMap = new Map<string, CommitWithOvertime[]>();
    const seenCommitsInDate = new Map<string, Map<string, CommitWithOvertime>>(); // date -> Map<repoId:commitHash, commit>
    
    commitsWithOvertime.forEach(commit => {
      const date = formatShanghaiDate(commit.commitDate);
      const commitKey = `${commit.repoId}:${commit.commitHash}`;
      
      // 初始化该日期的已见 commit Map
      if (!seenCommitsInDate.has(date)) {
        seenCommitsInDate.set(date, new Map());
      }
      
      const dateCommitsMap = seenCommitsInDate.get(date)!;
      
      // 如果该 commit 在同一天已经出现过，合并分支信息
      if (dateCommitsMap.has(commitKey)) {
        const existingCommit = dateCommitsMap.get(commitKey)!;
        // 合并分支信息：如果新分支不在现有分支列表中，更新 branch 字段
        // 注意：这里只保留一个 branch 字段，但可以通过其他方式收集所有分支
        // 为了简化，如果现有 commit 没有 branch 或新 commit 的 branch 不同，更新为包含更多信息的
        if (!existingCommit.branch && commit.branch) {
          existingCommit.branch = commit.branch;
        } else if (existingCommit.branch && commit.branch && existingCommit.branch !== commit.branch) {
          // 如果两个分支不同，保留第一个（或者可以合并，但为了简化先保留第一个）
          // 这里可以根据需要调整策略
        }
        return;
      }
      
      // 新 commit，添加到 Map
      dateCommitsMap.set(commitKey, commit);
      
      // 添加到日期分组
      if (!commitsByDateMap.has(date)) {
        commitsByDateMap.set(date, []);
      }
      commitsByDateMap.get(date)!.push(commit);
    });

    // 转换为数组并计算每天的加班情况和工作状态
    const buildDateGroup = (date: string, commits: CommitWithOvertime[]): CommitsByDate => {
        // 获取当天所有加班提交的时间点（最多5个，按时间降序）
        const overtimeCommits = commits.filter(c => c.isOvertime);
        const overtimeTimes = overtimeCommits
          .map(c => ({
            time: this.formatTime(c.commitDate),
            timestamp: c.commitDate
          }))
          .sort((a, b) => b.timestamp - a.timestamp) // 按时间降序
          .slice(0, 5)
          .map(item => item.time);

        // 对每天的提交按时间降序排序
        const sortedCommits = [...commits].sort((a, b) => b.commitDate - a.commitDate);

        // 检测是否有发版提交（chore(release)）
        const hasRelease = commits.some(commit => {
          const message = commit.message.toLowerCase();
          return message.includes('chore(release)') || message.includes('chore: release');
        });

        // 计算工作状态：根据总提交次数和是否有加班记录
        const workStatus = calculateWorkStatus(
          commits.length,
          overtimeCommits.length > 0,
          workStatusConfig
        );

        // 获取当日修改的仓库列表（去重）
        const repositories = Array.from(new Set(commits.map(c => c.repoName)));
        
        // 获取当日修改的分支列表（从所有 commit 的分支信息中收集，去重）
        const branchesSet = new Set<string>();
        commits.forEach(c => {
          if (c.branch) {
            branchesSet.add(c.branch);
          }
        });
        const branches = Array.from(branchesSet).sort();

        return {
          date,
          commits: sortedCommits, // 返回排序后的提交列表（包含该天的所有提交，不进行过滤）
          totalCommits: commits.length,
          overtimeCount: overtimeCommits.length,
          latestOvertimeCommits: overtimeTimes,
          workStatus,
          hasRelease,
          repositories,
          branches
        };
      };

    let data: CommitsByDate[] = Array.from(commitsByDateMap.entries())
      .map(([date, commits]) => buildDateGroup(date, commits))
      .sort((a, b) => b.date.localeCompare(a.date)); // 按日期降序

    if (overtimeMode === 'overtime_days') {
      data = data.filter(dateGroup => dateGroup.overtimeCount > 0);
    } else if (overtimeMode === 'non_overtime_days') {
      data = data.filter(dateGroup => dateGroup.overtimeCount === 0);
    } else if (overtimeMode === 'overtime_commits') {
      data = data
        .map(dateGroup => buildDateGroup(
          dateGroup.date,
          dateGroup.commits.filter(commit => commit.isOvertime)
        ))
        .filter(dateGroup => dateGroup.totalCommits > 0);
    }

    // 计算总提交数（用于返回）
    const totalCommits = data.reduce((sum, dateGroup) => sum + dateGroup.totalCommits, 0);

    return { data, total: totalCommits, metricsConfig: dataMetricsConfig };
  }

  /**
   * 查询提交记录（旧接口，保持兼容）
   */
  async getCommits(params: {
    startDate: number;
    endDate: number;
    repositoryIds?: string[];
    authorEmails?: string[];
    page: number;
    pageSize: number;
  }): Promise<{ data: CommitWithRepoName[]; total: number }> {
    const { startDate, endDate, repositoryIds, authorEmails, page, pageSize } = params;
    const skip = (page - 1) * pageSize;

    const where = {
      commitDate: {
        gte: BigInt(startDate),
        lte: BigInt(endDate)
      },
      ...(repositoryIds && repositoryIds.length > 0 ? { repoId: { in: repositoryIds } } : {}),
      ...(authorEmails && authorEmails.length > 0 ? { authorEmail: { in: authorEmails } } : {})
    };

    const total = await prisma.commit.count({ where });

    const commits = await prisma.commit.findMany({
      where,
      include: {
        repository: {
          select: { name: true }
        }
      },
      orderBy: { commitDate: 'desc' },
      skip,
      take: pageSize
    });

    const data: CommitWithRepoName[] = commits.map(commit => ({
      id: commit.id,
      repoId: commit.repoId,
      commitHash: commit.commitHash,
      authorName: commit.authorName,
      authorEmail: commit.authorEmail,
      commitDate: Number(commit.commitDate),
      message: commit.message,
      filesChanged: commit.filesChanged,
      insertions: commit.insertions,
      deletions: commit.deletions,
      branch: commit.branch || undefined,
      createdAt: Number(commit.createdAt),
      repoName: commit.repository.name
    }));

    return { data, total };
  }

  /**
   * 获取统计数据
   */
  async getStatistics(params: {
    startDate: number;
    endDate: number;
    repositoryIds?: string[];
    authorEmails?: string[];
  }): Promise<{
    totalCommits: number;
    totalInsertions: number;
    totalDeletions: number;
    totalFilesChanged: number;
    byRepository: Array<{
      repoId: string;
      repoName: string;
      commits: number;
      insertions: number;
      deletions: number;
    }>;
    byDate: Array<{
      date: string;
      commits: number;
      insertions: number;
      deletions: number;
    }>;
  }> {
    const { startDate, endDate, repositoryIds, authorEmails } = params;

    const where: any = {
      commitDate: {
        gte: BigInt(startDate),
        lte: BigInt(endDate)
      },
      ...(repositoryIds && repositoryIds.length > 0 ? { repoId: { in: repositoryIds } } : {}),
      ...(authorEmails && authorEmails.length > 0 ? { authorEmail: { in: authorEmails } } : {})
    };

    // 总体统计
    const aggregations = await prisma.commit.aggregate({
      where,
      _count: true,
      _sum: {
        insertions: true,
        deletions: true,
        filesChanged: true
      }
    });

    // 按仓库统计
    const byRepoData = await prisma.commit.groupBy({
      by: ['repoId'],
      where,
      _count: true,
      _sum: {
        insertions: true,
        deletions: true
      }
    });

    // 获取仓库名称
    const repoIds = byRepoData.map(item => item.repoId);
    const repositories = await prisma.repository.findMany({
      where: { id: { in: repoIds } },
      select: { id: true, name: true }
    });
    const repoMap = new Map(repositories.map(r => [r.id, r.name]));

    const byRepository = byRepoData.map(item => ({
      repoId: item.repoId,
      repoName: repoMap.get(item.repoId) || item.repoId,
      commits: item._count,
      insertions: item._sum.insertions || 0,
      deletions: item._sum.deletions || 0
    }));

    // 按日期统计 - 需要使用原始查询
    const queryParams: any[] = [];
    let byDateQuery = `
      SELECT
        DATE(commit_date / 1000, 'unixepoch', '+8 hours') as date,
        COUNT(*) as commits,
        SUM(insertions) as insertions,
        SUM(deletions) as deletions
      FROM commits
      WHERE commit_date >= ${BigInt(startDate)}
        AND commit_date <= ${BigInt(endDate)}
    `;

    if (repositoryIds && repositoryIds.length > 0) {
      const placeholders = repositoryIds.map(() => '?').join(',');
      byDateQuery += ` AND repo_id IN (${placeholders})`;
      queryParams.push(...repositoryIds);
    }

    if (authorEmails && authorEmails.length > 0) {
      const placeholders = authorEmails.map(() => '?').join(',');
      byDateQuery += ` AND author_email IN (${placeholders})`;
      queryParams.push(...authorEmails);
    }

    byDateQuery += ` GROUP BY date ORDER BY date DESC`;

    const byDateRaw = await prisma.$queryRawUnsafe<Array<{
      date: string;
      commits: bigint;
      insertions: bigint | null;
      deletions: bigint | null;
    }>>(byDateQuery, ...queryParams);

    const byDate = byDateRaw.map(row => ({
      date: row.date,
      commits: Number(row.commits),
      insertions: row.insertions ? Number(row.insertions) : 0,
      deletions: row.deletions ? Number(row.deletions) : 0
    }));

    return {
      totalCommits: aggregations._count,
      totalInsertions: aggregations._sum.insertions || 0,
      totalDeletions: aggregations._sum.deletions || 0,
      totalFilesChanged: aggregations._sum.filesChanged || 0,
      byRepository,
      byDate
    };
  }

  async getDataOverview(params: {
    startDate: number;
    endDate: number;
    repositoryIds?: string[];
    authorEmails?: string[];
  }) {
    const { startDate, endDate, repositoryIds, authorEmails } = params;
    const queryParams: any[] = [BigInt(startDate), BigInt(endDate)];
    let repositoryClause = '';
    let authorClause = '';

    if (repositoryIds && repositoryIds.length > 0) {
      const placeholders = repositoryIds.map(() => '?').join(',');
      repositoryClause = ` AND c.repo_id IN (${placeholders})`;
      queryParams.push(...repositoryIds);
    }

    if (authorEmails && authorEmails.length > 0) {
      const placeholders = authorEmails.map(() => '?').join(',');
      authorClause = ` AND c.author_email IN (${placeholders})`;
      queryParams.push(...authorEmails);
    }

    const metricsConfig = await this.dataMetricsConfigService.getConfig();
    const overtimeHour = metricsConfig.overtimeHour;
    const baseWhere = `
      c.commit_date >= ?
      AND c.commit_date <= ?
      ${repositoryClause}
      ${authorClause}
    `;
    const repositoryDistributionRows = await prisma.$queryRawUnsafe<Array<{
      repoId: string;
      repoName: string;
      count: bigint;
      insertions: bigint | null;
      deletions: bigint | null;
      filesChanged: bigint | null;
    }>>(`
      SELECT
        c.repo_id as repoId,
        r.name as repoName,
        COUNT(*) as count,
        SUM(c.insertions) as insertions,
        SUM(c.deletions) as deletions,
        SUM(c.files_changed) as filesChanged
      FROM commits c
      INNER JOIN repositories r ON r.id = c.repo_id
      WHERE ${baseWhere}
      GROUP BY c.repo_id, r.name
      ORDER BY count DESC, repoName ASC
    `, ...queryParams);

    const workIntensityDistributionRows = await prisma.$queryRawUnsafe<Array<{
      status: 'relaxed' | 'normal' | 'busy' | 'crazy';
      days: bigint;
    }>>(`
      WITH daily AS (
        SELECT
          strftime('%Y-%m-%d', c.commit_date / 1000, 'unixepoch', '+8 hours') as commitDay,
          COUNT(*) as commitCount
        FROM commits c
        WHERE ${baseWhere}
        GROUP BY commitDay
      ), intensity AS (
        SELECT
          CASE
            WHEN commitCount < ? THEN 'relaxed'
            WHEN commitCount < ? THEN 'normal'
            WHEN commitCount < ? THEN 'busy'
            ELSE 'crazy'
          END as status
        FROM daily
      )
      SELECT status, COUNT(*) as days
      FROM intensity
      GROUP BY status
    `,
      ...queryParams,
      metricsConfig.thresholds.relaxed,
      metricsConfig.thresholds.normal,
      metricsConfig.thresholds.busy
    );

    const topOvertimeMonthRows = await prisma.$queryRawUnsafe<Array<{
      month: string;
      overtimeDays: bigint;
      activeDays: bigint;
      latestCommitDate: bigint | null;
    }>>(`
      WITH scoped AS (
        SELECT
          c.commit_date as commitDate,
          strftime('%Y-%m', c.commit_date / 1000, 'unixepoch', '+8 hours') as month,
          strftime('%Y-%m-%d', c.commit_date / 1000, 'unixepoch', '+8 hours') as commitDay,
          CASE WHEN CAST(strftime('%H', c.commit_date / 1000, 'unixepoch', '+8 hours') AS INTEGER) >= ?
            THEN 1 ELSE 0 END as isOvertime
        FROM commits c
        WHERE ${baseWhere}
      )
      SELECT
        month,
        COUNT(DISTINCT commitDay) as activeDays,
        COUNT(DISTINCT CASE WHEN isOvertime = 1 THEN commitDay END) as overtimeDays,
        MAX(CASE WHEN isOvertime = 1 THEN commitDate END) as latestCommitDate
      FROM scoped
      GROUP BY month
      HAVING overtimeDays > 0
      ORDER BY overtimeDays DESC, month DESC
      LIMIT 1
    `, overtimeHour, ...queryParams);

    const totalsRows = await prisma.$queryRawUnsafe<Array<{
      commits: bigint;
      overtimeCommits: bigint;
      overtimeDays: bigint;
      repositories: bigint;
      activeDays: bigint;
    }>>(`
      WITH scoped AS (
        SELECT
          c.repo_id as repoId,
          strftime('%Y-%m-%d', c.commit_date / 1000, 'unixepoch', '+8 hours') as commitDay,
          CASE WHEN CAST(strftime('%H', c.commit_date / 1000, 'unixepoch', '+8 hours') AS INTEGER) >= ?
            THEN 1 ELSE 0 END as isOvertime
        FROM commits c
        WHERE ${baseWhere}
      )
      SELECT
        COUNT(*) as commits,
        SUM(isOvertime) as overtimeCommits,
        COUNT(DISTINCT CASE WHEN isOvertime = 1 THEN commitDay END) as overtimeDays,
        COUNT(DISTINCT repoId) as repositories,
        COUNT(DISTINCT commitDay) as activeDays
      FROM scoped
    `, overtimeHour, ...queryParams);

    const repositoryDistribution = repositoryDistributionRows.map(row => ({
      repoId: row.repoId,
      repoName: row.repoName,
      count: Number(row.count),
      insertions: Number(row.insertions ?? 0),
      deletions: Number(row.deletions ?? 0),
      filesChanged: Number(row.filesChanged ?? 0)
    }));
    const workIntensityDistribution = workIntensityDistributionRows.map(row => ({
      status: row.status,
      days: Number(row.days)
    }));

    const topOvertimeMonth = topOvertimeMonthRows[0]
      ? {
          month: topOvertimeMonthRows[0].month,
          overtimeDays: Number(topOvertimeMonthRows[0].overtimeDays),
          activeDays: Number(topOvertimeMonthRows[0].activeDays),
          latestCommitDate: topOvertimeMonthRows[0].latestCommitDate ? Number(topOvertimeMonthRows[0].latestCommitDate) : null
        }
      : null;

    const totals = totalsRows[0]
      ? {
          commits: Number(totalsRows[0].commits),
          overtimeCommits: Number(totalsRows[0].overtimeCommits ?? 0),
          overtimeDays: Number(totalsRows[0].overtimeDays),
          repositories: Number(totalsRows[0].repositories),
          activeDays: Number(totalsRows[0].activeDays)
        }
      : {
          commits: 0,
          overtimeCommits: 0,
          overtimeDays: 0,
          repositories: 0,
          activeDays: 0
        };

    return {
      repositoryDistribution,
      workIntensityDistribution,
      topOvertimeMonth,
      totals,
      metricsConfig
    };
  }
}
