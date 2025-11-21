import { z } from 'zod';

// 查询参数验证
export const CommitsQuerySchema = z.object({
  startDate: z.string().transform(val => parseInt(val)),
  endDate: z.string().transform(val => parseInt(val)),
  repositoryIds: z.string().optional().transform(val => val?.split(',')),
  page: z.string().default('1').transform(val => parseInt(val)),
  pageSize: z.string().default('20').transform(val => parseInt(val))
});

// 扫描请求验证
export const ScanRequestSchema = z.object({
  repositoryIds: z.array(z.string()).optional()
});

// 统计数据查询参数（与提交记录相同）
export const StatisticsQuerySchema = CommitsQuerySchema;

export type CommitsQuery = z.infer<typeof CommitsQuerySchema>;
export type ScanRequest = z.infer<typeof ScanRequestSchema>;
export type StatisticsQuery = z.infer<typeof StatisticsQuerySchema>;

