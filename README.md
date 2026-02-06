# Coding History - 代码提交记录统计系统

一个全栈 Web 应用，用于统计和展示多个本地 Git 仓库的提交记录。


## 预览

<table>
  <tr>
    <td><img src="./docs/imgs/image-1.png" alt="预览图1" /></td>
    <td><img src="./docs/imgs/image-2.png" alt="预览图2" /></td>
  </tr>
  <tr>
    <td><img src="./docs/imgs/image-3.png" alt="预览图3" /></td>
    <td><img src="./docs/imgs/image-4.png" alt="预览图4" /></td>
  </tr>
</table>

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
│   ├── config/           # 仓库配置文件（已废弃，仅用于迁移）
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

### 2. 环境变量配置（可选）

#### 后端环境变量（backend/.env）

在 `backend` 目录下可以创建 `.env` 文件来配置环境变量：

```bash
# 控制是否在项目启动时立即执行定时任务扫描
# true: 如果当前时间匹配 cron 表达式，会立即执行一次扫描（默认）
# false: 只启动定时任务，不立即执行扫描
ENABLE_STARTUP_SCAN=true
```

**说明**：
- `ENABLE_STARTUP_SCAN`: 控制项目启动时是否默认执行定时任务扫描
  - 设置为 `true`（默认）：如果当前时间匹配定时任务的 cron 表达式，会在启动时立即执行一次扫描
  - 设置为 `false`：只启动定时任务调度器，不会在启动时立即执行扫描，定时任务会按计划执行

#### 启动脚本环境变量

如果使用 `start.sh` 脚本启动项目，可以通过环境变量控制是否执行初始化扫描：

```bash
# 默认行为：不执行初始化扫描（ENABLE_STARTUP_SCAN 默认为 false）
./start.sh

# 启用启动时初始化扫描
ENABLE_STARTUP_SCAN=true ./start.sh

# 或者导出环境变量后启动
export ENABLE_STARTUP_SCAN=true
./start.sh
```

**说明**：
- `ENABLE_STARTUP_SCAN`: 控制 `start.sh` 脚本是否在启动时执行初始化扫描（`pnpm init-scan`）
  - 设置为 `true`：启动时会自动执行初始化扫描，同步最近3个月的代码记录
  - 设置为 `false`（默认）：跳过启动时的初始化扫描，可以稍后手动执行 `pnpm init-scan`

### 3. 配置仓库

**注意**: 配置已迁移到数据库，请使用前端配置管理页面进行配置。

#### 首次使用（从配置文件迁移）

如果您有旧的 `backend/config/repositories.json` 配置文件，可以运行迁移脚本将其导入数据库：

```bash
cd backend
pnpm migrate-config
```

#### 使用配置管理页面

1. 启动后端和前端服务
2. 访问前端页面，点击左侧菜单的"配置管理"
3. 在配置管理页面可以：
   - **仓库配置**：添加/编辑/删除仓库，启用/禁用仓库
   - **作者配置**：为每个仓库配置作者信息（用于过滤提交记录）
   - **忽略分支配置**：为每个仓库配置忽略的分支（这些分支的提交不会参与统计）
   - **数据指标配置**：配置工作状态判断的阈值、标签文本和颜色
     - 提交次数阈值（轻松、正常、忙碌、疯狂）
     - 加班时间阈值（默认 19:00）
     - 工作状态标签文本（可自定义显示文本）
     - 工作状态标签颜色（支持 Ant Design 的所有颜色）

#### 旧配置文件格式（仅用于迁移）

如果您需要从旧的配置文件迁移，格式如下：

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
  "authors": [
    {
      "name": "Your Name",
      "email": "your.email@company.com",
      "isDefault": true
    }
  ],
  "scanInterval": [
    {
      "cron": "0 10 * * *",
      "description": "每天上午10点"
    }
  ],
  "ignoredBranches": ["develop", "release"]
}
```

### 3. 启动服务

#### 方式一：PM2 后台启动（推荐）

使用 PM2 在后台启动服务，不占用终端窗口：

```bash
# 启动服务（后台运行）
./start-pm2.sh
# 或
pnpm start:pm2

# 查看服务状态
pnpm status:pm2
# 或
pm2 status

# 查看日志
pnpm logs:pm2
# 或
pm2 logs

# 停止服务
./stop-pm2.sh
# 或
pnpm stop:pm2

# 重启服务
pnpm restart:pm2
```

**PM2 启动的优势：**
- 服务在后台运行，不占用终端窗口
- 自动重启（进程崩溃时）
- 日志管理（输出到文件）
- 进程监控和管理

#### 方式二：传统方式启动

如果需要在前台运行查看实时日志：

**启动后端：**
```bash
cd backend
pnpm dev
```

后端服务将在 `http://localhost:5188` 启动。

**启动前端：**
```bash
cd frontend
pnpm dev
```

前端应用将在 `http://localhost:5173` 启动。

### 5. 首次使用

1. **配置仓库**（如果还没有配置）:
   - 访问前端页面 `http://localhost:5173`
   - 点击左侧菜单的"配置管理"
   - 添加仓库、配置作者和忽略分支

2. **初始化历史数据**（可选）:
   ```bash
   cd backend
   pnpm init-scan  # 扫描最近3个月的数据
   pnpm init-scan --months 6  # 扫描最近6个月的数据
   ```

3. **查看统计数据**:
   - 访问 Git 数据看板页面
   - 通过时间范围和仓库筛选查看统计数据

## 功能特性

- ✅ 多仓库支持
- ✅ 增量扫描（只扫描新增提交）
- ✅ 定时自动扫描（可配置 cron 表达式）
- ✅ 时间范围筛选（最近一周、最近一个月、自定义范围）
- ✅ 仓库筛选
- ✅ 统计数据展示（提交次数、代码行数、文件变更数）
- ✅ 提交记录表格（支持分页、排序）
- ✅ 数据持久化（SQLite）
- ✅ 配置管理（数据库存储，支持前端界面管理）
  - 仓库配置（添加/编辑/删除仓库）
  - 作者配置（为每个仓库配置作者信息）
  - 忽略分支配置（配置不参与统计的分支）
  - 数据指标配置（配置工作状态判断阈值、标签文本和颜色）
- ✅ 任务管理（支持手动和定时任务）
- ✅ 日志管理（请求日志、定时任务日志、服务器日志）

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
3. **数据备份**: 定期备份 SQLite 数据库文件（`backend/database/coding-history.db`）
4. **时区处理**: 确保前后端时区一致

## 许可证

MIT

