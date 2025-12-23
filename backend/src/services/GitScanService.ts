import simpleGit, { SimpleGit } from 'simple-git';
import * as R from 'ramda';
import { logger } from '../config/logger.js';

export interface ScannedCommit {
  hash: string;
  message: string;
  date: number;
  authorName: string;
  authorEmail: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  branch?: string; // 提交所在的分支（可选，但按分支扫描时会填充）
}

export class GitScanService {
  private git: SimpleGit;

  constructor(private repoPath: string) {
    this.git = simpleGit(repoPath);
  }

  /**
   * 扫描仓库提交记录（按分支分别扫描，确保多分支提交都能被记录）
   * @param fromDate 起始日期，用于增量扫描
   * @param toDate 结束日期，可选
   * @param authorEmails 作者邮箱数组，用于过滤（支持多个作者）
   */
  async scanRepository(fromDate?: Date, toDate?: Date, authorEmails?: string[]): Promise<ScannedCommit[]> {
    try {
      // 检查是否为有效的 Git 仓库
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        throw new Error(`${this.repoPath} is not a valid git repository`);
      }

      // 获取所有本地和远程分支
      const allBranches = await this.getAllBranches();
      logger.info(`Found ${allBranches.length} branches in ${this.repoPath}`);

      const allCommits: ScannedCommit[] = [];

      // 为每个分支单独扫描提交
      for (const branchName of allBranches) {
        try {
          const branchCommits = await this.scanBranch(branchName, fromDate, toDate, authorEmails);
          allCommits.push(...branchCommits);
          logger.debug(`Scanned ${branchCommits.length} commits from branch ${branchName}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn(`Failed to scan branch ${branchName}: ${errorMessage}`);
          // 继续扫描其他分支，不中断整个流程
        }
      }

      // 去重：同一个 commit hash 在同一个分支中只保留一条记录
      const uniqueCommitsMap = new Map<string, ScannedCommit>();
      for (const commit of allCommits) {
        const key = `${commit.hash}:${commit.branch}`;
        if (!uniqueCommitsMap.has(key)) {
          uniqueCommitsMap.set(key, commit);
        }
      }

      const uniqueCommits = Array.from(uniqueCommitsMap.values());
      logger.info(`Found ${uniqueCommits.length} unique commits (across ${allBranches.length} branches)`);

      return uniqueCommits;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error({
        msg: `Error scanning repository ${this.repoPath}`,
        error: errorMessage,
        stack: errorStack,
        repoPath: this.repoPath
      });
      throw error;
    }
  }

  /**
   * 获取所有分支（本地和远程）
   * 返回格式：本地分支直接返回名称，远程分支返回 origin/branchName 格式
   */
  private async getAllBranches(): Promise<string[]> {
    try {
      const localBranches = await this.git.branchLocal();
      const remoteBranches = await this.git.branch(['-r']);
      
      const branches = new Set<string>();
      
      // 添加本地分支
      for (const branch of localBranches.all) {
        if (!branch.includes('HEAD') && !branch.includes('->')) {
          branches.add(branch);
        }
      }
      
      // 添加远程分支（保留 origin/branchName 格式，以便直接扫描）
      for (const branch of remoteBranches.all) {
        if (!branch.includes('HEAD') && !branch.includes('->')) {
          // 规范化远程分支名称：remotes/origin/feature/xxx -> origin/feature/xxx
          const normalized = branch
            .replace(/^remotes\//, ''); // 只移除 remotes/ 前缀，保留 origin/
          branches.add(normalized);
          
          // 同时添加简化名称（用于显示和存储）
          const simpleName = normalized.replace(/^origin\//, '');
          if (simpleName !== normalized) {
            // 如果简化名称与本地分支不同，也添加（用于存储）
            // 注意：这里不直接添加到 branches Set，因为我们需要用 origin/xxx 格式来扫描
          }
        }
      }
      
      return Array.from(branches);
    } catch (error) {
      logger.warn(`Failed to get all branches: ${error}`);
      // 如果获取分支失败，尝试使用当前分支
      try {
        const currentBranch = await this.git.branch();
        return currentBranch.current ? [currentBranch.current] : [];
      } catch {
        return [];
      }
    }
  }

  /**
   * 扫描单个分支的提交记录
   */
  private async scanBranch(
    branchName: string,
    fromDate?: Date,
    toDate?: Date,
    authorEmails?: string[]
  ): Promise<ScannedCommit[]> {
    // 确定实际的分支名称和存储用的分支名称
    // branchName 可能是 "origin/feature/xxx" 或 "feature/xxx"
    let actualBranchName = branchName; // 用于 git.log() 的分支名称
    let storageBranchName = branchName; // 用于存储到数据库的分支名称
    
    // 如果分支名称以 origin/ 开头，说明是远程分支
    if (branchName.startsWith('origin/')) {
      actualBranchName = branchName; // 直接使用 origin/xxx 格式扫描
      storageBranchName = branchName.replace(/^origin\//, ''); // 存储时去掉 origin/ 前缀
    } else {
      // 本地分支，直接使用
      actualBranchName = branchName;
      storageBranchName = branchName;
    }
    
    try {

      // 构建 log 选项数组
      const logOptions: string[] = [actualBranchName]; // 使用实际的分支名称

      if (fromDate) {
        logOptions.push('--since', fromDate.toISOString());
      }

      if (toDate) {
        logOptions.push('--until', toDate.toISOString());
      }

      if (authorEmails && authorEmails.length > 0) {
        const authorPattern = authorEmails.map(email =>
          email.replace(/[.*+?^${}()[\]\\]/g, '\\$&')
        ).join('|');
        logOptions.push('--perl-regexp');
        logOptions.push('--author', authorPattern);
      }

      // 获取该分支的提交日志
      const logs = await this.git.log(logOptions);

      // 处理提交数据
      const commits = await Promise.all(
        R.map(async (commit) => {
          try {
            // 获取每个提交的 diff 统计
            const diff = await this.git.diffSummary([`${commit.hash}^`, commit.hash]);

            return {
              hash: commit.hash,
              message: commit.message,
              date: new Date(commit.date).getTime(),
              authorName: commit.author_name,
              authorEmail: commit.author_email,
              filesChanged: diff.files.length,
              insertions: diff.insertions,
              deletions: diff.deletions,
              branch: storageBranchName || undefined // 使用存储用的分支名称（去掉 origin/ 前缀）
            };
          } catch (error) {
            // 第一个提交没有父提交，使用默认值
            logger.debug(`Failed to get diff for commit ${commit.hash} in branch ${storageBranchName}: ${error}`);
            
            return {
              hash: commit.hash,
              message: commit.message,
              date: new Date(commit.date).getTime(),
              authorName: commit.author_name,
              authorEmail: commit.author_email,
              filesChanged: 0,
              insertions: 0,
              deletions: 0,
              branch: storageBranchName || undefined // 使用存储用的分支名称（去掉 origin/ 前缀）
            };
          }
        }, logs.all)
      );

      return commits;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // 如果扫描失败，记录警告（使用 warn 级别以便排查问题）
      // 注意：actualBranchName 可能未定义（如果错误发生在初始化之前）
      const actualName = typeof actualBranchName !== 'undefined' ? actualBranchName : branchName;
      logger.warn(`Failed to scan branch ${branchName} (actual: ${actualName}): ${errorMessage}`);
      return [];
    }
  }

  /**
   * 增量扫描：只扫描指定日期之后的提交
   * @param lastScanDate 起始日期
   * @param authorEmails 作者邮箱数组，可选（支持多个作者）
   * @param toDate 结束日期，可选
   */
  async incrementalScan(lastScanDate: Date, authorEmails?: string[], toDate?: Date): Promise<ScannedCommit[]> {
    logger.info(`Incremental scan from ${lastScanDate.toISOString()}${toDate ? ` to ${toDate.toISOString()}` : ''}`);
    return this.scanRepository(lastScanDate, toDate, authorEmails);
  }
}
