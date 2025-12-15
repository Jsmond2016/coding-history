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
}

export class GitScanService {
  private git: SimpleGit;

  constructor(private repoPath: string) {
    this.git = simpleGit(repoPath);
  }

  /**
   * 扫描仓库提交记录
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

      // 构建 log 选项
      const logOptions: any = {};

      if (fromDate) {
        // 使用 --since 参数指定起始日期
        logOptions['--since'] = fromDate.toISOString();
      }

      if (toDate) {
        // 使用 --until 参数指定结束日期
        logOptions['--until'] = toDate.toISOString();
      }

      if (authorEmails && authorEmails.length > 0) {
        // simple-git 不支持在单个 --author 参数中使用正则表达式
        // 需要使用 --perl-regexp 选项来启用 Perl 正则表达式
        const authorPattern = authorEmails.map(email =>
          email.replace(/[.*+?^${}()[\]\\]/g, '\\$&')
        ).join('|');
        logOptions['--perl-regexp'] = null;  // 启用 Perl 正则表达式
        logOptions['--author'] = authorPattern;
        logger.info(`Using author pattern with perl-regexp: ${authorPattern}`);
      }

      // 获取提交日志
      const logs = await this.git.log(logOptions);

      logger.info(`Found ${logs.all.length} commits in ${this.repoPath}`);

      // 使用 ramda 处理提交数据
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
              deletions: diff.deletions
            };
          } catch (error) {
            // 第一个提交没有父提交，使用默认值
            logger.warn(`Failed to get diff for commit ${commit.hash}: ${error}`);
            return {
              hash: commit.hash,
              message: commit.message,
              date: new Date(commit.date).getTime(),
              authorName: commit.author_name,
              authorEmail: commit.author_email,
              filesChanged: 0,
              insertions: 0,
              deletions: 0
            };
          }
        }, logs.all)
      );

      return commits;
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

