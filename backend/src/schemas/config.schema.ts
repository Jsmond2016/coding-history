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

export const ConfigSchema = z.object({
  repositories: z.array(RepositoryConfigSchema),
  authors: z.array(AuthorConfigSchema).min(1, '至少需要配置一个作者'),
  scanInterval: z.string()
});

export type RepositoryConfig = z.infer<typeof RepositoryConfigSchema>;
export type AuthorConfig = z.infer<typeof AuthorConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;


