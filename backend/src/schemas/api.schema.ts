import { z } from 'zod';

// 查询参数验证
export const CommitsQuerySchema = z.object({
  startDate: z.string().transform(val => parseInt(val)),
  endDate: z.string().transform(val => parseInt(val)),
  repositoryIds: z.string().optional().transform(val => val?.split(',')),
  authorEmails: z.string().optional().transform(val => val?.split(',')),
  page: z.string().default('1').transform(val => parseInt(val)),
  pageSize: z.string().default('20').transform(val => parseInt(val))
});

// 按日期分组查询参数
export const CommitsByDateQuerySchema = z.object({
  startDate: z.string().transform(val => parseInt(val)),
  endDate: z.string().transform(val => parseInt(val)),
  repositoryIds: z.string().optional().transform(val => val?.split(',')),
  authorEmails: z.string().optional().transform(val => val?.split(',')),
  isOvertime: z.string().optional().transform(val => {
    if (val === undefined || val === '') return undefined;
    return val === 'true';
  })
});

const MAX_SCAN_RANGE_MS = 186 * 24 * 60 * 60 * 1000; // 与任务自定义范围一致，约 6 个月

// 手动扫描：须带页面筛选的日期区间（毫秒，建议 startOf/endOf('day')）；可选限定仓库
export const ScanRequestSchema = z
  .object({
    startDate: z.number().int().positive(),
    endDate: z.number().int().positive(),
    repositoryIds: z.array(z.string()).optional()
  })
  .refine((d) => d.startDate < d.endDate, {
    message: '开始时间必须早于结束时间',
    path: ['endDate']
  })
  .refine((d) => d.endDate - d.startDate <= MAX_SCAN_RANGE_MS, {
    message: '扫描日期跨度不能超过约 6 个月（186 天）',
    path: ['endDate']
  });

// 统计数据查询参数（与提交记录相同）
export const StatisticsQuerySchema = CommitsQuerySchema;

// 日志查询参数
export const LogsQuerySchema = z.object({
  startTime: z.string().optional().transform(val => val ? parseInt(val) : undefined),
  endTime: z.string().optional().transform(val => val ? parseInt(val) : undefined),
  page: z.string().default('1').transform(val => parseInt(val)),
  pageSize: z.string().default('20').transform(val => parseInt(val)),
  type: z.string().optional(), // 服务器日志类型：start, stop, error
  status: z.string().optional(), // 定时任务状态：success, failed
  statusCode: z.string().optional().transform(val => val ? parseInt(val) : undefined), // 请求状态码
  module: z.string().optional() // 请求模块名称：repositories, commits, logs, tasks, config 等
});

// 创建扫描任务参数验证
export const CreateScanTaskSchema = z.object({
  name: z.string().min(1, '任务名称不能为空'),
  description: z.string().optional(),
  taskType: z.enum(['manual', 'scheduled'], {
    errorMap: () => ({ message: '任务类型必须是 manual 或 scheduled' })
  }),
  scanRangeType: z.enum(['1day', '3days', '7days', '2weeks', '1month', '3months', '6months', 'custom'], {
    errorMap: () => ({ message: '扫描范围类型无效' })
  }),
  startDate: z.number().optional(),
  endDate: z.number().optional(),
  cronExpression: z.string().optional(),
  repositoryIds: z.array(z.string()).optional(),
  enabled: z.boolean().optional().default(true)
});

// 更新扫描任务参数验证
export const UpdateScanTaskSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  taskType: z.enum(['manual', 'scheduled']).optional(),
  scanRangeType: z.enum(['1day', '3days', '7days', '2weeks', '1month', '3months', '6months', 'custom']).optional(),
  startDate: z.number().optional(),
  endDate: z.number().optional(),
  cronExpression: z.string().optional(),
  repositoryIds: z.array(z.string()).optional(),
  enabled: z.boolean().optional()
});

// 触发任务参数验证
export const TriggerTaskSchema = z.object({
  repositoryIds: z.array(z.string()).optional()
});

export type CommitsQuery = z.infer<typeof CommitsQuerySchema>;
export type CommitsByDateQuery = z.infer<typeof CommitsByDateQuerySchema>;
export type ScanRequest = z.infer<typeof ScanRequestSchema>;
export type StatisticsQuery = z.infer<typeof StatisticsQuerySchema>;
export type LogsQuery = z.infer<typeof LogsQuerySchema>;
export type CreateScanTask = z.infer<typeof CreateScanTaskSchema>;
export type UpdateScanTask = z.infer<typeof UpdateScanTaskSchema>;
export type TriggerTask = z.infer<typeof TriggerTaskSchema>;


