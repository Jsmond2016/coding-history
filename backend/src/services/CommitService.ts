import { prisma } from '../db/client.js';
import type { Commit } from '../schemas/database.schema.js';
import type { ScannedCommit } from './GitScanService.js';
import { calculateWorkStatus, type WorkStatus } from '../config/workStatus.config.js';

export interface CommitWithRepoName extends Commit {
  repoName: string;
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
}

export class CommitService {
  /**
   * 批量插入提交记录（带去重）
   */
  async batchInsertCommits(repoId: string, commits: ScannedCommit[]): Promise<{ inserted: number; skipped: number }> {
    if (commits.length === 0) return { inserted: 0, skipped: 0 };

    const now = BigInt(Date.now());
    
    // 查询已存在的 commit hash（跨仓库去重）
    const existingHashes = await prisma.commit.findMany({
      where: {
        commitHash: {
          in: commits.map(c => c.hash)
        }
      },
      select: {
        commitHash: true
      }
    });

    const existingHashSet = new Set(existingHashes.map(c => c.commitHash));
    
    // 过滤出新的提交
    const newCommits = commits.filter(commit => !existingHashSet.has(commit.hash));
    
    if (newCommits.length === 0) {
      return { inserted: 0, skipped: commits.length };
    }

    // 批量插入新提交
    await prisma.commit.createMany({
      data: newCommits.map(commit => ({
        repoId,
        commitHash: commit.hash,
        authorName: commit.authorName,
        authorEmail: commit.authorEmail,
        commitDate: BigInt(commit.date),
        message: commit.message,
        filesChanged: commit.filesChanged,
        insertions: commit.insertions,
        deletions: commit.deletions,
        createdAt: now
      }))
    });

    return {
      inserted: newCommits.length,
      skipped: commits.length - newCommits.length
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
    isOvertime?: boolean; // 筛选是否加班
  }): Promise<{ data: CommitsByDate[]; total: number }> {
    const { startDate, endDate, repositoryIds, isOvertime } = params;

    const where: any = {
      commitDate: {
        gte: BigInt(startDate),
        lte: BigInt(endDate)
      },
      ...(repositoryIds && repositoryIds.length > 0 ? { repoId: { in: repositoryIds } } : {})
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

    // 转换为带加班信息的提交记录
    const commitsWithOvertime: CommitWithOvertime[] = commits.map(commit => {
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

    // 按日期分组
    const commitsByDateMap = new Map<string, CommitWithOvertime[]>();
    
    filteredCommits.forEach(commit => {
      const date = new Date(commit.commitDate).toISOString().split('T')[0]; // YYYY-MM-DD
      
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

        // 计算工作状态：根据总提交次数和是否有加班记录
        const workStatus = calculateWorkStatus(
          commits.length,
          overtimeCommits.length > 0
        );

        return {
          date,
          commits: sortedCommits, // 返回排序后的提交列表
          totalCommits: commits.length,
          overtimeCount: overtimeCommits.length,
          latestOvertimeCommits: overtimeTimes,
          workStatus
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
    page: number;
    pageSize: number;
  }): Promise<{ data: CommitWithRepoName[]; total: number }> {
    const { startDate, endDate, repositoryIds, page, pageSize } = params;
    const skip = (page - 1) * pageSize;

    const where = {
      commitDate: {
        gte: BigInt(startDate),
        lte: BigInt(endDate)
      },
      ...(repositoryIds && repositoryIds.length > 0 ? { repoId: { in: repositoryIds } } : {})
    };

    // 查询总数
    const total = await prisma.commit.count({ where });

    // 查询数据
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
    const { startDate, endDate, repositoryIds } = params;

    const where = {
      commitDate: {
        gte: BigInt(startDate),
        lte: BigInt(endDate)
      },
      ...(repositoryIds && repositoryIds.length > 0 ? { repoId: { in: repositoryIds } } : {})
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
    }
    
    byDateQuery += ` GROUP BY date ORDER BY date DESC`;
    
    const byDateRaw = await prisma.$queryRawUnsafe<Array<{
      date: string;
      commits: bigint;
      insertions: bigint | null;
      deletions: bigint | null;
    }>>(byDateQuery, ...(repositoryIds || []));

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
