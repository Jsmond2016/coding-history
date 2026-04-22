# Go 后端项目教程

本文档面向 Go 语言初学者，从架构到功能、从目录到文件逐一讲解 Go 后端的实现。

---

## 目录

1. [项目概览](#1-项目概览)
2. [技术栈](#2-技术栈)
3. [项目目录结构](#3-项目目录结构)
4. [入口与启动流程](#4-入口与启动流程)
5. [配置层 (config)](#5-配置层-config)
6. [数据库层 (database + model)](#6-数据库层)
7. [数据传输对象 (dto)](#7-数据传输对象-dto)
8. [业务服务层 (service)](#8-业务服务层-service)
9. [Git 辅助层 (githelper)](#9-git-辅助层-githelper)
10. [工作状态计算 (workstatus)](#10-工作状态计算-workstatus)
11. [HTTP 处理层 (handler)](#11-http-处理层-handler)
12. [中间件 (middleware)](#12-中间件-middleware)
13. [路由层 (router)](#13-路由层-router)
14. [定时任务 (scheduler)](#14-定时任务-scheduler)
15. [核心业务流程](#15-核心业务流程)

---

## 1. 项目概览

这是一个 **Git 提交统计应用** 的后端服务，核心功能是：

- 扫描本地 Git 仓库的提交记录
- 将提交数据存储到 SQLite 数据库
- 提供按日期分组的提交统计 API
- 自动判断工作状态（轻松/正常/忙碌/疯狂/加班）
- 支持定时扫描和数据库备份

前端通过 HTTP API 与后端交互，所有接口前缀为 `/api/v1`。

---

## 2. 技术栈

| 组件 | 选型 | 说明 |
|------|------|------|
| HTTP 框架 | **Gin** (`github.com/gin-gonic/gin`) | Go 最流行的 Web 框架，性能好、生态丰富 |
| ORM | **GORM** (`gorm.io/gorm`) | Go 最流行的数据库 ORM，支持自动建表 |
| 数据库 | **SQLite** (`gorm.io/driver/sqlite`) | 轻量级文件数据库，无需安装数据库服务 |
| Git 操作 | **os/exec** (标准库) | 直接调用 git 命令行，行为与 Node.js 版一致 |
| 定时任务 | **robfig/cron/v3** | Go 标准 cron 库，支持 5 段 cron 表达式 |
| 配置管理 | **godotenv** | 从 `.env` 文件加载环境变量 |
| 日志 | **slog** (标准库) | Go 1.21+ 内置的结构化日志 |

### Go 核心概念速查

| 概念 | 说明 |
|------|------|
| `package` | Go 的代码组织单元，同一目录下的文件必须属于同一个 package |
| `import` | 导入其他包，标准库直接用名，第三方用完整路径 |
| `struct` | 结构体，类似其他语言中的 class，用字段组合数据 |
| `interface` | 接口，定义行为契约，Go 通过隐式实现（鸭子类型） |
| `goroutine` | 轻量级线程，用 `go func()` 启动 |
| `指针` | `*T` 是指向 T 的指针，`&x` 取 x 的地址 |
| `首字母大小写` | 大写 = 公开（其他包可访问），小写 = 私有 |

---

## 3. 项目目录结构

```
golang-backend/
├── cmd/
│   └── server/
│       └── main.go                 # 程序入口
├── internal/                       # 私有代码（其他项目不能 import）
│   ├── config/                     # 配置加载
│   │   └── config.go
│   ├── database/                   # 数据库初始化
│   │   └── database.go
│   ├── model/                      # 数据库模型（9 个）
│   │   ├── repository.go           # 仓库
│   │   ├── commit.go               # 提交记录
│   │   ├── author.go               # 作者
│   │   ├── server_log.go           # 服务器日志
│   │   ├── request_log.go          # 请求日志
│   │   ├── scheduled_task_log.go   # 定时任务日志
│   │   ├── scan_task.go            # 扫描任务
│   │   ├── data_metrics_config.go  # 数据指标配置
│   │   └── app_setting.go          # 应用设置
│   ├── dto/                        # 数据传输对象（6 个）
│   │   ├── repository_dto.go       # 仓库相关请求/响应
│   │   ├── commit_dto.go           # 提交相关请求/响应
│   │   ├── statistics_dto.go       # 统计相关
│   │   ├── task_dto.go             # 任务相关
│   │   ├── log_dto.go              # 日志相关
│   │   └── config_dto.go           # 配置相关
│   ├── service/                    # 业务服务层（9 个）
│   │   ├── repository_service.go   # 仓库 CRUD
│   │   ├── commit_service.go       # 提交记录服务
│   │   ├── config_service.go       # 配置聚合服务
│   │   ├── git_scan_service.go     # Git 扫描服务
│   │   ├── scan_task_service.go    # 扫描任务 CRUD
│   │   ├── scan_task_executor.go   # 扫描任务执行器
│   │   ├── log_service.go          # 日志服务
│   │   ├── data_metrics_config_service.go  # 数据指标配置
│   │   └── app_setting_service.go  # 应用设置服务
│   ├── handler/                    # HTTP 处理器（7 个）
│   │   ├── health_handler.go       # 健康检查
│   │   ├── repositories_handler.go # 仓库接口
│   │   ├── commits_handler.go      # 提交记录接口
│   │   ├── statistics_handler.go   # 统计接口
│   │   ├── logs_handler.go         # 日志接口
│   │   ├── tasks_handler.go        # 任务接口
│   │   └── config_handler.go       # 配置接口
│   ├── middleware/                  # 中间件（3 个）
│   │   ├── cors.go                 # 跨域处理
│   │   ├── request_logger.go       # 请求日志
│   │   └── error_recovery.go       # 错误恢复
│   ├── router/                     # 路由注册
│   │   └── router.go
│   ├── scheduler/                  # 定时任务（2 个）
│   │   ├── scan_scheduler.go       # 扫描调度器
│   │   └── db_backup_scheduler.go  # 数据库备份调度器
│   ├── githelper/                  # Git 命令封装
│   │   └── git.go
│   └── workstatus/                 # 工作状态计算
│       └── workstatus.go
├── pkg/                            # 可被外部使用的工具包
│   └── response/
│       └── response.go             # 统一响应格式
├── go.mod                          # Go 模块定义
├── go.sum                          # 依赖校验
├── .env.example                    # 环境变量模板
├── .gitignore
└── Makefile                        # 构建脚本
```

### 为什么这样分层？

```
请求流程：HTTP 请求 → Router → Middleware → Handler → Service → Model/Database
                                                ↓
                                           DTO（请求/响应转换）
```

- **Handler**：接收 HTTP 请求，参数校验，调用 Service，返回响应
- **Service**：纯业务逻辑，不依赖 HTTP 框架
- **Model**：数据库表映射，定义字段和约束
- **DTO**：前后端数据格式转换（JSON tag 控制字段名）

---

## 4. 入口与启动流程

**文件：** `cmd/server/main.go`

```go
func main() {
    // 1. 加载配置（从 .env 文件）
    cfg := config.Load()

    // 2. 初始化数据库（GORM 连接 SQLite，自动建表）
    db, err := database.Init(cfg)

    // 3. 初始化默认数据（工作状态配置、应用设置）
    dataMetricsSvc.InitDefaultConfig()
    settingSvc.InitDefaultSettings(...)

    // 4. 启动定时任务（扫描调度器、数据库备份调度器）
    scanScheduler.Start()
    backupScheduler.Start()

    // 5. 设置路由（注册所有 API 端点）
    r := router.SetupRouter(db, cfg, scanScheduler, backupScheduler)

    // 6. 启动 HTTP 服务器
    srv := &http.Server{Addr: ":5188", Handler: r}
    srv.ListenAndServe()

    // 7. 优雅关闭（收到 SIGINT/SIGTERM 时停止服务）
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
}
```

### Go 特有概念说明

- **`:=` 短变量声明**：`cfg := config.Load()` 等价于声明并赋值
- **`&` 取地址**：`&http.Server{...}` 创建结构体并取其指针
- **`go func()`**：启动一个 goroutine（轻量线程），不阻塞当前函数
- **`defer`**：延迟执行，函数返回时才运行（类似 finally）
- **错误处理**：Go 没有 try/catch，通过返回 `error` 值处理错误

---

## 5. 配置层 (config)

**文件：** `internal/config/config.go`

从环境变量（或 `.env` 文件）加载应用配置：

```go
type Config struct {
    Port         int    // 服务器端口，默认 5188
    DatabaseURL  string // 数据库路径，如 file:../database/coding-history.db
    LogLevel     string // 日志级别：info/debug/warn/error
    DBBackupCron string // 数据库备份的 cron 表达式
    DBBackupDir  string // 备份目录
}
```

**Go 知识点：**
- `godotenv.Load()` 读取 `.env` 文件到环境变量
- `os.Getenv("KEY")` 获取环境变量
- 结构体标签（struct tag）在 Go 中不用，但在 DTO 中用 `` `json:"name"` `` 控制 JSON 序列化

---

## 6. 数据库层

### 数据库初始化

**文件：** `internal/database/database.go`

```go
func Init(cfg *config.Config) (*gorm.DB, error) {
    // 打开 SQLite 数据库（启用 WAL 模式提升并发性能）
    db, err := gorm.Open(sqlite.Open(dsn+"?_journal_mode=WAL"), &gorm.Config{})

    // 自动建表（如果表不存在就创建）
    db.AutoMigrate(&model.Repository{}, &model.Commit{}, /* ... */)

    // 设置连接池
    sqlDB.SetMaxOpenConns(1) // SQLite 只允许一个写连接
}
```

### 数据模型

**文件：** `internal/model/*.go`

每个模型对应数据库中的一张表。以 `Commit` 为例：

```go
type Commit struct {
    ID           int64   `gorm:"primaryKey;autoIncrement"`
    RepoID       string  `gorm:"column:repo_id;uniqueIndex:idx_repo_hash"`
    CommitHash   string  `gorm:"column:commit_hash;uniqueIndex:idx_repo_hash"`
    AuthorName   string  `gorm:"column:author_name"`
    CommitDate   int64   `gorm:"column:commit_date"`
    Message      string
    FilesChanged int     `gorm:"column:files_changed;default:0"`
    Insertions   int     `gorm:"default:0"`
    Deletions    int     `gorm:"default:0"`
    Branch       *string // *string 表示可为 NULL
    CreatedAt    int64   `gorm:"column:created_at"`
}

func (Commit) TableName() string { return "commits" }
```

**GORM 标签说明：**
- `gorm:"primaryKey"` — 主键
- `gorm:"column:repo_id"` — 数据库列名（Go 用驼峰，数据库用下划线）
- `gorm:"uniqueIndex:idx_repo_hash"` — 唯一索引（repo_id + commit_hash 组合唯一）
- `*string` — Go 中用指针表示可空字段，nil = 数据库中的 NULL
- `TableName()` — 指定数据库表名

**9 个模型对应 9 张表：**

| 模型 | 表名 | 用途 |
|------|------|------|
| Repository | repositories | Git 仓库信息 |
| Commit | commits | 提交记录（核心数据） |
| Author | authors | 仓库关联的作者 |
| ServerLog | server_logs | 服务器启停日志 |
| RequestLog | request_logs | HTTP 请求日志 |
| ScheduledTaskLog | scheduled_task_logs | 定时任务执行日志 |
| ScanTask | scan_tasks | 扫描任务配置 |
| DataMetricsConfig | data_metrics_config | 工作状态阈值配置 |
| AppSetting | app_settings | 键值对应用设置 |

**时间戳约定：** 所有时间字段存储为 `int64`（毫秒级 Unix 时间戳），与前端 JS 的 `Date.now()` 一致。

---

## 7. 数据传输对象 (dto)

**文件：** `internal/dto/*.go`

DTO（Data Transfer Object）用于定义 API 的请求和响应格式。通过 JSON 标签控制字段名：

```go
// 请求：创建仓库
type CreateRepositoryRequest struct {
    ID      string `json:"id" binding:"required"`    // binding:"required" 表示必填
    Name    string `json:"name" binding:"required"`
    Path    string `json:"path" binding:"required"`
    Enabled *bool  `json:"enabled"`                   // *bool 可以为 null
}

// 响应：仓库配置
type RepositoryConfig struct {
    ID           string          `json:"id"`           // 前端看到的字段名
    Name         string          `json:"name"`
    Authors      []AuthorConfig  `json:"authors"`
    TotalCommits int             `json:"totalCommits"` // camelCase 匹配前端
}
```

**为什么需要 DTO？**
- 数据库字段名（snake_case）和前端期望的 JSON 字段名（camelCase）不同
- 不是所有数据库字段都需要暴露给前端
- 请求参数需要校验规则（`binding:"required"` 等）

---

## 8. 业务服务层 (service)

这是最核心的层，包含所有业务逻辑。每个 Service 接收 `*gorm.DB` 作为依赖：

```go
type RepositoryService struct {
    db *gorm.DB
}

func NewRepositoryService(db *gorm.DB) *RepositoryService {
    return &RepositoryService{db: db}
}
```

**Go 知识点：** 这是 **构造函数注入** 模式。`NewXxx` 是 Go 中创建结构体的惯用命名。

### 8.1 RepositoryService — 仓库 CRUD

```go
// 获取所有仓库
func (s *RepositoryService) GetAllRepositories() ([]model.Repository, error) {
    var repos []model.Repository
    err := s.db.Order("name ASC").Find(&repos).Error
    return repos, err
}
```

`(s *RepositoryService)` 是 Go 的 **方法接收器**，类似其他语言的 `this/self`。

### 8.2 CommitService — 提交记录服务（最复杂）

核心方法：

| 方法 | 功能 |
|------|------|
| `GetCommitsByDate` | 按日期分组查询提交，计算工作状态 |
| `GetCommits` | 分页查询提交记录（旧接口） |
| `GetStatistics` | 聚合统计（总数、按仓库、按日期） |
| `BatchInsertCommits` | 批量插入提交（按 hash 去重） |
| `GetMaxCommitDateMsForRepo` | 获取仓库最新提交时间 |
| `ResolveScanFromDateWithGapFill` | 计算扫描起点（补洞逻辑） |

**按日期分组查询** 是最核心的逻辑：

```
1. 从数据库查询时间范围内的所有提交
2. 获取工作状态配置（阈值、加班时间）
3. 判断每条提交是否加班（小时 >= 19:00）
4. 按日期分组，同一天同一 hash 去重
5. 计算每天的工作状态、加班数、发版检测
6. 按 isOvertime 参数筛选日期
7. 按日期降序排列返回
```

### 8.3 ConfigService — 配置聚合

组合多个服务，提供完整的仓库配置（包含作者列表、提交时间范围）。

### 8.4 GitScanService — Git 扫描

封装 Git 操作，提供两种扫描模式：

- **Flat 扫描**（`ScanRepositoryFlat`）：`git log --all`，跨所有分支
- **分支扫描**（`ScanRepository`）：逐分支扫描，优先未上线分支名
- **增量扫描**（`IncrementalScan`）：从指定日期开始的 flat 扫描

### 8.5 ScanTaskService — 扫描任务 CRUD

管理扫描任务的增删改查，包含默认任务同步逻辑（确保每个仓库都有对应的手动任务）。

### 8.6 ScanTaskExecutor — 扫描执行器

完整的扫描流水线：

```
1. 根据任务类型计算日期范围（1天/3天/7天/...）
2. 获取启用的仓库列表
3. 对每个仓库：
   a. 获取作者邮箱列表
   b. git pull 更新代码
   c. 计算扫描起点（考虑数据空洞）
   d. 执行 git log 扫描
   e. 批量插入提交（去重）
   f. 更新仓库扫描信息
4. 记录任务执行日志
```

### 8.7 LogService — 日志服务

服务器日志、请求日志、定时任务日志的增删查，以及旧日志清理。

### 8.8 DataMetricsConfigService — 数据指标配置

管理工作状态阈值、标签文本、颜色配置。默认值：轻松(<6)、正常(6-10)、忙碌(10-15)、疯狂(15-20)、加班(>=19:00)。

### 8.9 AppSettingService — 应用设置

键值对存储，管理备份目录和 cron 表达式。

---

## 9. Git 辅助层 (githelper)

**文件：** `internal/githelper/git.go`

封装 `git` 命令行操作。Go 通过 `os/exec` 包执行外部命令：

```go
func ScanRepositoryFlat(repoPath string, opts LogOptions) ([]ScannedCommit, error) {
    // 构造 git log 命令参数
    args := []string{"-C", repoPath, "log", "--pretty=format:...", "--all"}

    // 执行命令
    cmd := exec.Command("git", args...)
    output, err := cmd.CombinedOutput()

    // 解析输出为结构化的提交列表
    return parseLogOutput(string(output)), nil
}
```

**为什么用 `os/exec` 而不是 Go 的 Git 库？**
- Node.js 版使用 `simple-git`（也是封装 git CLI）
- Go 的 `go-git` 纯 Go 实现有大仓库性能问题
- 不支持 `--perl-regexp` 等高级特性
- 直接调用 git CLI 保证行为完全一致

**提供的功能：**

| 函数 | 对应 Git 命令 |
|------|--------------|
| `ScanRepositoryFlat` | `git log --all` |
| `ScanBranch` | `git log <branch>` |
| `EnrichDiffStats` | `git diff --stat <hash>^ <hash>` |
| `CheckIsRepo` | `git rev-parse --is-inside-work-tree` |
| `Pull` | `git pull` |
| `GetAllBranches` | `git branch` + `git branch -r` |
| `RevParse` | `git rev-parse` |
| `IsAncestor` | `git merge-base --is-ancestor` |

---

## 10. 工作状态计算 (workstatus)

**文件：** `internal/workstatus/workstatus.go`

根据提交数量和是否加班判断工作状态：

```
有加班 + >= 20 次 → 超级疯狂加班
有加班 + < 20 次  → 加班
无加班 + < 6 次   → 轻松
无加班 + < 10 次  → 正常
无加班 + < 15 次  → 忙碌
无加班 + >= 15 次 → 疯狂
```

加班判断：提交时间的本地小时 >= `overtimeHour`（默认 19，即 19:00 之后）

---

## 11. HTTP 处理层 (handler)

**文件：** `internal/handler/*.go`

每个 Handler 对应一组 API 端点。以 `CommitsHandler` 为例：

```go
type CommitsHandler struct {
    db        *gorm.DB
    commitSvc *service.CommitService
}

// GET /api/v1/commits/by-date
func (h *CommitsHandler) GetCommitsByDate(c *gin.Context) {
    // 1. 解析查询参数
    startDate, _ := strconv.ParseInt(c.Query("startDate"), 10, 64)

    // 2. 调用 Service
    result, err := h.commitSvc.GetCommitsByDate(...)

    // 3. 返回 JSON 响应
    c.JSON(200, result)
}
```

**Gin 框架核心概念：**
- `*gin.Context` — 请求上下文，包含请求和响应信息
- `c.Query("key")` — 获取 URL 查询参数
- `c.ShouldBindJSON(&req)` — 解析请求体 JSON 到结构体（含校验）
- `c.JSON(200, data)` — 返回 JSON 响应
- `c.Param("id")` — 获取 URL 路径参数

**7 个 Handler 覆盖 33 个端点：**

| Handler | 端点数 | 功能 |
|---------|--------|------|
| HealthHandler | 1 | `GET /health` |
| RepositoriesHandler | 5 | 仓库列表、详情、扫描、扫描状态 |
| CommitsHandler | 2 | 按日期分组、分页查询 |
| StatisticsHandler | 1 | 聚合统计 |
| LogsHandler | 4 | 三种日志查询 + 清理 |
| TasksHandler | 10 | 任务 CRUD + 启用/禁用/触发/排序 |
| ConfigHandler | 10 | 仓库配置、作者、数据指标、备份 |

---

## 12. 中间件 (middleware)

**中间件** 是在请求到达 Handler 之前/之后执行的逻辑。

### CORS 中间件 (`cors.go`)

处理浏览器跨域请求。前端在 `localhost:5173`，后端在 `localhost:5188`，需要 CORS 才能通信。

```go
func CORS() gin.HandlerFunc {
    return func(c *gin.Context) {
        c.Header("Access-Control-Allow-Origin", "http://localhost:5173")
        c.Next() // 继续处理请求
    }
}
```

### 请求日志中间件 (`request_logger.go`)

记录每个 API 请求的方法、URL、状态码、耗时到数据库。

### 错误恢复中间件 (`error_recovery.go`)

捕获 panic 防止服务崩溃，返回 500 错误。

---

## 13. 路由层 (router)

**文件：** `internal/router/router.go`

将 Handler 方法绑定到 URL 路径：

```go
func SetupRouter(db *gorm.DB, ...) *gin.Engine {
    r := gin.New()

    // 全局中间件
    r.Use(middleware.ErrorRecovery())
    r.Use(middleware.CORS())
    r.Use(middleware.RequestLogger(db))

    // 健康检查
    r.GET("/health", healthHandler.Check)

    // API v1 路由组
    v1 := r.Group("/api/v1")
    repos := v1.Group("/repositories")
    repos.GET("/", reposHandler.GetAll)
    repos.POST("/scan", reposHandler.TriggerScan)
    // ... 更多路由

    return r
}
```

**Gin 路由分组：** `r.Group("/api/v1")` 创建路由组，所有子路由自动加上 `/api/v1` 前缀。

---

## 14. 定时任务 (scheduler)

### 扫描调度器 (`scan_scheduler.go`)

使用 `robfig/cron` 从数据库加载定时任务，按 cron 表达式执行：

```go
func (s *ScanScheduler) Start() {
    tasks := taskSvc.GetEnabledScheduledTasks() // 从数据库读取
    for _, task := range tasks {
        s.cron.AddFunc(*task.CronExpression, func() {
            ExecuteScanTask(s.db, task, &task.ID)  // 执行扫描
        })
    }
    s.cron.Start()
}
```

### 数据库备份调度器 (`db_backup_scheduler.go`)

定期将 SQLite 文件复制到备份目录。

---

## 15. 核心业务流程

### 扫描流程

```
用户点击「同步」
       ↓
POST /api/v1/repositories/scan {startDate, endDate}
       ↓
Handler: 设置扫描状态为「扫描中」
       ↓
启动 goroutine 异步执行：
       ↓
  ┌─ 对每个启用的仓库 ─────────────────────┐
  │  1. 获取作者邮箱列表                      │
  │  2. git pull 更新代码                     │
  │  3. 计算有效扫描起点（考虑空洞）           │
  │  4. 执行 git log --all --since --until   │
  │  5. 解析输出为 ScannedCommit 列表         │
  │  6. 对每条提交执行 git diff --stat        │
  │  7. 批量插入数据库（按 hash 去重）        │
  │  8. 更新仓库扫描信息                      │
  └─────────────────────────────────────────┘
       ↓
设置扫描状态为「已完成」
```

### 查询流程

```
前端打开统计页面
       ↓
GET /api/v1/commits/by-date?startDate=...&endDate=...
       ↓
Handler: 解析查询参数
       ↓
CommitService.GetCommitsByDate:
  1. 查询时间范围内所有提交（JOIN 仓库名）
  2. 获取工作状态配置
  3. 判断每条提交是否加班
  4. 按日期分组，去重
  5. 计算每天的工作状态
  6. 按日期降序排列
       ↓
返回 JSON 给前端
```

---

## Go 与 Node.js 对比

| 概念 | Node.js | Go |
|------|---------|-----|
| 异步 | `async/await` | `goroutine` + `go func()` |
| 错误处理 | `try/catch` | 返回 `error` 值 |
| 空值 | `null/undefined` | `nil`（指针的零值） |
| 导出 | `module.exports` | 大写字母开头 = 公开 |
| 包管理 | `npm/pnpm` | `go mod` |
| 类型系统 | TypeScript (可选) | 编译时强制 |
| 并发 | 单线程事件循环 | 多 goroutine 并行 |
| ORM | Prisma | GORM |
| HTTP | Hono | Gin |
| 验证 | Zod | Gin binding tags |
