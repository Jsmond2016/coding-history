import { prisma } from '../db/client.js';
import type { Commit } from '../schemas/database.schema.js';
import type { ScannedCommit } from './GitScanService.js';
import { calculateWorkStatus, type WorkStatus } from '../config/workStatus.config.js';
import { ConfigService } from './ConfigService.js';

export interface CommitWithRepoName extends Commit {
  repoName: string;
  branch?: string; // 提交所在的分支
}

export interface CommitWithOvertime extends CommitWithRepoName {
  branch?: string; // 提交所在的分支
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
  private configService: ConfigService;

  constructor() {
    this.configService = new ConfigService();
  }

  /**
   * 获取所有仓库的忽略分支列表（合并去重）
   */
  private async getAllIgnoredBranches(): Promise<string[]> {
    return await this.configService.getAllIgnoredBranches();
  }

  /**
   * 批量插入提交记录（带去重）
   * 注意：同一个 commit hash 在同一个仓库中只会记录一次（基于 [repoId, commitHash] 唯一约束）
   * 如果同一个 commit 在多个分支中，会优先记录更重要的分支
   */
  async batchInsertCommits(repoId: string, commits: ScannedCommit[]): Promise<{ inserted: number; skipped: number }> {
    if (commits.length === 0) return { inserted: 0, skipped: 0 };

    const now = BigInt(Date.now());
    
    // 查询已存在的 commit hash（基于 repoId 和 commitHash 去重）
    const existingCommits = await prisma.commit.findMany({
      where: {
        repoId,
        commitHash: {
          in: commits.map(c => c.hash)
        }
      },
      select: {
        commitHash: true,
        branch: true
      }
    });

    // 创建已存在的 commit hash 集合（同一仓库内去重）
    const existingHashSet = new Set(existingCommits.map(c => c.commitHash));
    
    // 对于已存在的 commit，如果新扫描到的分支更优先，可以考虑更新分支信息
    // 但为了简化，这里只插入新的 commit
    const newCommits = commits.filter(commit => !existingHashSet.has(commit.hash));
    
    if (newCommits.length === 0) {
      return { inserted: 0, skipped: commits.length };
    }

    // 对同一个 commit hash 进行去重（如果扫描时发现同一个 commit 在多个分支中）
    // 使用 Map 来去重，保留第一个出现的分支信息
    const uniqueCommitsMap = new Map<string, ScannedCommit>();
    newCommits.forEach(commit => {
      if (!uniqueCommitsMap.has(commit.hash)) {
        uniqueCommitsMap.set(commit.hash, commit);
      }
      // 如果已存在，可以选择更新分支信息（如果新分支更优先）
      // 这里简单保留第一个，因为 GitScanService 已经做了分支优先级处理
    });

    const uniqueCommits = Array.from(uniqueCommitsMap.values());

    // 批量插入新提交
    await prisma.commit.createMany({
      data: uniqueCommits.map(commit => ({
        repoId,
        commitHash: commit.hash,
        authorName: commit.authorName,
        authorEmail: commit.authorEmail,
        commitDate: BigInt(commit.date),
        message: commit.message,
        filesChanged: commit.filesChanged,
        insertions: commit.insertions,
        deletions: commit.deletions,
        branch: commit.branch || null,
        createdAt: now
      }))
    });

    return {
      inserted: uniqueCommits.length,
      skipped: commits.length - uniqueCommits.length
    };
  }

  /**
   * 检查提交是否为加班（19:00之后）
   */
  private isOvertimeCommit(commitDate: number): boolean {
    const date = new Date(commitDate);
    const hour = date.getHours();
    return hour >= 19;
  }

  /**
   * 格式化时间为 HH:mm
   */
  private formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toTimeString().slice(0, 5); // HH:mm
  }

  /**
   * 查询提交记录（按日期分组）
   */
  async getCommitsByDate(params: {
    startDate: number;
    endDate: number;
    repositoryIds?: string[];
    authorEmails?: string[];
    isOvertime?: boolean; // 筛选是否加班
  }): Promise<{ data: CommitsByDate[]; total: number }> {
    const { startDate, endDate, repositoryIds, authorEmails, isOvertime } = params;

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

    // 获取忽略的分支列表
    const ignoredBranches = await this.getAllIgnoredBranches();

    // 转换为带加班信息的提交记录，并过滤忽略的分支
    const commitsWithOvertime: CommitWithOvertime[] = commits
      .filter(commit => {
        // 过滤掉忽略分支的提交
        if (commit.branch && ignoredBranches.includes(commit.branch)) {
          return false;
        }
        return true;
      })
      .map(commit => {
        const commitDate = Number(commit.commitDate);
        const isOvertimeCommit = this.isOvertimeCommit(commitDate);

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
      });

    // 按是否加班筛选
    const filteredCommits = isOvertime !== undefined
      ? commitsWithOvertime.filter(c => c.isOvertime === isOvertime)
      : commitsWithOvertime;

    // 按日期分组，并对同一仓库同一 commit hash 进行去重
    // 确保同一个 commit 在同一天只统计一次
    const commitsByDateMap = new Map<string, CommitWithOvertime[]>();
    const seenCommitsInDate = new Map<string, Set<string>>(); // date -> Set<repoId:commitHash>
    
    filteredCommits.forEach(commit => {
      const date = new Date(commit.commitDate).toISOString().split('T')[0]; // YYYY-MM-DD
      const commitKey = `${commit.repoId}:${commit.commitHash}`;
      
      // 初始化该日期的已见 commit 集合
      if (!seenCommitsInDate.has(date)) {
        seenCommitsInDate.set(date, new Set());
      }
      
      // 如果该 commit 在同一天已经出现过，跳过（去重）
      if (seenCommitsInDate.get(date)!.has(commitKey)) {
        return;
      }
      
      // 标记该 commit 已处理
      seenCommitsInDate.get(date)!.add(commitKey);
      
      // 添加到日期分组
      if (!commitsByDateMap.has(date)) {
        commitsByDateMap.set(date, []);
      }
      commitsByDateMap.get(date)!.push(commit);
    });

    // 转换为数组并计算每天的加班情况和工作状态
    const data: CommitsByDate[] = Array.from(commitsByDateMap.entries())
      .map(([date, commits]) => {
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
          overtimeCommits.length > 0
        );

        // 获取当日修改的仓库列表（去重）
        const repositories = Array.from(new Set(commits.map(c => c.repoName)));
        
        // 获取当日修改的分支列表（去重，过滤掉 undefined）
        const branches = Array.from(new Set(
          commits
            .map(c => c.branch)
            .filter((branch): branch is string => !!branch)
        ));

        return {
          date,
          commits: sortedCommits, // 返回排序后的提交列表
          totalCommits: commits.length,
          overtimeCount: overtimeCommits.length,
          latestOvertimeCommits: overtimeTimes,
          workStatus,
          hasRelease,
          repositories,
          branches
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date)); // 按日期降序

    return { data, total: filteredCommits.length };
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

    // 获取忽略的分支列表，用于过滤查询
    const ignoredBranches = this.getIgnoredBranches();
    
    // 添加分支过滤条件：排除忽略分支，但保留 branch 为 null 的记录
    const whereWithBranchFilter: any = {
      ...where,
      OR: [
        { branch: null },
        { branch: { notIn: ignoredBranches } }
      ]
    };

    // 查询总数（已过滤忽略分支）
    const total = await prisma.commit.count({ where: whereWithBranchFilter });

    // 查询数据（已过滤忽略分支）
    const commits = await prisma.commit.findMany({
      where: whereWithBranchFilter,
      include: {
        repository: {
          select: { name: true }
        }
      },
      orderBy: { commitDate: 'desc' },
      skip,
      take: pageSize
    });

    // 数据已经在数据库查询时过滤了忽略分支，这里直接映射即可
    const data = commits.map(commit => ({
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

    // 获取忽略的分支列表
    const ignoredBranches = await this.getAllIgnoredBranches();

    // 构建 where 条件，正确处理忽略分支的过滤
    // 需要排除 branch 在忽略列表中的记录，但保留 branch 为 null 的记录
    const where: any = {
      commitDate: {
        gte: BigInt(startDate),
        lte: BigInt(endDate)
      },
      ...(repositoryIds && repositoryIds.length > 0 ? { repoId: { in: repositoryIds } } : {}),
      ...(authorEmails && authorEmails.length > 0 ? { authorEmail: { in: authorEmails } } : {}),
      // 过滤掉忽略分支的提交：branch 为 null 或 branch 不在忽略列表中
      OR: [
        { branch: null },
        { branch: { notIn: ignoredBranches } }
      ]
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
        DATE(commit_date / 1000, 'unixepoch') as date,
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

    // 过滤忽略的分支
    if (ignoredBranches.length > 0) {
      const branchPlaceholders = ignoredBranches.map(() => '?').join(',');
      byDateQuery += ` AND (branch IS NULL OR branch NOT IN (${branchPlaceholders}))`;
      queryParams.push(...ignoredBranches);
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
}
