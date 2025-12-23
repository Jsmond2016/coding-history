# Prisma 数据库迁移同步流程文档

## 📋 目录

- [一、开发环境：创建新迁移](#一开发环境创建新迁移)
- [二、团队协作：同步迁移](#二团队协作同步迁移)
- [三、生产环境：部署流程](#三生产环境部署流程)
- [四、常用命令速查表](#四常用命令速查表)
- [五、完整工作流程示例](#五完整工作流程示例)
- [六、最佳实践和注意事项](#六最佳实践和注意事项)
- [七、项目特定脚本（可选优化）](#七项目特定脚本可选优化)
- [八、常见问题排查](#八常见问题排查)

---

## 一、开发环境：创建新迁移

### 场景：开发者 A 需要添加新功能，修改数据库结构

```bash
# 1. 进入后端目录
cd backend

# 2. 修改 schema.prisma 文件（添加新字段、新表等）
# 例如：在 Commit 模型中添加新字段
# 编辑 backend/prisma/schema.prisma

# 3. 创建迁移（开发环境）
npx prisma migrate dev --name add_new_feature

# 这个命令会：
# ✅ 自动检测 schema.prisma 的变化
# ✅ 生成 migration.sql 文件
# ✅ 创建带时间戳的迁移目录
# ✅ 立即执行迁移（应用到本地数据库）
# ✅ 重新生成 Prisma Client
# ✅ 更新 _prisma_migrations 表

# 4. 检查迁移状态
npx prisma migrate status

# 5. 提交代码到 Git
git add prisma/
git commit -m "feat: add new feature migration"
git push origin feature-branch
```

---

## 二、团队协作：同步迁移

### 场景 A：开发者 B 拉取代码后同步数据库

```bash
# 1. 拉取最新代码（包含新的迁移文件）
git pull origin main

# 2. 检查迁移状态（查看哪些迁移未应用）
npx prisma migrate status

# 输出示例：
# ✅ 20251121092610_init
# ✅ 20251218090217_add_branch_to_commits
# ❌ 20251223023418_add_logs (未应用)
# ❌ 20251223024939_add_scan_tasks (未应用)

# 3. 应用所有未执行的迁移（开发环境）
npx prisma migrate dev

# 或者使用 deploy（只应用，不生成新迁移）
npx prisma migrate deploy

# 4. 重新生成 Prisma Client（确保类型同步）
npx prisma generate

# 5. 验证数据库结构
npx prisma studio  # 可选：打开可视化界面查看数据库
```

### 场景 B：开发者 A 和 B 同时修改 schema（冲突处理）

```bash
# 情况 1：A 先提交，B 后提交（B 需要 rebase）

# 开发者 B 的操作流程：
git pull origin main

# 如果发现冲突，检查迁移状态
npx prisma migrate status

# 如果有冲突，需要：
# 1. 重置本地迁移（如果还没提交）
npx prisma migrate reset  # ⚠️ 会删除所有数据！

# 或者手动解决：
# 2. 应用 A 的迁移
npx prisma migrate deploy

# 3. 创建自己的迁移
npx prisma migrate dev --name my_feature

# 4. 解决可能的 schema.prisma 冲突
# 编辑 schema.prisma，合并双方的修改

# 5. 创建合并后的迁移
npx prisma migrate dev --name merge_features

# 6. 提交代码
git add prisma/
git commit -m "fix: merge migration conflicts"
git push origin feature-branch
```

---

## 三、生产环境：部署流程

### 部署前准备

```bash
# 1. 在本地验证所有迁移
cd backend

# 2. 检查迁移状态（确保所有迁移都已测试）
npx prisma migrate status

# 3. 生成 Prisma Client（确保类型正确）
npx prisma generate

# 4. 构建项目
npm run build

# 5. 测试迁移（在测试环境）
# 设置测试环境的 DATABASE_URL
export DATABASE_URL="file:./database/test.db"
npx prisma migrate deploy
```

### 生产环境部署命令

```bash
# ⚠️ 生产环境部署流程（重要！）

# 1. 进入后端目录
cd backend

# 2. 设置生产环境数据库 URL
export DATABASE_URL="file:./database/git-statistics.db"
# 或者从环境变量文件读取
source .env.production

# 3. 备份数据库（重要！）
cp database/git-statistics.db database/git-statistics.db.backup.$(date +%Y%m%d_%H%M%S)

# 4. 应用迁移（生产环境使用 deploy，不是 dev！）
npx prisma migrate deploy

# 这个命令会：
# ✅ 检查哪些迁移未执行
# ✅ 按时间顺序执行所有未执行的迁移
# ✅ 不会修改 schema.prisma
# ✅ 不会生成新迁移
# ✅ 更新 _prisma_migrations 表

# 5. 重新生成 Prisma Client（确保类型同步）
npx prisma generate

# 6. 验证迁移结果
npx prisma migrate status

# 7. 重启应用服务
# pm2 restart app 或 systemctl restart app
```

---

## 四、常用命令速查表

| 命令 | 使用场景 | 说明 |
|------|---------|------|
| `npx prisma migrate dev --name <name>` | 开发环境创建迁移 | 生成迁移 + 执行迁移 + 生成 Client |
| `npx prisma migrate deploy` | 生产环境部署 | 只执行未应用的迁移 |
| `npx prisma migrate status` | 检查迁移状态 | 查看哪些迁移已应用/未应用 |
| `npx prisma migrate reset` | 重置数据库 | ⚠️ 删除所有数据，重新执行所有迁移 |
| `npx prisma generate` | 生成 Prisma Client | 更新 TypeScript 类型定义 |
| `npx prisma studio` | 可视化数据库 | 打开 Web 界面查看数据 |

---

## 五、完整工作流程示例

### 示例：添加新表 "notifications"

```bash
# ========== 开发者 A 的工作流程 ==========

# 1. 创建功能分支
git checkout -b feature/add-notifications

# 2. 修改 schema.prisma
# 添加 Notification 模型
# model Notification {
#   id        Int     @id @default(autoincrement())
#   message   String
#   createdAt BigInt  @map("created_at")
#   @@map("notifications")
# }

# 3. 创建迁移
cd backend
npx prisma migrate dev --name add_notifications_table

# 输出：
# ✔ Generated migration: 20251225000000_add_notifications_table
# ✔ Applied migration `20251225000000_add_notifications_table`
# ✔ Generated Prisma Client

# 4. 编写业务代码（使用新的模型）
# 5. 测试功能
# 6. 提交代码
git add prisma/ src/
git commit -m "feat: add notifications table"
git push origin feature/add-notifications

# 7. 创建 Pull Request

# ========== 开发者 B 的工作流程（同步 A 的代码）==========

# 1. 拉取最新代码
git checkout main
git pull origin main

# 2. 应用迁移
cd backend
npx prisma migrate deploy

# 输出：
# ✔ Applied migration `20251225000000_add_notifications_table`

# 3. 重新生成 Client（确保类型同步）
npx prisma generate

# 4. 验证
npx prisma migrate status
# 应该显示所有迁移都已应用

# ========== 生产环境部署流程 ==========

# 1. 合并 PR 到 main 分支
# 2. 在服务器上拉取代码
git pull origin main

# 3. 备份数据库
cd backend
cp database/git-statistics.db database/git-statistics.db.backup.$(date +%Y%m%d_%H%M%S)

# 4. 应用迁移
npx prisma migrate deploy

# 5. 生成 Client
npx prisma generate

# 6. 构建并重启服务
npm run build
pm2 restart app  # 或使用其他进程管理工具
```

---

## 六、最佳实践和注意事项

### 1. 迁移文件命名规范

```bash
# ✅ 好的命名（描述性强）
npx prisma migrate dev --name add_user_avatar_field
npx prisma migrate dev --name create_order_table
npx prisma migrate dev --name fix_email_unique_constraint

# ❌ 不好的命名（不清晰）
npx prisma migrate dev --name update
npx prisma migrate dev --name fix
```

### 2. 迁移文件不要手动修改

```bash
# ❌ 不要这样做！
# 已经提交到 Git 的迁移文件不应该修改
# 如果迁移有问题，创建新的迁移来修复

# ✅ 正确做法
# 如果发现迁移有问题，创建新的迁移来修复
npx prisma migrate dev --name fix_previous_migration_issue
```

### 3. 生产环境安全检查

```bash
# 部署前检查清单：
# ✅ 所有迁移都在测试环境验证过
# ✅ 数据库已备份
# ✅ 迁移顺序正确（按时间戳）
# ✅ 使用 migrate deploy 而不是 migrate dev
# ✅ 迁移后验证数据库结构
```

### 4. 回滚迁移（如果需要）

```bash
# ⚠️ Prisma 不直接支持回滚，需要手动处理

# 方法 1：创建反向迁移
# 1. 修改 schema.prisma 回退到之前的状态
# 2. 创建新迁移
npx prisma migrate dev --name rollback_previous_change

# 方法 2：使用数据库备份恢复
cp database/git-statistics.db.backup.20251225_120000 database/git-statistics.db
```

### 5. Git 工作流建议

```bash
# ✅ 推荐的工作流
# 1. 每个功能分支包含完整的迁移
# 2. 迁移文件必须提交到 Git
# 3. PR 合并前检查迁移文件
# 4. 主分支的迁移文件永远不要修改

# ❌ 避免的做法
# 1. 在多个分支中创建相同名称的迁移
# 2. 删除已提交的迁移文件
# 3. 手动修改已执行的迁移 SQL
```

---

## 七、项目特定脚本（可选优化）

可以在 `backend/package.json` 中添加便捷脚本：

```json
{
  "scripts": {
    "migrate:dev": "prisma migrate dev",
    "migrate:deploy": "prisma migrate deploy",
    "migrate:status": "prisma migrate status",
    "migrate:reset": "prisma migrate reset",
    "db:generate": "prisma generate",
    "db:studio": "prisma studio",
    "db:backup": "cp database/git-statistics.db database/git-statistics.db.backup.$(date +%Y%m%d_%H%M%S)"
  }
}
```

然后可以使用：

```bash
# 开发环境创建迁移
pnpm migrate:dev --name add_feature

# 生产环境部署
pnpm migrate:deploy

# 检查状态
pnpm migrate:status

# 备份数据库
pnpm db:backup
```

---

## 八、常见问题排查

### 问题 1：迁移状态不一致

```bash
# 症状：migrate status 显示不一致
npx prisma migrate status

# 解决方案：
# 1. 检查 _prisma_migrations 表
npx prisma studio
# 查看 _prisma_migrations 表中的记录

# 2. 手动修复（谨慎操作）
# 如果迁移文件存在但未记录，可以手动插入记录
# 但建议重新执行迁移或重置数据库
```

### 问题 2：迁移执行失败

```bash
# 症状：migrate deploy 报错

# 解决方案：
# 1. 查看详细错误信息
npx prisma migrate deploy --verbose

# 2. 检查数据库连接
# 确保 DATABASE_URL 正确

# 3. 检查 SQL 语法
# 查看 migration.sql 文件是否有语法错误

# 4. 如果是 SQLite，检查表锁定
# 确保没有其他进程在使用数据库
```

### 问题 3：Prisma Client 类型不匹配

```bash
# 症状：TypeScript 类型错误

# 解决方案：
# 重新生成 Prisma Client
npx prisma generate

# 如果还有问题，清理后重新生成
rm -rf node_modules/.prisma
npx prisma generate
```

### 问题 4：数据库锁定（SQLite）

```bash
# 症状：database is locked

# 解决方案：
# 1. 检查是否有其他进程在使用数据库
lsof database/git-statistics.db

# 2. 关闭所有使用数据库的进程
# 3. 重新执行迁移
npx prisma migrate deploy
```

### 问题 5：迁移文件冲突

```bash
# 症状：Git 合并时迁移文件冲突

# 解决方案：
# 1. 先应用对方的迁移
npx prisma migrate deploy

# 2. 解决 schema.prisma 的冲突
# 手动编辑 schema.prisma，合并双方的修改

# 3. 创建新的迁移
npx prisma migrate dev --name merge_conflicts

# 4. 提交合并后的迁移
git add prisma/
git commit -m "fix: resolve migration conflicts"
```

---

## 九、迁移文件结构说明

### Prisma 目录结构

```
backend/prisma/
├── schema.prisma              # 数据库模式定义文件
├── migrations/                # 迁移历史目录
│   ├── migration_lock.toml    # 锁定数据库提供者
│   ├── 20251121092610_init/   # 初始化迁移
│   │   └── migration.sql
│   ├── 20251218090217_add_branch_to_commits/
│   │   └── migration.sql
│   └── ...
```

### 迁移文件命名规则

格式：`YYYYMMDDHHMMSS_migration_name/`

- `20251121092610` - 时间戳（年月日时分秒）
- `init` - 迁移描述名称（使用下划线分隔）

### migration.sql 文件内容

每个迁移目录包含一个 `migration.sql` 文件，记录该次变更的 SQL 语句：

```sql
-- CreateTable
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    ...
);

-- CreateIndex
CREATE INDEX "idx_commits_repo_date" ON "commits"("repo_id", "commit_date");
```

---

## 十、总结

### 核心原则

1. **开发环境**：使用 `migrate dev` 创建和应用迁移
2. **生产环境**：使用 `migrate deploy` 只应用迁移
3. **团队协作**：迁移文件必须提交到 Git，团队成员拉取后执行 `migrate deploy`
4. **版本控制**：迁移文件是数据库结构的版本历史，不要手动修改已提交的迁移

### 快速参考

```bash
# 开发：创建新迁移
npx prisma migrate dev --name <name>

# 同步：应用他人创建的迁移
npx prisma migrate deploy

# 生产：部署迁移
npx prisma migrate deploy

# 检查：查看迁移状态
npx prisma migrate status
```

---

**文档版本**：v1.0  
**最后更新**：2025-12-24  
**适用项目**：coding-history

