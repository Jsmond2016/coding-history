import { z } from 'zod';

export const RepositoryConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  enabled: z.boolean()
});

export const AuthorConfigSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  isDefault: z.boolean().optional().default(false)
});

export const ScanScheduleSchema = z.object({
  cron: z.string(), // Cron 表达式
  description: z.string().optional() // 可选的描述信息
});

export const ConfigSchema = z.object({
  repositories: z.array(RepositoryConfigSchema),
  authors: z.array(AuthorConfigSchema).min(1, '至少需要配置一个作者'),
  scanInterval: z.union([
    z.string(), // 向后兼容：单个字符串
    z.array(ScanScheduleSchema) // 新的数组格式
  ]),
  ignoredBranches: z.array(z.string()).optional().default(['develop', 'release', 'uat']) // 忽略的分支列表，不参与汇总统计
});

export type RepositoryConfig = z.infer<typeof RepositoryConfigSchema>;
export type AuthorConfig = z.infer<typeof AuthorConfigSchema>;
export type ScanSchedule = z.infer<typeof ScanScheduleSchema>;
export type Config = z.infer<typeof ConfigSchema>;


