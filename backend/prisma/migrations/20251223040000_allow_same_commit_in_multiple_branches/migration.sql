-- 修改 commits 表的唯一约束，允许同一个 commit 在不同分支中保存多条记录
-- SQLite 不支持直接修改唯一约束，需要重建表

-- 1. 删除旧的唯一约束索引（如果存在）
DROP INDEX IF EXISTS "commits_repo_id_commit_hash_key";

-- 2. 创建新的唯一约束索引（允许同一个 commit 在不同分支中保存多条记录）
-- 注意：SQLite 中 NULL 值在唯一约束中是特殊的，多个 NULL 值被认为是不同的
CREATE UNIQUE INDEX IF NOT EXISTS "commits_repo_id_commit_hash_branch_key" ON "commits"("repo_id", "commit_hash", "branch");

-- 3. 创建新的索引（用于优化查询）
CREATE INDEX IF NOT EXISTS "idx_commits_repo_branch_date" ON "commits"("repo_id", "branch", "commit_date");
