import { z } from 'zod';

export const RepositoryConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  enabled: z.boolean()
});

export const ConfigSchema = z.object({
  repositories: z.array(RepositoryConfigSchema),
  author: z.object({
    name: z.string(),
    email: z.string().email()
  }),
  scanInterval: z.string()
});

export type RepositoryConfig = z.infer<typeof RepositoryConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

