import fs from 'node:fs';
import path from 'node:path';
import cron from 'node-cron';
import { prisma } from '../db/client.js';
import { logger } from '../config/logger.js';

const DEFAULT_BACKUP_DIR = process.env.DB_BACKUP_DIR || path.join(process.cwd(), 'db-backup');
const DEFAULT_BACKUP_CRON = '0 19 * * 5';

export class AppSettingService {
  async getSetting(key: string): Promise<string | null> {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await prisma.appSetting.upsert({
      where: { key },
      update: { value, updatedAt: BigInt(Date.now()) },
      create: { key, value, updatedAt: BigInt(Date.now()) },
    });
  }

  /**
   * 获取备份目录：优先 DB 配置，fallback env var，再 fallback cwd/db-backup
   */
  async getBackupDir(): Promise<string> {
    const dbValue = await this.getSetting('backup_dir');
    return dbValue?.trim() || DEFAULT_BACKUP_DIR;
  }

  /**
   * 获取备份 cron 表达式：优先 DB 配置，fallback env var，再 fallback 默认值
   */
  async getBackupCron(): Promise<string | null> {
    const dbValue = await this.getSetting('backup_cron');
    if (dbValue !== null) {
      const t = dbValue.trim();
      if (t === '' || t === 'false' || t === 'off' || t === '0') return null;
      return t;
    }
    // fallback env var
    const v = process.env.DB_BACKUP_CRON;
    if (v === undefined || v === null) return DEFAULT_BACKUP_CRON;
    const t = v.trim();
    if (t === '' || t === 'false' || t === 'off' || t === '0') return null;
    return t;
  }

  /**
   * 更新备份目录（校验路径可写）
   */
  async setBackupDir(dir: string): Promise<{ success: boolean; error?: string }> {
    const resolved = path.resolve(dir);
    try {
      fs.mkdirSync(resolved, { recursive: true });
      const testFile = path.join(resolved, '.write-test');
      fs.writeFileSync(testFile, '');
      fs.unlinkSync(testFile);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { success: false, error: `目录不可写: ${msg}` };
    }
    await this.setSetting('backup_dir', resolved);
    return { success: true };
  }

  /**
   * 更新备份 cron 表达式（校验格式合法）
   */
  async setBackupCron(cronExpr: string): Promise<{ success: boolean; error?: string }> {
    const t = cronExpr.trim();
    // 允许关闭：空、false、off、0
    if (t === '' || t === 'false' || t === 'off' || t === '0') {
      await this.setSetting('backup_cron', t);
      return { success: true };
    }
    if (!cron.validate(t)) {
      return { success: false, error: 'Cron 表达式格式无效，请使用标准 5 段格式（分 时 日 月 周）' };
    }
    await this.setSetting('backup_cron', t);
    return { success: true };
  }

  /**
   * 启动时初始化默认设置（仅在 key 不存在时插入）
   */
  async initDefaultSettings(): Promise<void> {
    try {
      const existingDir = await prisma.appSetting.findUnique({ where: { key: 'backup_dir' } });
      if (!existingDir) {
        await prisma.appSetting.create({
          data: {
            key: 'backup_dir',
            value: DEFAULT_BACKUP_DIR,
            updatedAt: BigInt(Date.now()),
          },
        });
        logger.info({ msg: '[AppSetting] 已初始化默认备份目录', backupDir: DEFAULT_BACKUP_DIR });
      }

      const existingCron = await prisma.appSetting.findUnique({ where: { key: 'backup_cron' } });
      if (!existingCron) {
        await prisma.appSetting.create({
          data: {
            key: 'backup_cron',
            value: DEFAULT_BACKUP_CRON,
            updatedAt: BigInt(Date.now()),
          },
        });
        logger.info({ msg: '[AppSetting] 已初始化默认备份定时', backupCron: DEFAULT_BACKUP_CRON });
      }
    } catch (error) {
      logger.error({ msg: '[AppSetting] 初始化默认设置失败', error: error instanceof Error ? error.message : String(error) });
    }
  }
}

export const appSettingService = new AppSettingService();
