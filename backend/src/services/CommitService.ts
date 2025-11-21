import { prisma } from '../db/client.js';
import type { Commit } from '../schemas/database.schema.js';
import type { ScannedCommit } from './GitScanService.js';

export interface CommitWithRepoName extends Commit {
  repoName: string;
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
      })),
      skipDuplicates: true
    });

    return {
      inserted: newCommits.length,
      skipped: commits.length - newCommits.length
    };
  }

  /**
   * 查询提交记录
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
      repo_id: commit.repoId,
      commit_hash: commit.commitHash,
      author_name: commit.authorName,
      author_email: commit.authorEmail,
      commit_date: Number(commit.commitDate),
      message: commit.message,
      files_changed: commit.filesChanged,
      insertions: commit.insertions,
      deletions: commit.deletions,
      created_at: Number(commit.createdAt),
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
