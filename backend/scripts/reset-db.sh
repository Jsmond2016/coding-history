#!/bin/bash

# 重置数据库脚本
echo "🔄 重置数据库..."

# 删除数据库文件
rm -f database/git-statistics.db

# 重新应用迁移
echo "📦 应用数据库迁移..."
npx prisma migrate deploy

# 重新生成 Prisma Client
echo "🔨 生成 Prisma Client..."
npx prisma generate

echo "✅ 数据库重置完成！"

