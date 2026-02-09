# 新维护人员快速上手指南

## 🚀 首次启动检查清单

在首次启动项目前，请按以下步骤操作：

### ✅ 步骤 1: 环境检查
```bash
# 进入项目目录 (volta 会自动切换到正确版本)
cd coding-history

# 检查工具版本 (volta 会自动管理)
node --version    # 应该显示 20.19.6
pnpm --version    # 应该显示 10.15.0
pm2 --version     # 应该显示 5.4.2

# 检查 Git 版本
git --version
```

如果版本不符合要求，请安装 volta 并设置工具链：
```bash
# 安装 volta (如果还没有)
curl https://get.volta.sh | bash

# 重新加载 shell 配置
source ~/.bashrc  # 或 ~/.zshrc

# 在项目目录下安装正确版本的工具
volta install
```

**Volta 工作原理：**
- 🎯 进入项目目录时，volta 自动读取 `.volta.json` 配置
- 🔄 自动切换到项目指定的 Node.js 和工具版本
- 📦 确保所有团队成员使用相同的开发环境

### ✅ 步骤 2: 项目初始化
```bash
# 克隆项目 (如果还没有)
git clone <repository-url>
cd coding-history

# 安装所有依赖
pnpm install
```

### ✅ 步骤 3: 二进制模块处理
这是最关键的一步，很多启动问题都源于此：

```bash
# 检查 better-sqlite3 是否正常
cd backend
node -e "require('better-sqlite3'); console.log('✅ better-sqlite3 正常')"

# 如果报错，执行以下命令之一：
# 方式一：重新编译
pnpm rebuild better-sqlite3

# 方式二：完全重新安装（推荐）
rm -rf node_modules
pnpm install
cd ..
```

**为什么这一步很重要？**
- better-sqlite3 是包含 C++ 代码的二进制模块
- 当 Node.js 版本变化时，需要重新编译
- 如果版本不匹配，会出现 `NODE_MODULE_VERSION` 错误

### ✅ 步骤 4: 数据库初始化
```bash
# Prisma 会自动生成客户端，但可以手动执行
cd backend
pnpm postinstall
cd ..

# 检查数据库目录
mkdir -p backend/database
```

### ✅ 步骤 5: 启动服务
```bash
# 使用 PM2 后台启动（推荐）
pnpm start:pm2

# 检查服务状态
pnpm status:pm2

# 查看日志确认无错误
pnpm logs:pm2
```

### ✅ 步骤 6: 验证服务
```bash
# 检查后端健康状态
curl http://localhost:5188/health

# 检查前端是否可访问
curl -I http://localhost:5173

# 预期结果：
# 后端: {"status":"ok"}
# 前端: HTTP/1.1 200 OK
```

## 🐛 常见问题解决

### 问题 1: better-sqlite3 版本不匹配
**错误信息**: 
```
The module '.../better_sqlite3.node'
was compiled against a different Node.js version using
NODE_MODULE_VERSION 115. This version of Node.js requires
NODE_MODULE_VERSION 127.
```

**解决方案**:
```bash
cd backend
rm -rf node_modules
pnpm install
```

**根本原因**: better-sqlite3 是二进制模块，需要与 Node.js 版本匹配。

### 问题 2: 端口被占用
**错误信息**: `Port 5173 is in use` 或 `Port 5188 is in use`

**解决方案**:
```bash
# 查找占用端口的进程
lsof -i :5173
lsof -i :5188

# 停止占用进程
kill -9 <PID>

# 或者修改端口配置
```

### 问题 3: PM2 启动失败
**错误信息**: `App [coding-history-backend] exited with code [1]`

**解决方案**:
```bash
# 查看详细日志
pm2 logs coding-history-backend

# 重新安装依赖后重启
cd backend && rm -rf node_modules && pnpm install && cd ..
pm2 restart all

# 如果还是不行，完全重置
pm2 kill
pnpm start:pm2
```

### 问题 4: Git 仓库权限问题
**错误信息**: `Permission denied` 或 `fatal: not a git repository`

**解决方案**:
```bash
# 确保仓库路径正确且有读取权限
ls -la /path/to/your/repository
git status /path/to/your/repository

# 检查配置的仓库路径是否正确
```

### 问题 5: 前端代理错误
**错误信息**: `[vite] http proxy error: ECONNREFUSED`

**解决方案**:
```bash
# 这通常意味着后端没有启动
# 检查后端状态
pm2 status
pm2 logs coding-history-backend

# 重启后端
pm2 restart coding-history-backend
```

## 📝 开发环境配置

### VSCode 推荐插件
- TypeScript
- Prettier
- ESLint
- GitLens
- Prisma
- Thunder Client (API 测试)

### 环境变量配置
创建 `backend/.env` 文件：
```bash
# 控制启动时是否立即执行定时任务扫描
ENABLE_STARTUP_SCAN=true

# 其他可选配置
# LOG_LEVEL=info
# DATABASE_URL="file:./database/coding-history.db"
```

### 调试配置
创建 `.vscode/launch.json`：
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Backend",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/backend/src/index.ts",
      "outFiles": ["${workspaceFolder}/backend/dist/**/*.js"],
      "runtimeArgs": ["-r", "tsx/cjs"],
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

## 🔄 日常维护命令

### 服务管理
```bash
# 启动服务
pnpm start:pm2

# 停止服务
pnpm stop:pm2

# 重启服务
pnpm restart:pm2

# 查看状态
pnpm status:pm2

# 查看日志
pnpm logs:pm2

# 完全删除 PM2 进程
pnpm delete:pm2

# 重置 PM2 (解决顽固问题)
pnpm reset:pm2
```

### 数据管理
```bash
# 手动扫描
pnpm init-scan

# 扫描指定月份
pnpm init-scan -- --months 6

# 清理日志
cd backend && pnpm clean-logs

# 数据库迁移 (从旧配置文件)
cd backend && pnpm migrate-config
```

### 开发模式
```bash
# 前台启动 (开发调试)
./start.sh

# 带初始化扫描启动
ENABLE_STARTUP_SCAN=true ./start.sh

# 单独启动后端
cd backend && pnpm dev

# 单独启动前端
cd frontend && pnpm dev
```

## 📁 重要文件位置

### 核心文件
- **数据库文件**: `backend/database/coding-history.db`
- **PM2 配置**: `ecosystem.config.cjs`
- **启动脚本**: `start.sh`, `scripts/pm2-*.sh`

### 日志文件
- **后端日志**: `backend/logs/`
- **前端日志**: `frontend/logs/`
- **PM2 日志**: `backend/logs/pm2/`, `frontend/logs/pm2/`

### 配置文件
- **环境变量**: `backend/.env`
- **Prisma 配置**: `backend/prisma/schema.prisma`
- **Vite 配置**: `frontend/vite.config.ts`

## 🎯 快速验证清单

启动后，请验证以下功能：

### ✅ 基础服务
- [ ] 后端健康检查: `curl http://localhost:5188/health`
- [ ] 前端页面可访问: `http://localhost:5173`
- [ ] PM2 进程状态正常: `pnpm status:pm2`

### ✅ 功能验证
- [ ] 可以访问配置管理页面
- [ ] 可以添加仓库配置
- [ ] 可以手动触发扫描
- [ ] 可以查看统计数据

### ✅ 日志检查
- [ ] 后端启动无错误日志
- [ ] 前端启动无错误日志
- [ ] PM2 日志正常输出

## 🆘 获取帮助

如果遇到问题，按以下顺序排查：

1. **查看日志**: `pnpm logs:pm2`
2. **检查状态**: `pnpm status:pm2`
3. **重启服务**: `pnpm restart:pm2`
4. **重置环境**: `pnpm delete:pm2 && pnpm start:pm2`
5. **重新安装依赖**: `rm -rf node_modules && pnpm install`

如果问题仍然存在，请提供以下信息：
- Node.js 版本: `node --version` (应该显示 20.19.6)
- Volta 状态: `volta list`
- PM2 状态: `pm2 status`
- 错误日志: `pm2 logs --lines 20`
- 系统信息: `uname -a`

---

**提示**: 保存这个文档到书签，首次配置时会很有用！