import { prisma } from '../db/client.js';
import { CommitService } from './CommitService.js';

export interface CommitDateRange {
  earliest: number;  // 最早提交时间（毫秒）
  latest: number;    // 最晚提交时间（毫秒）
}

export interface RepositoryConfig {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  authors: AuthorConfig[];
  lastScanTime: number | null;
  totalCommits: number;
  commitDateRange: CommitDateRange | null;  // 提交时间范围，无记录时为 null
  createdAt: number;
  updatedAt: number;
}

export interface AuthorConfig {
  id: number;
  name: string;
  email: string;
  isDefault: boolean;
}

export class ConfigService {
  private commitService: CommitService;

  constructor() {
    this.commitService = new CommitService();
  }

  /**
   * 获取仓库完整配置（含作者）
   */
  async getRepositoryConfig(repoId: string): Promise<RepositoryConfig | null> {
    const repo = await prisma.repository.findUnique({
      where: { id: repoId },
      include: {
        authors: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!repo) return null;

    const commitDateRange = await this.commitService.getCommitDateRangeForRepo(repoId);

    return {
      id: repo.id,
      name: repo.name,
      path: repo.path,
      enabled: repo.enabled,
      authors: repo.authors.map(a => ({
        id: a.id,
        name: a.name,
        email: a.email,
        isDefault: a.isDefault
      })),
      lastScanTime: repo.lastScanTime ? Number(repo.lastScanTime) : null,
      totalCommits: repo.totalCommits,
      commitDateRange,
      createdAt: Number(repo.createdAt),
      updatedAt: Number(repo.updatedAt)
    };
  }

  /**
   * 获取所有仓库配置
   */
  async getAllRepositoriesConfig(): Promise<RepositoryConfig[]> {
    const repos = await prisma.repository.findMany({
      include: {
        authors: {
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { name: 'asc' }
    });

    // 并行获取所有仓库的提交时间范围
    const commitDateRanges = await Promise.all(
      repos.map(repo => this.commitService.getCommitDateRangeForRepo(repo.id))
    );

    return repos.map((repo, index) => ({
      id: repo.id,
      name: repo.name,
      path: repo.path,
      enabled: repo.enabled,
      authors: repo.authors.map(a => ({
        id: a.id,
        name: a.name,
        email: a.email,
        isDefault: a.isDefault
      })),
      lastScanTime: repo.lastScanTime ? Number(repo.lastScanTime) : null,
      totalCommits: repo.totalCommits,
      commitDateRange: commitDateRanges[index],
      createdAt: Number(repo.createdAt),
      updatedAt: Number(repo.updatedAt)
    }));
  }

  /**
   * 获取仓库的作者列表
   */
  async getAuthorsByRepoId(repoId: string): Promise<AuthorConfig[]> {
    const authors = await prisma.author.findMany({
      where: { repoId },
      orderBy: { createdAt: 'asc' }
    });

    return authors.map(a => ({
      id: a.id,
      name: a.name,
      email: a.email,
      isDefault: a.isDefault
    }));
  }

  /**
   * 获取所有启用的仓库
   */
  async getEnabledRepositories(): Promise<Array<{ id: string; name: string; path: string; enabled: boolean }>> {
    const repos = await prisma.repository.findMany({
      where: { enabled: true },
      select: {
        id: true,
        name: true,
        path: true,
        enabled: true
      },
      orderBy: { name: 'asc' }
    });

    return repos;
  }

  /**
   * 获取所有仓库的作者邮箱（用于扫描时过滤）
   * 如果仓库没有配置作者，返回空数组
   */
  async getAllAuthorEmails(): Promise<string[]> {
    const authors = await prisma.author.findMany({
      select: { email: true }
    });

    // 去重
    return Array.from(new Set(authors.map(a => a.email)));
  }

  /**
   * 获取指定仓库的作者邮箱列表
   */
  async getAuthorEmailsByRepoId(repoId: string): Promise<string[]> {
    const authors = await prisma.author.findMany({
      where: { repoId },
      select: { email: true }
    });

    return authors.map(a => a.email);
  }

}

