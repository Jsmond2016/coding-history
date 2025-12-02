import type { WorkStatus } from '../../types/gitStatistics';

/**
 * 将工作状态转换为数值（用于图表展示）
 * 数值越大表示越忙碌
 */
export function workStatusToValue(status: WorkStatus): number {
  const statusValues: Record<WorkStatus, number> = {
    relaxed: 1,              // 轻松：1
    normal: 2,                // 正常：2
    busy: 3,                  // 忙碌：3
    crazy: 4,                 // 疯狂：4
    overtime: 3.5,            // 加班：3.5（介于忙碌和疯狂之间）
    superCrazyOvertime: 5     // 超级疯狂加班：5（最高）
  };
  
  return statusValues[status] || 0;
}

/**
 * 判断是否为轻松状态
 */
export function isRelaxedStatus(status: WorkStatus): boolean {
  return status === 'relaxed';
}

/**
 * 判断是否为忙碌状态（包括忙碌、疯狂、加班、超级疯狂加班）
 */
export function isBusyStatus(status: WorkStatus): boolean {
  return ['busy', 'crazy', 'overtime', 'superCrazyOvertime'].includes(status);
}

/**
 * 判断是否为加班状态
 */
export function isOvertimeStatus(status: WorkStatus): boolean {
  return ['overtime', 'superCrazyOvertime'].includes(status);
}

