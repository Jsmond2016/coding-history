/**
 * 数据指标配置初始化脚本
 * 将默认配置写入数据库
 */

import 'dotenv/config';
import { DataMetricsConfigService } from '../services/DataMetricsConfigService.js';
import { logger } from '../config/logger.js';

/**
 * 初始化数据指标配置
 */
async function initDataMetricsConfig() {
  try {
    logger.info('[数据指标配置初始化] 开始初始化...');

    const configService = new DataMetricsConfigService();
    await configService.initDefaultConfig();

    const config = await configService.getConfig();
    logger.info('[数据指标配置初始化] 配置初始化成功');
    logger.info(`[数据指标配置初始化] 阈值配置:`, config.thresholds);
    logger.info(`[数据指标配置初始化] 加班时间阈值: ${config.overtimeHour}:00`);
    logger.info(`[数据指标配置初始化] 标签配置:`, config.labels);
    logger.info(`[数据指标配置初始化] 颜色配置:`, config.colors);

    logger.info('[数据指标配置初始化] 脚本执行完成');
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error({
      msg: '[数据指标配置初始化] 脚本执行失败',
      error: errorMessage,
      stack: errorStack
    });
    process.exit(1);
  }
}

// 执行初始化
initDataMetricsConfig();


