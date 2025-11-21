# Git 提交记录统计系统

一个全栈 Web 应用，用于统计和展示多个本地 Git 仓库的提交记录。

## 技术栈

### 后端
- **Hono.js** - 轻量级、高性能的 Web 框架
- **Zod** - TypeScript-first 的数据验证
- **better-sqlite3** - SQLite 数据库
- **simple-git** - Git 操作
- **node-cron** - 定时任务
- **pino** - 日志记录

### 前端
- **React 18** + **TypeScript**
- **Ant Design 5.x** - UI 组件库
- **Jotai** - 状态管理
- **ahooks** - React Hooks 库
- **ramda** - 函数式编程工具
- **dayjs** - 日期处理

### 包管理器
- **pnpm** - 快速、节省磁盘空间的包管理器

## 项目结构

```
coding-history/
├── backend/              # 后端项目
│   ├── src/
│   │   ├── config/       # 配置文件
│   │   ├── schemas/      # Zod schemas
│   │   ├── services/     # 业务服务
│   │   ├── routes/       # API 路由
│   │   ├── db/           # 数据库相关
│   │   ├── jobs/         # 定时任务
│   │   └── index.ts      # 入口文件
│   ├── config/           # 仓库配置文件
│   └── database/         # SQLite 数据库文件
├── frontend/             # 前端项目
│   └── src/
│       ├── pages/        # 页面组件
│       ├── biz/          # 业务逻辑（atoms）
│       ├── services/     # API 服务
│       └── types/        # 类型定义
└── README.md
```

## 快速开始

### 1. 安装依赖

```bash
# 在项目根目录
pnpm install
```

### 2. 配置仓库

编辑 `backend/config/repositories.json`，添加您的 Git 仓库路径：

```json
{
  "repositories": [
    {
      "id": "my-project",
      "name": "我的项目",
      "path": "/path/to/your/repository",
      "enabled": true
    }
  ],
  "author": {
    "name": "Your Name",
    "email": "your.email@company.com"
  },
  "scanInterval": "0 2 * * *"
}
```

### 3. 启动后端

```bash
cd backend
pnpm dev
```

后端服务将在 `http://localhost:3000` 启动。

### 4. 启动前端

```bash
cd frontend
pnpm dev
```

前端应用将在 `http://localhost:5173` 启动。

### 5. 首次使用

1. 访问前端页面 `http://localhost:5173`
2. 点击"手动扫描"按钮，系统会扫描所有配置的仓库
3. 扫描完成后，可以通过时间范围和仓库筛选查看统计数据

## 功能特性

- ✅ 多仓库支持
- ✅ 增量扫描（只扫描新增提交）
- ✅ 定时自动扫描（可配置 cron 表达式）
- ✅ 时间范围筛选（最近一周、最近一个月、自定义范围）
- ✅ 仓库筛选
- ✅ 统计数据展示（提交次数、代码行数、文件变更数）
- ✅ 提交记录表格（支持分页、排序）
- ✅ 数据持久化（SQLite）

## API 接口

### 仓库管理
- `GET /api/v1/repositories` - 获取所有仓库
- `GET /api/v1/repositories/:id` - 获取单个仓库
- `POST /api/v1/repositories/scan` - 手动触发扫描

### 提交记录
- `GET /api/v1/commits` - 获取提交记录列表（支持分页）

### 统计数据
- `GET /api/v1/statistics` - 获取统计数据

## 开发

### 后端开发

```bash
cd backend
pnpm dev  # 开发模式，支持热重载
```

### 前端开发

```bash
cd frontend
pnpm dev  # 开发模式
```

### 构建

```bash
# 构建后端
cd backend
pnpm build

# 构建前端
cd frontend
pnpm build
```

## 注意事项

1. **权限问题**: 确保应用有权限访问配置的 Git 仓库路径
2. **首次扫描**: 对于大型仓库，首次扫描可能需要较长时间
3. **数据备份**: 定期备份 SQLite 数据库文件（`backend/database/git-statistics.db`）
4. **时区处理**: 确保前后端时区一致

## 许可证

MIT

