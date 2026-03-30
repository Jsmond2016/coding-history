import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { logger } from '../config/logger.js';

/** 默认：每周五 19:00（node-cron：周日=0，周五=5） */
const DEFAULT_BACKUP_CRON = '0 19 * * 5';

const DEFAULT_BACKUP_DIR = '/Users/huangjing/Desktop/MyCode/temp/coding-history-db-backup';

let backupTask: ScheduledTask | null = null;

/**
 * 解析 SQLite 数据库文件绝对路径（与 Prisma adapter 使用的 DATABASE_URL 一致）
 */
export function resolveSqliteDatabasePath(): string {
  const raw = process.env.DATABASE_URL || 'file:../database/coding-history.db';
  const withoutProtocol = raw.replace(/^file:/i, '');
  const normalized = path.normalize(withoutProtocol);
  return path.isAbsolute(normalized)
    ? normalized
    : path.resolve(process.cwd(), normalized);
}

function localDateYmd(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  const d = String(n.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface DatabaseBackupResult {
  success: boolean;
  destPath?: string;
  sourcePath?: string;
  error?: string;
}

/**
 * 将数据库备份到目标目录，文件名 coding-history-backup-{YYYY-MM-DD}.db
 */
export function runDatabaseBackup(): DatabaseBackupResult {
  const backupDir = (process.env.DB_BACKUP_DIR ?? DEFAULT_BACKUP_DIR).trim() || DEFAULT_BACKUP_DIR;
  const sourcePath = resolveSqliteDatabasePath();

  if (!fs.existsSync(sourcePath)) {
    const msg = '源数据库文件不存在';
    logger.warn({ msg: '[DB备份] 源数据库文件不存在，跳过', sourcePath });
    return { success: false, sourcePath, error: msg };
  }

  fs.mkdirSync(backupDir, { recursive: true });

  const dateStr = localDateYmd();
  const destPath = path.join(backupDir, `coding-history-backup-${dateStr}.db`);

  let srcDb: Database.Database | undefined;
  try {
    srcDb = new Database(sourcePath, { readonly: true, fileMustExist: true });
    srcDb.backup(destPath);
    logger.info({
      msg: '[DB备份] 已完成',
      destPath,
      sourcePath
    });
    return { success: true, destPath, sourcePath };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({
      msg: '[DB备份] 失败',
      sourcePath,
      destPath,
      error: errMsg
    });
    return { success: false, destPath, sourcePath, error: errMsg };
  } finally {
    try {
      srcDb?.close();
    } catch {
      /* ignore */
    }
  }
}

function getBackupCronExpression(): string | null {
  const v = process.env.DB_BACKUP_CRON;
  if (v === undefined || v === null) {
    return DEFAULT_BACKUP_CRON;
  }
  const t = v.trim();
  if (t === '' || t === 'false' || t === 'off' || t === '0') {
    return null;
  }
  return t;
}

/**
 * 启动数据库定时备份（仅打日志，不写业务库）
 */
export function startDbBackupScheduler(): void {
  const expr = getBackupCronExpression();
  if (!expr) {
    logger.info('[DB备份] 未启用（DB_BACKUP_CRON 为空、false、off 或 0）');
    return;
  }

  if (!cron.validate(expr)) {
    logger.error({ msg: '[DB备份] Cron 表达式无效，未启动定时备份', expr });
    return;
  }

  if (backupTask) {
    backupTask.stop();
    backupTask = null;
  }

  backupTask = cron.schedule(expr, () => {
    try {
      runDatabaseBackup();
    } catch (error) {
      logger.error({
        msg: '[DB备份] 定时任务回调异常',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const dir = (process.env.DB_BACKUP_DIR ?? DEFAULT_BACKUP_DIR).trim() || DEFAULT_BACKUP_DIR;
  logger.info({
    msg: '[DB备份] 定时任务已启动',
    cron: expr,
    backupDir: dir
  });
}

export function stopDbBackupScheduler(): void {
  if (backupTask) {
    backupTask.stop();
    backupTask = null;
    logger.info('[DB备份] 定时任务已停止');
  }
}
