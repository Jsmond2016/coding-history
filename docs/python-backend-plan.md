# Python 后端重构计划

## 背景

将现有 Node.js (Hono + Prisma) 后端重写为 Python (FastAPI + SQLAlchemy 2.0) 后端，保持与前端完全兼容。

- 新代码放在 `python-backend/` 目录
- API 路径和响应格式 100% 兼容现有前端
- 数据库继续使用 SQLite，Schema 不变

## 技术选型

| 组件 | Node.js (现有) | Python (新) |
|------|---------------|-------------|
| 框架 | Hono | FastAPI |
| ORM | Prisma | SQLAlchemy 2.0 (async + aiosqlite) |
| 数据库迁移 | Prisma Migrate | Alembic (暂未配置) |
| 校验 | Zod | Pydantic v2 |
| Git 操作 | simple-git | GitPython |
| 定时任务 | node-cron | APScheduler |
| 日志 | pino + rotating-file-stream | loguru |
| 配置 | dotenv | pydantic-settings |

## 项目结构

```
python-backend/
  pyproject.toml
  .env / .env.example
  database/
    coding-history.db           # SQLite 数据库
  app/
    __init__.py
    main.py                     # FastAPI 应用入口
    core/
      __init__.py
      config.py                 # 配置管理 (pydantic-settings)
      database.py               # 数据库连接 (async SQLAlchemy)
      logger.py                 # 日志配置 (loguru)
      work_status.py            # 工作状态计算逻辑
    models/
      __init__.py
      repository.py             # Repository ORM
      commit.py                 # Commit ORM
      author.py                 # Author ORM
      server_log.py             # ServerLog ORM
      request_log.py            # RequestLog ORM
      scheduled_task_log.py     # ScheduledTaskLog ORM
      scan_task.py              # ScanTask ORM
      data_metrics_config.py    # DataMetricsConfig ORM
      app_setting.py            # AppSetting ORM
    api/
      __init__.py
      router.py                 # 路由聚合
      dependencies.py           # 依赖注入
      repositories.py           # /api/v1/repositories (5 端点)
      commits.py                # /api/v1/commits (2 端点)
      statistics.py             # /api/v1/statistics (1 端点)
      logs.py                   # /api/v1/logs (4 端点)
      tasks.py                  # /api/v1/tasks (9 端点)
      config.py                 # /api/v1/config (18 端点)
    services/
      __init__.py
      repository_service.py     # 仓库 CRUD
      commit_service.py         # 提交查询/统计/gap-fill
      git_scan_service.py       # Git 扫描 (GitPython)
      config_service.py         # 配置查询 (camelCase 响应)
      scan_task_service.py      # 扫描任务管理
      scan_task_executor.py     # 任务执行器
      log_service.py            # 日志 CRUD
      data_metrics_config_service.py  # 工作状态指标配置
      app_setting_service.py    # 应用设置 (备份配置等)
    jobs/
      __init__.py
      scan_scheduler.py         # 扫描定时调度 (APScheduler)
      db_backup_scheduler.py    # 数据库备份调度
    middleware/
      __init__.py
      request_logging.py        # 请求日志中间件
```

## 任务拆解

### Phase 1: 基础框架 (6 个任务)

- [x] **1.1** 初始化项目结构 + pyproject.toml + 依赖配置
- [x] **1.2** 配置管理 (core/config.py) + 日志 (core/logger.py)
- [x] **1.3** 数据库连接 (core/database.py) + SQLAlchemy 模型 (models/*.py, 9 个)
- [ ] **1.4** Alembic 迁移配置 (暂不需要，直接用现有数据库)
- [x] **1.5** 工作状态计算逻辑 (core/work_status.py)
- [x] **1.6** FastAPI 应用入口 (main.py) + CORS + 健康检查

### Phase 2: 数据校验 Schema (已跳过，直接在路由中处理)

- [x] 请求参数解析和响应格式化直接在各路由文件中处理

### Phase 3: 服务层 (9 个任务)

- [x] **3.1** RepositoryService
- [x] **3.2** ConfigService
- [x] **3.3** CommitService (含 gap-fill 逻辑、按日期分组、统计聚合)
- [x] **3.4** LogService
- [x] **3.5** DataMetricsConfigService
- [x] **3.6** ScanTaskService
- [x] **3.7** AppSettingService
- [x] **3.8** GitScanService (GitPython)
- [x] **3.9** ScanTaskExecutor

### Phase 4: API 路由 (8 个任务)

- [x] **4.1** 依赖注入 + 路由聚合 (router.py + dependencies.py)
- [x] **4.2** Repositories 路由 (5 个端点)
- [x] **4.3** Commits 路由 (2 个端点)
- [x] **4.4** Statistics 路由 (1 个端点)
- [x] **4.5** Logs 路由 (4 个端点)
- [x] **4.6** Tasks 路由 (9 个端点)
- [x] **4.7** Config 路由 (18 个端点)
- [x] **4.8** 请求日志中间件

### Phase 5: 定时任务 (3 个任务)

- [x] **5.1** 扫描调度器 (scan_scheduler.py)
- [x] **5.2** 数据库备份调度器 (db_backup_scheduler.py)
- [x] **5.3** 集成到应用生命周期

### Phase 6: 完善 (2 个任务)

- [x] **6.1** 优雅关停 + 错误处理
- [ ] **6.2** 前端联调验证

## 已验证通过的 API 端点

- GET /health - 健康检查
- GET /api/v1/repositories - 仓库列表 (snake_case)
- GET /api/v1/repositories/authors - 作者列表
- GET /api/v1/config/repositories - 仓库配置 (camelCase, 含 authors)
- GET /api/v1/commits/by-date - 按日期分组提交
- GET /api/v1/statistics - 统计数据
- GET /api/v1/tasks - 任务列表
- GET /api/v1/logs/server - 服务器日志
- GET /api/v1/config/data-metrics - 工作状态配置
- GET /api/v1/config/backup-config - 备份配置

## 启动方式

### 1. 安装依赖（首次或依赖变更后执行）

```bash
cd python-backend
pip install -e .
```

`pip install -e .` 表示以「可编辑模式」安装当前项目，修改代码后无需重新安装即可生效。

### 2. 启动服务

```bash
# 生产模式
uvicorn app.main:app --host 0.0.0.0 --port 5188

# 开发模式（文件变更自动重启）
uvicorn app.main:app --host 0.0.0.0 --port 5188 --reload
```

**命令说明：**

| 部分 | 含义 |
|------|------|
| `uvicorn` | ASGI 服务器，负责接收 HTTP 请求并转交给 FastAPI 应用处理（类似 Node.js 中的 `tsx` 或 `node` 命令） |
| `app.main:app` | 指向 `app/main.py` 文件中的 `app = FastAPI()` 实例，格式为 `模块路径:变量名` |
| `--host 0.0.0.0` | 监听所有网络接口，允许局域网访问 |
| `--port 5188` | 服务端口，与前端代理配置保持一致 |
| `--reload` | 开发模式下文件变更自动重启服务，生产环境不要加 |
