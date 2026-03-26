# Coding History - Git 提交统计应用

## 项目概述

Git commit 统计应用，用于扫描、存储和可视化 Git 仓库的提交记录，帮助追踪工作产出。

## 技术栈

### 后端 (backend/)
- **框架**: Hono + Node.js
- **数据库**: SQLite + Prisma ORM
- **语言**: TypeScript (ESM)
- **主要依赖**: simple-git, zod, pino, node-cron

### 前端 (frontend/)
- **框架**: React 18 + Vite
- **UI**: Ant Design 5 + Tailwind CSS 4
- **状态**: Jotai + ahooks
- **语言**: TypeScript
- **主要依赖**: axios, dayjs, ramda

### 包管理
- **pnpm** monorepo（根目录 package.json 管理工作空间）
- **Node.js**: 20.x (Volta 管理)

## 常用命令

```bash
# 开发
pnpm dev                    # 同时启动前后端
pnpm dev:backend           # 仅启动后端
pnpm dev:frontend          # 仅启动前端

# 构建
pnpm build:backend
pnpm build:frontend

# 初始扫描
pnpm init-scan

# 生产环境 (PM2)
pnpm start
pnpm stop
pnpm restart
pnpm logs
```

## 项目结构

```
├── backend/
│   ├── src/
│   │   ├── routes/        # API 路由
│   │   ├── services/      # 业务服务层
│   │   ├── db/            # 数据库客户端
│   │   ├── config/        # 配置文件
│   │   ├── jobs/          # 定时任务
│   │   └── index.ts       # 入口
│   ├── prisma/            # 数据库模型
│   └── database/          # SQLite 文件
├── frontend/
│   ├── src/
│   │   ├── pages/         # 页面组件
│   │   ├── components/    # 通用组件
│   │   ├── services/      # API 服务
│   │   ├── biz/           # 业务逻辑 (atoms, hooks)
│   │   └── utils/         # 工具函数
│   └── index.html
└── docs/                  # 文档
```

## 代码规范

### Git 提交规范
使用 Conventional Commits + 中文描述：
```
feat(模块): 新增功能描述
fix(模块): 修复问题描述
style(模块): 样式调整
refactor(模块): 重构说明
```

### 前端规范
- 组件使用函数式组件 + Hooks
- 状态管理优先使用 Jotai atoms
- API 调用使用 axios，封装在 services/
- 样式使用 Tailwind CSS + Ant Design

### 后端规范
- API 路由在 routes/，业务逻辑在 services/
- 使用 Prisma 进行数据库操作
- 日志使用 pino

## API 端点

- `GET /api/v1/config/repositories` - 获取仓库配置
- `POST /api/v1/config/repositories` - 创建仓库
- `GET /api/v1/commits` - 查询提交记录
- `GET /api/v1/statistics` - 获取统计数据
- `GET /api/v1/tasks` - 获取扫描任务
- `GET /api/v1/logs/*` - 日志相关接口
