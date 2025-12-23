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

// 扫描请求验证
export const ScanRequestSchema = z.object({
  repositoryIds: z.array(z.string()).optional()
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
  statusCode: z.string().optional().transform(val => val ? parseInt(val) : undefined) // 请求状态码
});

export type CommitsQuery = z.infer<typeof CommitsQuerySchema>;
export type CommitsByDateQuery = z.infer<typeof CommitsByDateQuerySchema>;
export type ScanRequest = z.infer<typeof ScanRequestSchema>;
export type StatisticsQuery = z.infer<typeof StatisticsQuerySchema>;
export type LogsQuery = z.infer<typeof LogsQuerySchema>;


