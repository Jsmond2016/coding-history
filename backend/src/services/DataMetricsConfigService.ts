import { prisma } from '../db/client.js';
import { defaultWorkStatusConfig, workStatusLabels, workStatusColors, type WorkStatusConfig, type WorkStatus } from '../config/workStatus.config.js';
import { cacheService } from './CacheService.js';

export interface DataMetricsConfig {
  id: number;
  thresholds: WorkStatusConfig['thresholds'];
  overtimeHour: number;
  labels: Record<WorkStatus, string>;
  colors: Record<WorkStatus, string>;
  createdAt: number;
  updatedAt: number;
}

export class DataMetricsConfigService {
  /**
   * 获取默认配置
   */
  getDefaultConfig(): DataMetricsConfig {
    return {
      id: 0,
      thresholds: defaultWorkStatusConfig.thresholds,
      overtimeHour: defaultWorkStatusConfig.overtimeHour,
      labels: workStatusLabels,
      colors: workStatusColors,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  /**
   * 获取当前数据指标配置（如果没有则返回默认值）
   */
  async getConfig(): Promise<DataMetricsConfig> {
    const config = await prisma.dataMetricsConfig.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    if (!config) {
      return this.getDefaultConfig();
    }

    return {
      id: config.id,
      thresholds: JSON.parse(config.thresholds),
      overtimeHour: config.overtimeHour,
      labels: JSON.parse(config.labels),
      colors: JSON.parse(config.colors),
      createdAt: Number(config.createdAt),
      updatedAt: Number(config.updatedAt)
    };
  }

  /**
   * 更新数据指标配置
   */
  async updateConfig(config: {
    thresholds: WorkStatusConfig['thresholds'];
    overtimeHour: number;
    labels: Record<WorkStatus, string>;
    colors: Record<WorkStatus, string>;
  }): Promise<DataMetricsConfig> {
    const now = BigInt(Date.now());

    // 验证阈值是否递增
    const { thresholds } = config;
    if (
      thresholds.relaxed >= thresholds.normal ||
      thresholds.normal >= thresholds.busy ||
      thresholds.busy >= thresholds.superCrazy
    ) {
      throw new Error('阈值必须递增：relaxed < normal < busy < superCrazy');
    }

    // 验证加班时间阈值
    if (config.overtimeHour < 0 || config.overtimeHour > 23) {
      throw new Error('加班时间阈值必须在 0-23 之间');
    }

    // 验证颜色值（Ant Design Tag 支持的颜色）
    const validColors = ['default', 'processing', 'success', 'error', 'warning', 'magenta', 'red', 'volcano', 'orange', 'gold', 'lime', 'green', 'cyan', 'blue', 'geekblue', 'purple'];
    for (const [status, color] of Object.entries(config.colors)) {
      if (!validColors.includes(color)) {
        throw new Error(`无效的颜色值: ${color}，状态: ${status}`);
      }
    }

    // 检查是否存在配置
    const existing = await prisma.dataMetricsConfig.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    if (existing) {
      // 更新现有配置
      const updated = await prisma.dataMetricsConfig.update({
        where: { id: existing.id },
        data: {
          thresholds: JSON.stringify(config.thresholds),
          overtimeHour: config.overtimeHour,
          labels: JSON.stringify(config.labels),
          colors: JSON.stringify(config.colors),
          updatedAt: now
        }
      });

      await cacheService.invalidate('metrics');
      await cacheService.invalidate('commits');
      return {
        id: updated.id,
        thresholds: config.thresholds,
        overtimeHour: config.overtimeHour,
        labels: config.labels,
        colors: config.colors,
        createdAt: Number(updated.createdAt),
        updatedAt: Number(updated.updatedAt)
      };
    } else {
      // 创建新配置
      const created = await prisma.dataMetricsConfig.create({
        data: {
          thresholds: JSON.stringify(config.thresholds),
          overtimeHour: config.overtimeHour,
          labels: JSON.stringify(config.labels),
          colors: JSON.stringify(config.colors),
          createdAt: now,
          updatedAt: now
        }
      });

      await cacheService.invalidate('metrics');
      await cacheService.invalidate('commits');
      return {
        id: created.id,
        thresholds: config.thresholds,
        overtimeHour: config.overtimeHour,
        labels: config.labels,
        colors: config.colors,
        createdAt: Number(created.createdAt),
        updatedAt: Number(created.updatedAt)
      };
    }
  }

  /**
   * 初始化默认配置（如果不存在）
   */
  async initDefaultConfig(): Promise<void> {
    const existing = await prisma.dataMetricsConfig.findFirst();
    if (existing) {
      return; // 已存在配置，不需要初始化
    }

    const defaultConfig = this.getDefaultConfig();
    await this.updateConfig({
      thresholds: defaultConfig.thresholds,
      overtimeHour: defaultConfig.overtimeHour,
      labels: defaultConfig.labels,
      colors: defaultConfig.colors
    });
  }
}
