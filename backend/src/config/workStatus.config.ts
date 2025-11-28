/**
 * 工作状态配置
 * 根据每天多仓库合并提交次数判断工作状态
 */
export interface WorkStatusConfig {
  /** 提交次数阈值配置 */
  thresholds: {
    /** 悠闲：小于此值 */
    relaxed: number;
    /** 正常：>= relaxed 且 < normal */
    normal: number;
    /** 忙碌：>= normal 且 < busy */
    busy: number;
    /** 疯狂：>= busy 且 < superCrazy */
    superCrazy: number;
    /** 超级疯狂：>= superCrazy */
  };
  /** 加班时间阈值（小时） */
  overtimeHour: number;
}

/**
 * 工作状态类型
 */
export type WorkStatus = 'relaxed' | 'normal' | 'busy' | 'crazy' | 'overtime' | 'superCrazyOvertime';

/**
 * 工作状态配置（默认值）
 */
export const defaultWorkStatusConfig: WorkStatusConfig = {
  thresholds: {
    relaxed: 6,      // < 6 次：悠闲
    normal: 10,      // 6-10 次：正常
    busy: 15,        // 10-15 次：忙碌
    superCrazy: 20   // 15-20 次：疯狂，>= 20 次：超级疯狂
  },
  overtimeHour: 19 // 19:00 以后算加班
};

/**
 * 根据提交次数和是否有加班记录计算工作状态
 */
export function calculateWorkStatus(
  totalCommits: number,
  hasOvertime: boolean,
  config: WorkStatusConfig = defaultWorkStatusConfig
): WorkStatus {
  // 如果存在加班记录
  if (hasOvertime) {
    // 如果提交次数 >= 20，返回超级疯狂加班
    if (totalCommits >= config.thresholds.superCrazy) {
      return 'superCrazyOvertime';
    }
    // 否则返回普通加班
    return 'overtime';
  }

  // 根据提交次数判断（无加班情况）
  if (totalCommits < config.thresholds.relaxed) {
    return 'relaxed';
  } else if (totalCommits < config.thresholds.normal) {
    return 'normal';
  } else if (totalCommits < config.thresholds.busy) {
    return 'busy';
  } else if (totalCommits < config.thresholds.superCrazy) {
    return 'crazy';
  } else {
    return 'crazy'; // >= 20 次但无加班，仍然是疯狂
  }
}

/**
 * 工作状态显示文本（中文）
 */
export const workStatusLabels: Record<WorkStatus, string> = {
  relaxed: '悠闲',
  normal: '正常',
  busy: '忙碌',
  crazy: '疯狂',
  overtime: '加班',
  superCrazyOvertime: '超级疯狂加班'
};

/**
 * 工作状态标签颜色（Ant Design Tag colors）
 */
export const workStatusColors: Record<WorkStatus, string> = {
  relaxed: 'green',
  normal: 'blue',
  busy: 'orange',
  crazy: 'red',
  overtime: 'red',
  superCrazyOvertime: 'magenta' // 使用紫色/洋红色来突出显示超级疯狂加班
};

