import { prisma } from '../db/client.js';

export interface RepositoryConfig {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  authors: AuthorConfig[];
  ignoredBranches: string[];
  lastScanTime: number | null;
  totalCommits: number;
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
  /**
   * 获取仓库完整配置（包括作者、忽略分支）
   */
  async getRepositoryConfig(repoId: string): Promise<RepositoryConfig | null> {
    const repo = await prisma.repository.findUnique({
      where: { id: repoId },
      include: {
        authors: {
          orderBy: { createdAt: 'asc' }
        },
        ignoredBranches: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!repo) return null;

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
      ignoredBranches: repo.ignoredBranches.map(b => b.branchName),
      lastScanTime: repo.lastScanTime ? Number(repo.lastScanTime) : null,
      totalCommits: repo.totalCommits,
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
        },
        ignoredBranches: {
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { name: 'asc' }
    });

    return repos.map(repo => ({
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
      ignoredBranches: repo.ignoredBranches.map(b => b.branchName),
      lastScanTime: repo.lastScanTime ? Number(repo.lastScanTime) : null,
      totalCommits: repo.totalCommits,
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
   * 获取仓库的忽略分支列表
   */
  async getIgnoredBranchesByRepoId(repoId: string): Promise<string[]> {
    const branches = await prisma.ignoredBranch.findMany({
      where: { repoId },
      orderBy: { createdAt: 'asc' }
    });

    return branches.map(b => b.branchName);
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

  /**
   * 获取所有仓库的忽略分支列表（合并去重）
   */
  async getAllIgnoredBranches(): Promise<string[]> {
    const branches = await prisma.ignoredBranch.findMany({
      select: { branchName: true }
    });

    // 去重
    return Array.from(new Set(branches.map(b => b.branchName)));
  }
}

