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
   * @param authorEmail 作者邮箱，用于过滤
   */
  async scanRepository(fromDate?: Date, authorEmail?: string): Promise<ScannedCommit[]> {
    try {
      // 检查是否为有效的 Git 仓库
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        throw new Error(`${this.repoPath} is not a valid git repository`);
      }

      // 构建 log 选项
      const logOptions: any = {
        to: 'HEAD'
      };

      if (fromDate) {
        logOptions.from = fromDate.toISOString();
      }

      if (authorEmail) {
        logOptions['--author'] = authorEmail;
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
   */
  async incrementalScan(lastScanDate: Date, authorEmail?: string): Promise<ScannedCommit[]> {
    logger.info(`Incremental scan from ${lastScanDate.toISOString()}`);
    return this.scanRepository(lastScanDate, authorEmail);
  }
}

