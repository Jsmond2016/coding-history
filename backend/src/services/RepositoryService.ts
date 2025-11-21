import { prisma } from '../db/client.js';
import type { Repository } from '../schemas/database.schema.js';

export class RepositoryService {
  /**
   * 获取所有仓库
   */
  async getAllRepositories(): Promise<Repository[]> {
    const repos = await prisma.repository.findMany({
      orderBy: { name: 'asc' }
    });
    
    return repos.map(repo => ({
      id: repo.id,
      name: repo.name,
      path: repo.path,
      last_scan_time: repo.lastScanTime ? Number(repo.lastScanTime) : null,
      total_commits: repo.totalCommits,
      created_at: Number(repo.createdAt),
      updated_at: Number(repo.updatedAt)
    }));
  }

  /**
   * 根据 ID 获取仓库
   */
  async getRepositoryById(id: string): Promise<Repository | null> {
    const repo = await prisma.repository.findUnique({
      where: { id }
    });
    
    if (!repo) return null;
    
    return {
      id: repo.id,
      name: repo.name,
      path: repo.path,
      last_scan_time: repo.lastScanTime ? Number(repo.lastScanTime) : null,
      total_commits: repo.totalCommits,
      created_at: Number(repo.createdAt),
      updated_at: Number(repo.updatedAt)
    };
  }

  /**
   * 创建或更新仓库
   */
  async upsertRepository(repo: {
    id: string;
    name: string;
    path: string;
  }): Promise<void> {
    const now = BigInt(Date.now());
    
    await prisma.repository.upsert({
      where: { id: repo.id },
      update: {
        name: repo.name,
        path: repo.path,
        updatedAt: now
      },
      create: {
        id: repo.id,
        name: repo.name,
        path: repo.path,
        createdAt: now,
        updatedAt: now
      }
    });
  }

  /**
   * 更新仓库的最后扫描时间和提交总数
   */
  async updateRepositoryScanInfo(repoId: string, lastScanTime: number, totalCommits: number): Promise<void> {
    await prisma.repository.update({
      where: { id: repoId },
      data: {
        lastScanTime: BigInt(lastScanTime),
        totalCommits,
        updatedAt: BigInt(Date.now())
      }
    });
  }

  /**
   * 获取仓库的最后扫描时间
   */
  async getLastScanTime(repoId: string): Promise<number | null> {
    const repo = await prisma.repository.findUnique({
      where: { id: repoId },
      select: { lastScanTime: true }
    });
    
    return repo?.lastScanTime ? Number(repo.lastScanTime) : null;
  }
}

