import simpleGit, { SimpleGit } from 'simple-git';
import * as R from 'ramda';
import { logger } from '../config/logger.js';

/** 提交时间 date 使用 author date，用于展示与统计的真实提交时间 */
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
   * 全图单次扫描：`git log --all` 跨所有 ref，每个 commit hash 至多出现一次（含 merge commit，不设 --no-merges）。
   * 不按分支写 `branch` 字段，入库多为 `branch=null`，与时间窗内多仓库汇总口径一致。
   */
  async scanRepositoryFlat(fromDate?: Date, toDate?: Date, authorEmails?: string[]): Promise<ScannedCommit[]> {
    const isRepo = await this.git.checkIsRepo();
    if (!isRepo) {
      throw new Error(`${this.repoPath} is not a valid git repository`);
    }

    const logOptions: string[] = ['--all'];
    if (fromDate) {
      logOptions.push('--since', fromDate.toISOString());
    }
    if (toDate) {
      logOptions.push('--until', toDate.toISOString());
    }
    if (authorEmails && authorEmails.length > 0) {
      const authorPattern = authorEmails
        .map(email => email.replace(/[.*+?^${}()[\]\\]/g, '\\$&'))
        .join('|');
      logOptions.push('--perl-regexp', '--author', authorPattern);
    }

    try {
      const logs = await this.git.log(logOptions);
      const commits = await Promise.all(
        R.map((commit) => this.mapLogEntryToScanned(commit, undefined), logs.all)
      );
      logger.info(`Flat scan (--all): ${commits.length} unique commits in ${this.repoPath}`);
      return commits;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error({
        msg: `Error flat-scanning repository ${this.repoPath}`,
        error: errorMessage,
        stack: errorStack,
        repoPath: this.repoPath
      });
      throw error;
    }
  }

  /**
   * 扫描仓库提交记录（按分支分别扫描；先扫未上线分支再扫 release，按 commitHash 去重且优先保留未上线分支名）
   * 保留作兼容；日常入库请使用 {@link scanRepositoryFlat}（由 {@link incrementalScan} 调用）。
   * @param fromDate 起始日期，用于增量扫描
   * @param toDate 结束日期，可选
   * @param authorEmails 作者邮箱数组，用于过滤（支持多个作者）
   */
  async scanRepository(fromDate?: Date, toDate?: Date, authorEmails?: string[]): Promise<ScannedCommit[]> {
    try {
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        throw new Error(`${this.repoPath} is not a valid git repository`);
      }

      const { branchesToScan } = await this.getBranchesToScan();
      logger.info(`Found ${branchesToScan.length} branches to scan in ${this.repoPath}`);

      const allCommits: ScannedCommit[] = [];

      for (const branchName of branchesToScan) {
        try {
          const branchCommits = await this.scanBranch(branchName, fromDate, toDate, authorEmails);
          allCommits.push(...branchCommits);
          logger.debug(`Scanned ${branchCommits.length} commits from branch ${branchName}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn(`Failed to scan branch ${branchName}: ${errorMessage}`);
        }
      }

      // 按 commitHash 去重，同一 hash 只保留一条；优先保留带「未上线分支」名的条（branch 有值且非 release）
      const uniqueCommitsMap = new Map<string, ScannedCommit>();
      for (const commit of allCommits) {
        const key = commit.hash;
        const existing = uniqueCommitsMap.get(key);
        const currentIsUnreleased = commit.branch && commit.branch !== 'release' && commit.branch !== 'master';
        if (!existing) {
          uniqueCommitsMap.set(key, commit);
        } else if (currentIsUnreleased && (!existing.branch || existing.branch === 'release' || existing.branch === 'master')) {
          uniqueCommitsMap.set(key, commit);
        }
      }

      const uniqueCommits = Array.from(uniqueCommitsMap.values());
      logger.info(`Found ${uniqueCommits.length} unique commits (across ${branchesToScan.length} branches)`);

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
   * 获取待扫描分支列表：release 与 master 同时存在时以 release 为主（不扫 master）；
   * 只有 master 没有 release 时以 master 为主。非主分支若 tip 已在主分支中则跳过。顺序：未上线分支先，主分支最后。
   */
  private async getBranchesToScan(): Promise<{ releaseRef: string | null; branchesToScan: string[] }> {
    const raw = await this.getAllBranches();
    const releaseRef = raw.find(b => this.normalizeBranchNameForCompare(b) === 'release') ?? null;
    const masterRef = raw.find(b => this.normalizeBranchNameForCompare(b) === 'master') ?? null;

    const hasRelease = !!releaseRef;
    const hasMaster = !!masterRef;
    let list = raw;
    if (hasRelease && hasMaster) {
      list = raw.filter(b => this.normalizeBranchNameForCompare(b) !== 'master');
    }
    const mainRef = releaseRef ?? masterRef;
    const others = list.filter(b => b !== mainRef);

    const unreleased: string[] = [];
    for (const branch of others) {
      if (!mainRef) {
        unreleased.push(branch);
        continue;
      }
      try {
        const tip = await this.git.revparse([branch]);
        if (!tip || !tip.trim()) continue;
        const isAncestor = await this.git.raw(['merge-base', '--is-ancestor', tip.trim(), mainRef]).then(
          () => true,
          () => false
        );
        if (!isAncestor) {
          unreleased.push(branch);
        }
      } catch {
        unreleased.push(branch);
      }
    }

    const branchesToScan = [...unreleased];
    if (mainRef) branchesToScan.push(mainRef);
    return { releaseRef, branchesToScan };
  }

  /** 用于比较的分支名：去掉 origin/ 前缀，便于判断 release/master */
  private normalizeBranchNameForCompare(branchName: string): string {
    return branchName.replace(/^origin\//, '').trim();
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

      for (const branch of localBranches.all) {
        if (!branch.includes('HEAD') && !branch.includes('->')) {
          branches.add(branch);
        }
      }
      for (const branch of remoteBranches.all) {
        if (!branch.includes('HEAD') && !branch.includes('->')) {
          const normalized = branch.replace(/^remotes\//, '');
          branches.add(normalized);
        }
      }
      return Array.from(branches);
    } catch (error) {
      logger.warn(`Failed to get all branches: ${error}`);
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

      const commits = await Promise.all(
        R.map((commit) => this.mapLogEntryToScanned(commit, storageBranchName || undefined), logs.all)
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
   * 将 simple-git 单条 log 转为 ScannedCommit（含 diff 统计；根提交无父时 stats 为 0）
   */
  private async mapLogEntryToScanned(
    commit: { hash: string; message: string; date: string; author_name: string; author_email: string },
    branch: string | undefined
  ): Promise<ScannedCommit> {
    try {
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
        branch
      };
    } catch (error) {
      logger.debug(`Failed to get diff for commit ${commit.hash}: ${error}`);
      return {
        hash: commit.hash,
        message: commit.message,
        date: new Date(commit.date).getTime(),
        authorName: commit.author_name,
        authorEmail: commit.author_email,
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
        branch
      };
    }
  }

  /**
   * 增量扫描：只扫描指定日期之后的提交（全图 `--all`，含 merge）
   * @param lastScanDate 起始日期
   * @param authorEmails 作者邮箱数组，可选（支持多个作者）
   * @param toDate 结束日期，可选
   */
  async incrementalScan(lastScanDate: Date, authorEmails?: string[], toDate?: Date): Promise<ScannedCommit[]> {
    logger.info(`Incremental flat scan from ${lastScanDate.toISOString()}${toDate ? ` to ${toDate.toISOString()}` : ''}`);
    return this.scanRepositoryFlat(lastScanDate, toDate, authorEmails);
  }
}
