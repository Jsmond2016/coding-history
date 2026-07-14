import type { WorkStatus } from '../types/gitStatistics';

/**
 * 将工作状态转换为数值（用于图表展示）
 * 数值越大表示越忙碌
 * 根据需求文档：
 * - 轻松：1
 * - 正常：2
 * - 忙碌：3
 * - 加班：4
 * - 疯狂：5（包括"疯狂"和"超级疯狂加班"）
 */
export function workStatusToValue(status: WorkStatus): number {
  const statusValues: Record<WorkStatus, number> = {
    relaxed: 1,              // 轻松：1
    normal: 2,               // 正常：2
    busy: 3,                 // 忙碌：3
    overtime: 4,            // 加班：4
    crazy: 5,                // 疯狂：5
    superCrazyOvertime: 5   // 超级疯狂加班：5（与疯狂相同）
  };
  
  return statusValues[status] || 0;
}

/**
 * 将工作状态数值转换为标签文本
 */
export function workStatusValueToLabel(value: number): string {
  const valueLabels: Record<number, string> = {
    1: '轻松',
    2: '正常',
    3: '忙碌',
    4: '加班',
    5: '疯狂'
  };
  
  return valueLabels[value] || '';
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
