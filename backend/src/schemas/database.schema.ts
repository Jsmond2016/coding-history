import { z } from 'zod';

export const RepositorySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  last_scan_time: z.number().nullable(),
  total_commits: z.number(),
  created_at: z.number(),
  updated_at: z.number()
});

export const CommitSchema = z.object({
  id: z.number(),
  repo_id: z.string(),
  commit_hash: z.string(),
  author_name: z.string(),
  author_email: z.string(),
  commit_date: z.number(),
  message: z.string(),
  files_changed: z.number(),
  insertions: z.number(),
  deletions: z.number(),
  created_at: z.number()
});

export type Repository = z.infer<typeof RepositorySchema>;
export type Commit = z.infer<typeof CommitSchema>;

