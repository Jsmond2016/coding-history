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
      lastScanTime: repo.lastScanTime ? Number(repo.lastScanTime) : null,
      totalCommits: repo.totalCommits,
      initialScanToDate: repo.initialScanToDate ? Number(repo.initialScanToDate) : null,
      createdAt: Number(repo.createdAt),
      updatedAt: Number(repo.updatedAt)
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
      lastScanTime: repo.lastScanTime ? Number(repo.lastScanTime) : null,
      totalCommits: repo.totalCommits,
      initialScanToDate: repo.initialScanToDate ? Number(repo.initialScanToDate) : null,
      createdAt: Number(repo.createdAt),
      updatedAt: Number(repo.updatedAt)
    };
  }

  /**
   * 创建或更新仓库
   */
  async upsertRepository(repo: {
    id: string;
    name: string;
    path: string;
    enabled?: boolean;
  }): Promise<void> {
    const now = BigInt(Date.now());
    
    await prisma.repository.upsert({
      where: { id: repo.id },
      update: {
        name: repo.name,
        path: repo.path,
        ...(repo.enabled !== undefined && { enabled: repo.enabled }),
        updatedAt: now
      },
      create: {
        id: repo.id,
        name: repo.name,
        path: repo.path,
        enabled: repo.enabled !== undefined ? repo.enabled : true,
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

  /**
   * 获取仓库的初始扫描进度日期
   * @returns 已扫描到的日期（时间戳），如果未开始则返回 null
   */
  async getInitialScanToDate(repoId: string): Promise<number | null> {
    const repo = await prisma.repository.findUnique({
      where: { id: repoId },
      select: { initialScanToDate: true }
    });
    
    return repo?.initialScanToDate ? Number(repo.initialScanToDate) : null;
  }

  /**
   * 更新仓库的初始扫描进度日期
   * @param repoId 仓库ID
   * @param toDate 已扫描到的日期（时间戳）
   */
  async updateInitialScanToDate(repoId: string, toDate: number): Promise<void> {
    await prisma.repository.update({
      where: { id: repoId },
      data: {
        initialScanToDate: BigInt(toDate),
        updatedAt: BigInt(Date.now())
      }
    });
  }

  /**
   * 检查仓库是否已完成初始扫描（扫描到目标日期）
   * @param repoId 仓库ID
   * @param targetDate 目标日期（时间戳），通常是3个月前的日期
   */
  async isInitialScanCompleted(repoId: string, targetDate: number): Promise<boolean> {
    const scanToDate = await this.getInitialScanToDate(repoId);
    if (!scanToDate) return false;
    
    // 如果已扫描到的日期 <= 目标日期，说明已完成
    return scanToDate <= targetDate;
  }
}

