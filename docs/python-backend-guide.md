# Python 后端项目指南

> 面向 Python 初学者的项目教程，从零理解整个后端的架构和每一行代码的含义。

---

## 目录

1. [项目总览](#1-项目总览)
2. [项目配置](#2-项目配置)
3. [应用入口 main.py](#3-应用入口-mainpy)
4. [核心层 core/](#4-核心层-core)
5. [数据模型 models/](#5-数据模型-models)
6. [服务层 services/](#6-服务层-services)
7. [API 路由 api/](#7-api-路由-api)
8. [中间件 middleware/](#8-中间件-middleware)
9. [定时任务 jobs/](#9-定时任务-jobs)
10. [数据流：一个请求的完整旅程](#10-数据流一个请求的完整旅程)
11. [Python 基础概念速查](#11-python-基础概念速查)

---

## 1. 项目总览

### 这个项目做什么？

这是一个 **Git 提交统计后端**，功能包括：

- 扫描本地 Git 仓库的提交记录并存入数据库
- 提供统计数据 API（按日期分组、按仓库统计等）
- 计算工作状态（加班检测、工作量评级）
- 支持定时自动扫描和数据库备份

### 技术栈一览

| 组件 | 用途 | 类比 Node.js |
|------|------|-------------|
| **FastAPI** | Web 框架，接收 HTTP 请求 | Hono / Express |
| **SQLAlchemy 2.0** | ORM，操作数据库 | Prisma |
| **Pydantic** | 数据校验 | Zod |
| **GitPython** | 读取 Git 仓库信息 | simple-git |
| **APScheduler** | 定时任务 | node-cron |
| **loguru** | 日志记录 | pino |
| **uvicorn** | 服务器，运行 Python 应用 | node / tsx |

### 目录结构

```
python-backend/
├── pyproject.toml          # 项目配置文件（相当于 package.json）
├── .env                    # 环境变量（数据库路径、端口等）
├── database/
│   └── coding-history.db   # SQLite 数据库文件
└── app/                    # 所有源代码
    ├── main.py             # 入口文件：创建 FastAPI 应用
    ├── core/               # 核心基础设施
    │   ├── config.py       #   配置管理（读取 .env）
    │   ├── database.py     #   数据库连接
    │   └── logger.py       #   日志配置
    ├── models/             # 数据库表对应的 Python 类（ORM 模型）
    │   ├── repository.py   #   仓库表
    │   ├── commit.py       #   提交记录表
    │   ├── author.py       #   作者表
    │   └── ...             #   其他表
    ├── services/           # 业务逻辑层
    │   ├── repository_service.py   #   仓库相关操作
    │   ├── commit_service.py       #   提交记录相关操作
    │   ├── git_scan_service.py     #   Git 扫描逻辑
    │   └── ...
    ├── api/                # API 路由（接收请求，调用 service）
    │   ├── router.py       #   路由汇总
    │   ├── repositories.py #   /api/v1/repositories 的路由
    │   ├── commits.py      #   /api/v1/commits 的路由
    │   └── ...
    ├── middleware/          # 中间件（每个请求都会经过的处理）
    │   └── request_logging.py  # 请求日志记录
    └── jobs/               # 定时任务
        ├── scan_scheduler.py     #   扫描调度器
        └── db_backup_scheduler.py #   数据库备份调度器
```

### 分层架构

请求的处理遵循 **三层架构**：

```
前端请求
  → API 路由层 (api/)      ← 接收请求，解析参数
  → 服务层 (services/)      ← 业务逻辑
  → 数据模型层 (models/)    ← 操作数据库
```

---

## 2. 项目配置

### pyproject.toml — 项目的「package.json」

```toml
[project]
name = "coding-history-backend"    # 项目名
version = "1.0.0"
requires-python = ">=3.11"         # Python 版本要求
dependencies = [                   # 所有依赖包（相当于 dependencies）
    "fastapi>=0.115,<1",           # Web 框架
    "uvicorn[standard]>=0.30,<1",  # 服务器
    "sqlalchemy[asyncio]>=2.0,<3", # ORM
    "aiosqlite>=0.20,<1",          # SQLite 异步驱动
    # ... 其他依赖
]

[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["app*"]                  # 告诉 setuptools 只打包 app 目录
```

**关键命令：**
- `pip install -e .` — 安装项目及所有依赖（`-e` 表示可编辑模式，改代码不用重装）
- `uvicorn app.main:app --port 5188` — 启动服务器

### .env 文件 — 环境变量

```env
DATABASE_URL=sqlite+aiosqlite:///./database/coding-history.db
PORT=5188
LOG_LEVEL=INFO
```

这些值会被 `core/config.py` 读取。

---

## 3. 应用入口 main.py

这是整个应用的入口，启动命令 `uvicorn app.main:app` 中的 `app.main:app` 就是指这个文件中的 `app` 变量。

### 完整代码解读

```python
from contextlib import asynccontextmanager    # 用于创建生命周期管理器
from fastapi import FastAPI, Request          # FastAPI 框架核心
from fastapi.middleware.cors import CORSMiddleware  # CORS 中间件
from fastapi.responses import JSONResponse    # JSON 响应
from loguru import logger                     # 日志工具

from app.core.config import settings          # 配置（端口、数据库URL等）
from app.core.database import async_session_factory  # 数据库会话工厂
```

**`asynccontextmanager` 是什么？** 它是 Python 的一个装饰器，用来创建"上下文管理器"。简单说就是定义「进入时做什么、退出时做什么」。FastAPI 用它来管理应用的启动和关闭。

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ---- 启动时执行（yield 之前的代码）----

    # 1. 初始化默认设置（如备份目录、定时配置）
    async with async_session_factory() as db:
        from app.services.app_setting_service import AppSettingService
        svc = AppSettingService()
        await svc.init_default_settings(db)
        await db.commit()

    # 2. 启动定时任务调度器
    from app.jobs.scan_scheduler import start_scheduler
    await start_scheduler()

    logger.info("服务器运行在端口 5188")

    yield   # ← 应用在这里运行，等待请求

    # ---- 关闭时执行（yield 之后的代码）----
    from app.jobs.db_backup_scheduler import stop_db_backup_scheduler
    stop_db_backup_scheduler()
```

**`yield` 是什么？** Python 生成器关键字。在这里，`yield` 前面是启动逻辑，后面是关闭逻辑。应用在 yield 处"暂停"，持续运行接收请求，直到收到关闭信号。

```python
# 创建 FastAPI 应用实例
app = FastAPI(
    title="Coding History API",
    version="1.0.0",
    lifespan=lifespan,    # 绑定生命周期管理器
)

# 添加 CORS 中间件（允许前端跨域访问）
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,  # 允许的域名
    allow_credentials=True,
    allow_methods=["*"],    # 允许所有 HTTP 方法
    allow_headers=["*"],    # 允许所有请求头
)

# 全局异常处理：任何未捕获的错误都返回 500 JSON
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Route error: {exc}")
    return JSONResponse(status_code=500, content={"error": str(exc)})

# 健康检查端点
@app.get("/health")
async def health_check():
    return {"status": "ok"}

# 注册所有 API 路由
from app.api.router import api_router
app.include_router(api_router, prefix="/api/v1")
```

---

## 4. 核心层 core/

### 4.1 config.py — 配置管理

使用 `pydantic-settings` 库自动从 `.env` 文件读取配置：

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # 每个字段自动从 .env 文件读取同名变量
    DATABASE_URL: str = "sqlite+aiosqlite:///./database/coding-history.db"
    PORT: int = 5188
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    model_config = {
        "env_file": ".env",           # 从 .env 文件读取
        "env_file_encoding": "utf-8",
    }

# 创建全局单例，其他文件 import settings 即可使用
settings = Settings()
```

**Pydantic 的好处：** 自动类型转换（`.env` 里都是字符串，但 `PORT` 会自动变成 `int`）、自动校验（类型不对会报错）。

### 4.2 database.py — 数据库连接

```python
from sqlalchemy.ext.asyncio import (
    AsyncSession,              # 异步数据库会话
    async_sessionmaker,        # 会话工厂（创建会话的工厂）
    create_async_engine,       # 创建异步引擎
)
from sqlalchemy.orm import DeclarativeBase

# 引擎：管理数据库连接池
engine = create_async_engine(settings.DATABASE_URL, echo=False)

# 会话工厂：用引擎创建数据库会话
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,    # commit 后对象仍然可用
)

# ORM 基类：所有模型类都继承它
class Base(DeclarativeBase):
    pass

# FastAPI 依赖注入：每个请求获取一个数据库会话
async def get_db() -> AsyncSession:
    async with async_session_factory() as session:
        try:
            yield session          # 把 session 交给路由函数
            await session.commit()  # 请求成功后自动提交
        except Exception:
            await session.rollback()  # 出错则回滚
            raise
```

**什么是"异步"？** Python 的异步（`async/await`）类似 JavaScript 的 `Promise`/`async-await`。数据库操作用异步，可以在等待数据库响应时处理其他请求，提高并发能力。

**什么是"依赖注入"？** FastAPI 的 `Depends(get_db)` 会在处理请求前自动调用 `get_db()`，把返回的数据库会话传给路由函数。路由不需要自己创建会话。

### 4.3 logger.py — 日志配置

使用 `loguru` 库，配置三个输出：

```python
from loguru import logger

# 1. 控制台输出（带颜色，方便开发调试）
logger.add(sys.stderr, level=settings.LOG_LEVEL)

# 2. 按天轮转的应用日志
logger.add("logs/app-{time:YYYY-MM-DD}.log", rotation="00:00", retention="30 days")

# 3. 按天轮转的错误日志（只记录 ERROR 级别）
logger.add("logs/error-{time:YYYY-MM-DD}.log", rotation="00:00", retention="30 days", level="ERROR")
```

使用方式：`logger.info("消息")`、`logger.error("错误")`、`logger.warning("警告")`。

---

## 5. 数据模型 models/

模型（Model）是数据库表在 Python 中的映射。每个模型类对应一张数据库表，类的属性对应表的列。

### 5.1 基本结构

以 `repository.py` 为例：

```python
from sqlalchemy import String, Boolean, Integer, BigInteger
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

class Repository(Base):
    __tablename__ = "repositories"    # 对应的数据库表名

    # ---- 列定义 ----
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    path: Mapped[str] = mapped_column(String, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # ---- 关系定义 ----
    commits: Mapped[list["Commit"]] = relationship(back_populates="repository", cascade="all, delete-orphan")
```

**关键概念：**

| 概念 | 说明 |
|------|------|
| `Mapped[str]` | 类型注解，表示这个列存储字符串 |
| `mapped_column(String)` | 定义列的数据库类型 |
| `primary_key=True` | 主键 |
| `nullable=False` | 不允许为空 |
| `relationship()` | 定义表之间的关联关系 |
| `cascade="all, delete-orphan"` | 删除仓库时，关联的提交也一起删除 |

### 5.2 所有模型一览

| 模型 | 表名 | 说明 |
|------|------|------|
| `Repository` | repositories | Git 仓库（id, name, path, enabled） |
| `Commit` | commits | 提交记录（hash, author, date, message, branch） |
| `Author` | authors | 作者（name, email, 绑定到仓库） |
| `ServerLog` | server_logs | 服务器日志（启动、关闭等） |
| `RequestLog` | request_logs | API 请求日志 |
| `ScheduledTaskLog` | scheduled_task_logs | 定时任务执行日志 |
| `ScanTask` | scan_tasks | 扫描任务配置（手动/定时） |
| `DataMetricsConfig` | data_metrics_config | 工作状态指标配置 |
| `AppSetting` | app_settings | 应用设置（键值对） |

### 5.3 注意事项：数据库列名映射

原始数据库是 Node.js/Prisma 创建的，有些列名是 camelCase（如 `overtimeHour`）。Python 模型需要显式映射：

```python
# Python 属性名是 snake_case，但数据库列名是 camelCase
overtime_hour: Mapped[int] = mapped_column("overtimeHour", Integer)
#                ↑ Python 用这个名         ↑ 数据库里实际叫这个名
```

---

## 6. 服务层 services/

服务层包含所有业务逻辑。每个服务类提供一组 `@staticmethod` 方法，接收数据库会话 `db` 作为参数。

### 6.1 为什么用 @staticmethod？

```python
class RepositoryService:
    @staticmethod
    async def get_all_repos(db: AsyncSession) -> list[dict]:
        # ...
```

用 `@staticmethod` 的好处：不需要创建实例就能调用，也不需要维护实例状态。调用方式：

```python
# 直接通过类名调用，传入 db
repos = await RepositoryService.get_all_repos(db)
```

### 6.2 核心服务说明

#### RepositoryService — 仓库 CRUD

```python
class RepositoryService:
    # 查询所有仓库
    get_all_repos(db) -> list[dict]

    # 查询单个仓库
    get_repo_by_id(db, repo_id) -> dict | None

    # 新增或更新仓库（upsert = update + insert）
    upsert_repo(db, repo_id, name, path, enabled=True) -> None

    # 更新扫描信息
    update_repo_scan_info(db, repo_id, last_scan_time, total_commits) -> None
```

#### CommitService — 提交记录查询与统计

```python
class CommitService:
    # 按日期分组查询提交
    get_commits_by_date(db, start_date, end_date, ...) -> dict

    # 分页查询提交
    get_commits(db, start_date, end_date, ..., page, page_size) -> dict

    # 获取统计数据（总提交数、增删行数、按仓库/日期分组）
    get_statistics(db, start_date, end_date, ...) -> dict

    # 批量插入提交（自动去重）
    batch_insert_commits(db, repo_id, commits) -> {"inserted": N, "skipped": M}
```

#### GitScanService — Git 仓库扫描

这个服务是**实例化的**（需要传入仓库路径）：

```python
scanner = GitScanService("/path/to/repo")
commits = await scanner.scan_repository_flat(
    from_date=datetime(2026, 1, 1),
    to_date=datetime(2026, 4, 1),
    author_emails=["user@example.com"],
)
# 返回 list[ScannedCommit]，每个包含 hash、message、date 等
```

它底层调用 `git log` 命令，用 `asyncio.to_thread()` 包裹，避免阻塞事件循环。

#### ConfigService — 配置查询（返回 camelCase）

```python
class ConfigService:
    # 获取所有仓库配置（含作者、提交日期范围），返回 camelCase
    get_all_repos_config(db) -> list[dict]

    # 获取单个仓库配置
    get_repo_config(db, repo_id) -> dict | None

    # 获取启用的仓库列表
    get_enabled_repos(db) -> list[dict]

    # 获取仓库的作者邮箱列表
    get_author_emails_by_repo_id(db, repo_id) -> list[str]
```

**为什么 ConfigService 返回 camelCase 而 RepositoryService 返回 snake_case？**

因为前端的「配置管理」页面和「仓库列表」页面是不同模块，使用了不同的字段命名约定。这是从 Node.js 后端迁移时保持的兼容性。

### 6.3 返回 dict 而不是 ORM 对象

所有 service 方法都把 ORM 对象转成 `dict` 返回：

```python
@staticmethod
def _to_dict(repo: Repository) -> dict:
    return {
        "id": repo.id,
        "name": repo.name,
        "path": repo.path,
        # ...
    }
```

**为什么？** ORM 对象依赖数据库会话（session 关闭后就无法访问），而 dict 是纯 Python 对象，可以安全传递。FastAPI 会自动把 dict 转成 JSON 返回给前端。

---

## 7. API 路由 api/

### 7.1 router.py — 路由汇总

```python
from fastapi import APIRouter
from app.api.repositories import repositories_router
from app.api.commits import commits_router
# ... 其他路由

api_router = APIRouter()
api_router.include_router(repositories_router, prefix="/repositories", tags=["repositories"])
api_router.include_router(commits_router, prefix="/commits", tags=["commits"])
# ... 其他路由
```

最终在 `main.py` 中注册：`app.include_router(api_router, prefix="/api/v1")`

所以完整路径是 `/api/v1/repositories`、`/api/v1/commits` 等。

### 7.2 路由写法示例

以 `repositories.py` 为例：

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db

repositories_router = APIRouter()

@repositories_router.get("")          # GET /api/v1/repositories
async def list_repositories(
    db: AsyncSession = Depends(get_db),  # ← 依赖注入，自动获取数据库会话
):
    from app.services.repository_service import RepositoryService

    svc = RepositoryService()
    repos = await svc.get_all_repos(db)   # 调用 service 获取数据
    return repos                           # FastAPI 自动转成 JSON

@repositories_router.post("/scan")    # POST /api/v1/repositories/scan
async def trigger_scan(body: dict, db: AsyncSession = Depends(get_db)):
    start_date = body.get("startDate")
    # ... 处理逻辑
```

**关键模式：**
1. `@router.get("")` / `@router.post("")` — 定义 HTTP 方法和路径
2. `Depends(get_db)` — 获取数据库会话
3. `body: dict` — FastAPI 自动解析请求体为字典
4. `return {...}` — FastAPI 自动序列化为 JSON

### 7.3 Query 参数

GET 请求的参数通过 `Query()` 定义：

```python
from fastapi import Query

@commits_router.get("/by-date")
async def get_commits_by_date(
    startDate: int = Query(..., description="开始日期（毫秒时间戳）"),
    endDate: int = Query(..., description="结束日期（毫秒时间戳）"),
    repositoryIds: str | None = Query(None, description="逗号分隔的仓库ID"),
    db: AsyncSession = Depends(get_db),
):
    # ...
```

`Query(...)` 中的 `...` 表示必填参数，`Query(None)` 表示可选参数。

### 7.4 所有 API 端点

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | /health | 健康检查 |
| GET | /api/v1/repositories | 仓库列表 |
| GET | /api/v1/repositories/authors | 所有作者 |
| POST | /api/v1/repositories/scan | 触发手动扫描 |
| GET | /api/v1/repositories/scan/status | 扫描状态 |
| GET | /api/v1/commits/by-date | 按日期分组提交 |
| GET | /api/v1/commits | 分页查询提交 |
| GET | /api/v1/statistics | 统计数据 |
| GET | /api/v1/logs/server | 服务器日志 |
| GET | /api/v1/logs/request | 请求日志 |
| GET | /api/v1/logs/scheduled-task | 定时任务日志 |
| DELETE | /api/v1/logs/clean | 清理旧日志 |
| GET | /api/v1/tasks | 任务列表 |
| POST | /api/v1/tasks | 创建任务 |
| PUT | /api/v1/tasks/{task_id} | 更新任务 |
| DELETE | /api/v1/tasks/{task_id} | 删除任务 |
| POST | /api/v1/tasks/{task_id}/enable | 启用任务 |
| POST | /api/v1/tasks/{task_id}/disable | 禁用任务 |
| POST | /api/v1/tasks/{task_id}/execute | 执行任务 |
| POST | /api/v1/tasks/batch-sort | 批量排序 |
| GET | /api/v1/config/repositories | 仓库配置（camelCase） |
| POST | /api/v1/config/repositories | 创建仓库 |
| PUT | /api/v1/config/repositories/{repo_id} | 更新仓库 |
| DELETE | /api/v1/config/repositories/{repo_id} | 删除仓库 |
| GET | /api/v1/config/repositories/{repo_id}/authors | 仓库作者 |
| POST | /api/v1/config/repositories/{repo_id}/authors | 添加作者 |
| PUT | /api/v1/config/repositories/{repo_id}/authors/{author_id} | 更新作者 |
| DELETE | /api/v1/config/repositories/{repo_id}/authors/{author_id} | 删除作者 |
| GET | /api/v1/config/data-metrics | 工作状态配置 |
| PUT | /api/v1/config/data-metrics | 更新工作状态配置 |
| GET | /api/v1/config/backup-config | 备份配置 |
| PUT | /api/v1/config/backup-config | 更新备份配置 |
| POST | /api/v1/config/database/backup | 手动触发备份 |
| POST | /api/v1/config/scan-filesystem | 扫描文件系统 Git 仓库 |

---

## 8. 中间件 middleware/

中间件是每个请求都会经过的处理层，类似 Node.js 的中间件机制。

### RequestLoggingMiddleware

```python
from starlette.middleware.base import BaseHTTPMiddleware

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        # 1. 记录请求开始时间
        start = time.time()

        # 2. 放行请求，获取响应
        response = await call_next(request)

        # 3. 计算耗时
        duration = int((time.time() - start) * 1000)  # 毫秒

        # 4. 异步写入数据库（不阻塞响应）
        asyncio.create_task(self._log_to_db(...))

        return response
```

**`asyncio.create_task()` 是什么？** 创建一个"后台任务"。请求已经返回给前端了，但日志写入在后台继续执行。这样不会拖慢响应速度。

在 `main.py` 中注册：
```python
app.add_middleware(RequestLoggingMiddleware)
```

---

## 9. 定时任务 jobs/

### 9.1 scan_scheduler.py — 扫描调度器

使用 APScheduler 库，从数据库读取启用的定时任务，按 cron 表达式执行：

```python
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

async def start_scheduler():
    scheduler = BackgroundScheduler(timezone="Asia/Shanghai")

    # 从数据库读取所有启用的定时任务
    db_tasks = await task_service.get_enabled_scheduled_tasks(db)

    for task in db_tasks:
        trigger = CronTrigger.from_crontab(task["cronExpression"])
        scheduler.add_job(callback, trigger=trigger)

    scheduler.start()
```

**为什么用 BackgroundScheduler？** APScheduler 在后台线程运行，不会阻塞 FastAPI 的主事件循环。

### 9.2 db_backup_scheduler.py — 数据库备份调度器

使用 Python 标准库 `sqlite3` 的 `backup()` 方法，安全地备份数据库：

```python
import sqlite3

source_conn = sqlite3.connect("coding-history.db")
dest_conn = sqlite3.connect("backup.db")
source_conn.backup(dest_conn)    # 原子备份，不会出现数据不一致
```

---

## 10. 数据流：一个请求的完整旅程

以 `GET /api/v1/repositories` 为例：

```
1. 前端发送请求
   GET /api/v1/repositories

2. uvicorn 接收请求，交给 FastAPI

3. CORS 中间件检查跨域权限
   ↓
4. RequestLoggingMiddleware 记录请求信息
   ↓
5. 路由匹配：/api/v1 + /repositories → list_repositories()
   ↓
6. Depends(get_db) 创建数据库会话
   ↓
7. 调用 RepositoryService.get_all_repos(db)
   ↓
8. SQLAlchemy 执行 SQL：SELECT * FROM repositories ORDER BY name
   ↓
9. SQLite 数据库返回结果
   ↓
10. ORM 对象转成 dict 列表
   ↓
11. FastAPI 把 dict 序列化为 JSON
   ↓
12. get_db 自动 commit（数据写入类请求）
   ↓
13. 中间件记录请求日志（异步后台写入）
   ↓
14. JSON 响应返回给前端
```

---

## 11. Python 基础概念速查

### 类型注解

```python
name: str = "hello"                   # 字符串
count: int = 0                        # 整数
enabled: bool = True                  # 布尔值
items: list[str] = []                 # 字符串列表
config: dict[str, Any] = {}           # 字典（键是字符串，值是任意类型）
result: str | None = None             # 可以是字符串或 None（相当于 TypeScript 的 string | null）
```

### async/await

```python
async def fetch_data():          # 定义异步函数
    result = await db.execute()  # 等待异步操作完成
    return result

# 调用异步函数
data = await fetch_data()
```

类比 JavaScript：和 JS 的 `async/await` 几乎一模一样。

### f-string 格式化

```python
name = "world"
msg = f"hello {name}"           # → "hello world"
```

### 上下文管理器 (with/as)

```python
async with async_session_factory() as session:
    # session 在这个代码块内可用
    result = await session.execute(query)
# 离开代码块后，session 自动关闭
```

### 解包 **kwargs

```python
params = {"name": "test", "path": "/tmp"}
await svc.update_config(db, **params)
# 等价于：
# await svc.update_config(db, name="test", path="/tmp")
```

### 导入方式

```python
# 导入整个模块
import time
time.time()

# 导入特定对象（推荐）
from loguru import logger
logger.info("hello")

# 延迟导入（避免循环依赖）
# 在函数内部导入，而不是文件顶部
async def my_route():
    from app.services.repository_service import RepositoryService
    svc = RepositoryService()
```

---

## 快速上手

```bash
# 1. 进入项目目录
cd python-backend

# 2. 安装依赖
pip install -e .

# 3. 启动开发服务器（带热重载）
uvicorn app.main:app --host 0.0.0.0 --port 5188 --reload

# 4. 访问 API 文档（FastAPI 自动生成）
# 浏览器打开 http://localhost:5188/docs
```

FastAPI 自带的 Swagger 文档页面（`/docs`）可以查看所有 API 并在线测试，非常方便调试。

---

## 常见问题

**Q: 修改代码后需要重启吗？**
加 `--reload` 参数会自动重启，不加则需要手动重启。

**Q: 如何添加新的 API 端点？**
1. 在 `services/` 添加业务逻辑方法
2. 在 `api/` 对应路由文件添加路由函数
3. 如果是新模块，在 `api/router.py` 注册新路由

**Q: 数据库表结构在哪里看？**
`app/models/` 目录下每个文件对应一张表。

**Q: 日志文件在哪里？**
`python-backend/logs/` 目录，按天分割，保留 30 天。
