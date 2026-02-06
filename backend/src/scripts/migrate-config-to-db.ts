/**
 * 配置迁移脚本
 * 若存在 config/repositories.json，则将其中的仓库、作者、忽略分支、定时任务迁移到数据库；
 * 若文件不存在则跳过，可通过前端「配置管理」添加仓库。
 */

import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { prisma } from '../db/client.js';
import { ScanTaskService } from '../services/ScanTaskService.js';
import { logger } from '../config/logger.js';
import type { Config } from '../schemas/config.schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, '../../config/repositories.json');

/**
 * 加载配置文件（文件不存在时返回 null）
 */
function loadConfig(): Config | null {
  if (!existsSync(CONFIG_PATH)) {
    return null;
  }
  try {
    const configContent = readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(configContent) as Config;
  } catch (error) {
    logger.error('Failed to load config file:', error);
    throw error;
  }
}

/**
 * 规范化调度配置
 */
function normalizeScheduleConfig(scanInterval: string | Array<{ cron: string; description?: string }>): Array<{ cron: string; description?: string }> {
  if (typeof scanInterval === 'string') {
    return [{ cron: scanInterval }];
  }
  return scanInterval;
}

/**
 * 迁移配置到数据库
 */
async function migrateConfigToDb() {
  try {
    logger.info('[配置迁移] 开始迁移配置到数据库...');

    const config = loadConfig();
    if (!config) {
      logger.info('[配置迁移] 配置文件 config/repositories.json 不存在，跳过迁移。可通过前端「配置管理」添加仓库。');
      return;
    }

    const taskService = new ScanTaskService();
    const now = BigInt(Date.now());

    // 1. 迁移仓库配置
    logger.info(`[配置迁移] 迁移 ${config.repositories.length} 个仓库配置...`);
    for (const repo of config.repositories) {
      // 创建或更新仓库
      await prisma.repository.upsert({
        where: { id: repo.id },
        update: {
          name: repo.name,
          path: repo.path,
          enabled: repo.enabled !== undefined ? repo.enabled : true,
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

      // 迁移作者配置（每个仓库都使用全局作者配置）
      if (config.authors && config.authors.length > 0) {
        logger.info(`[配置迁移] 为仓库 ${repo.name} 迁移 ${config.authors.length} 个作者...`);
        for (const author of config.authors) {
          try {
            await prisma.author.upsert({
              where: {
                repoId_email: {
                  repoId: repo.id,
                  email: author.email
                }
              },
              update: {
                name: author.name,
                isDefault: author.isDefault || false,
                updatedAt: now
              },
              create: {
                repoId: repo.id,
                name: author.name,
                email: author.email,
                isDefault: author.isDefault || false,
                createdAt: now,
                updatedAt: now
              }
            });
          } catch (error) {
            logger.warn(`[配置迁移] 跳过重复作者 ${author.email} for ${repo.name}`);
          }
        }
      }

      // 迁移忽略分支配置（每个仓库都使用全局忽略分支配置）
      if (config.ignoredBranches && config.ignoredBranches.length > 0) {
        logger.info(`[配置迁移] 为仓库 ${repo.name} 迁移 ${config.ignoredBranches.length} 个忽略分支...`);
        for (const branchName of config.ignoredBranches) {
          try {
            await prisma.ignoredBranch.upsert({
              where: {
                repoId_branchName: {
                  repoId: repo.id,
                  branchName: branchName
                }
              },
              update: {},
              create: {
                repoId: repo.id,
                branchName: branchName,
                createdAt: now
              }
            });
          } catch (error) {
            logger.warn(`[配置迁移] 跳过重复分支 ${branchName} for ${repo.name}`);
          }
        }
      }
    }

    // 2. 迁移定时任务配置
    if (config.scanInterval) {
      const scheduleTimes = normalizeScheduleConfig(config.scanInterval);
      logger.info(`[配置迁移] 迁移 ${scheduleTimes.length} 个定时任务配置...`);

      for (let i = 0; i < scheduleTimes.length; i++) {
        const schedule = scheduleTimes[i];
        const taskName = schedule.description || `定时任务 ${i + 1}`;
        
        // 检查是否已存在同名任务
        const existingTasks = await prisma.scanTask.findMany({
          where: {
            name: taskName,
            taskType: 'scheduled'
          }
        });

        if (existingTasks.length === 0) {
          await taskService.createTask({
            name: taskName,
            description: schedule.description,
            taskType: 'scheduled',
            scanRangeType: '2weeks', // 默认2周
            cronExpression: schedule.cron,
            repositoryIds: undefined, // 所有仓库
            enabled: true
          });
          logger.info(`[配置迁移] 创建定时任务: ${taskName} (${schedule.cron})`);
        } else {
          logger.info(`[配置迁移] 定时任务 ${taskName} 已存在，跳过`);
        }
      }
    }

    logger.info('[配置迁移] 配置迁移完成！');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error({
      msg: '[配置迁移] 迁移失败',
      error: errorMessage,
      stack: errorStack
    });
    throw error;
  }
}

// 执行迁移
migrateConfigToDb()
  .then(() => {
    logger.info('[配置迁移] 脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('[配置迁移] 脚本执行失败:', error);
    process.exit(1);
  });

