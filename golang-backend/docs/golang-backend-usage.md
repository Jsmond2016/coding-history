# Go 后端使用说明

本文档介绍如何编译、配置和运行 Go 后端。

---

## 前置条件

- **Go 1.22+**（推荐 1.25+）
- **Git**（用于仓库扫描）
- **SQLite**（由 Go 驱动内置，无需单独安装）

### 检查 Go 版本

```bash
go version
# 应输出 go version go1.25.x 或更高
```

如果 Go 版本过低或未安装：

```bash
# macOS (Homebrew)
brew install go

# 或使用官方安装包
# https://go.dev/dl/
```

---

## 快速开始

### 1. 进入项目目录

```bash
cd golang-backend/
```

### 2. 安装依赖

```bash
go mod tidy
```

> 首次运行会下载所有依赖包，可能需要几分钟。依赖列表在 `go.mod` 文件中。

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 数据库路径（相对于 golang-backend/ 目录）
DATABASE_URL=file:../database/coding-history.db

# 日志级别：trace/debug/info/warn/error
LOG_LEVEL=info

# 数据库备份的 cron 表达式（默认每周五 19:00）
DB_BACKUP_CRON=0 19 * * 5

# 备份目录（留空则使用默认目录 golang-backend/db-backup/）
DB_BACKUP_DIR=

# 服务端口
PORT=5188
```

### 4. 编译并运行

```bash
# 方式一：使用 Make
make run

# 方式二：直接用 Go 命令
go run ./cmd/server/

# 方式三：先编译再运行
go build -o server ./cmd/server/
./server
```

### 5. 验证服务

```bash
curl http://localhost:5188/health
# 返回: {"status":"ok"}
```

---

## API 端点一览

所有 API 前缀：`http://localhost:5188/api/v1`

### 仓库管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/repositories` | 获取所有仓库 |
| GET | `/repositories/authors` | 获取所有作者（已废弃） |
| GET | `/repositories/:id` | 获取单个仓库 |
| POST | `/repositories/scan` | 触发手动扫描 |
| GET | `/repositories/scan/status` | 获取扫描状态 |

### 提交记录

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/commits/by-date` | 按日期分组查询提交 |
| GET | `/commits` | 分页查询提交（旧接口） |

### 统计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/statistics` | 获取聚合统计 |

### 日志

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/logs/server` | 查询服务器日志 |
| GET | `/logs/request` | 查询请求日志 |
| GET | `/logs/scheduled-task` | 查询定时任务日志 |
| POST | `/logs/clean` | 清理旧日志 |

### 扫描任务

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/tasks` | 获取所有任务 |
| GET | `/tasks/default` | 获取默认任务模板 |
| GET | `/tasks/:id` | 获取任务详情 |
| POST | `/tasks` | 创建任务 |
| PUT | `/tasks/:id` | 更新任务 |
| DELETE | `/tasks/:id` | 删除任务 |
| POST | `/tasks/:id/enable` | 启用任务 |
| POST | `/tasks/:id/disable` | 禁用任务 |
| POST | `/tasks/:id/trigger` | 手动触发任务 |
| POST | `/tasks/batch-sort` | 批量更新排序 |

### 配置管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/config/scan-directory` | 扫描目录查找 Git 仓库 |
| GET | `/config/repositories` | 获取仓库配置（含作者） |
| POST | `/config/repositories/batch` | 批量创建仓库 |
| POST | `/config/repositories` | 创建仓库 |
| PUT | `/config/repositories/:id` | 更新仓库 |
| DELETE | `/config/repositories/:id` | 删除仓库 |
| POST | `/config/repositories/batch-delete` | 批量删除仓库 |
| GET | `/config/repositories/:id/authors` | 获取仓库作者 |
| POST | `/config/repositories/:id/authors` | 添加作者 |
| DELETE | `/config/repositories/:id/authors/:authorId` | 删除作者 |
| GET | `/config/data-metrics` | 获取工作状态配置 |
| PUT | `/config/data-metrics` | 更新工作状态配置 |
| POST | `/config/database/backup` | 手动备份数据库 |
| GET | `/config/backup-config` | 获取备份配置 |
| PUT | `/config/backup-config` | 更新备份配置 |

### 健康检查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |

---

## API 调用示例

### 添加仓库

```bash
curl -X POST http://localhost:5188/api/v1/config/repositories \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-project",
    "name": "My Project",
    "path": "/Users/me/projects/my-project",
    "enabled": true
  }'
```

### 添加作者

```bash
curl -X POST http://localhost:5188/api/v1/config/repositories/my-project/authors \
  -H "Content-Type: application/json" \
  -d '{
    "name": "张三",
    "email": "zhangsan@example.com",
    "isDefault": true
  }'
```

### 扫描目录查找 Git 仓库

```bash
curl -X POST http://localhost:5188/api/v1/config/scan-directory \
  -H "Content-Type: application/json" \
  -d '{"rootPath": "/Users/me/projects"}'
```

### 触发手动扫描

```bash
# 扫描近 2 周（时间戳为毫秒）
START=$(($(date -v-14d +%s) * 1000))
END=$(($(date +%s) * 1000))

curl -X POST http://localhost:5188/api/v1/repositories/scan \
  -H "Content-Type: application/json" \
  -d "{\"startDate\": $START, \"endDate\": $END}"
```

### 查询扫描状态

```bash
curl http://localhost:5188/api/v1/repositories/scan/status
```

### 按日期查询提交

```bash
curl "http://localhost:5188/api/v1/commits/by-date?startDate=1706745600000&endDate=1709251200000"
```

### 获取统计数据

```bash
curl "http://localhost:5188/api/v1/statistics?startDate=1706745600000&endDate=1709251200000"
```

---

## 常用 Make 命令

```bash
make build    # 编译为 server 二进制
make run      # 编译并运行
make clean    # 删除编译产物
make test     # 运行测试
make deps     # 安装/更新依赖
```

---

## 与前端配合使用

### 方式一：前端代理到 Go 后端

确保 Go 后端运行在 `localhost:5188`，前端开发服务器的 Vite 配置已有代理设置。

```bash
# 终端 1：启动 Go 后端
cd golang-backend
go run ./cmd/server/

# 终端 2：启动前端
cd frontend
pnpm dev
```

前端会自动将 `/api/v1/*` 请求代理到 Go 后端。

### 方式二：修改前端代理端口

如果 Go 后端使用不同端口，编辑 `frontend/vite.config.ts` 中的 proxy 配置。

---

## 数据库说明

### 数据库文件位置

默认在 `../database/coding-history.db`（相对于 `golang-backend/` 目录），与 Node.js 版共享同一个数据库。

### 数据库兼容性

Go 后端使用 GORM AutoMigrate，会自动创建缺失的表和列。它与 Node.js 版的数据库完全兼容，可以切换使用。

### 数据库备份

备份配置通过 API 管理：

```bash
# 查看备份配置
curl http://localhost:5188/api/v1/config/backup-config

# 更新备份目录
curl -X PUT http://localhost:5188/api/v1/config/backup-config \
  -H "Content-Type: application/json" \
  -d '{"backupDir": "/path/to/backups"}'

# 手动触发备份
curl -X POST http://localhost:5188/api/v1/config/database/backup
```

---

## 环境变量参考

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_URL` | `file:../database/coding-history.db` | SQLite 数据库路径 |
| `PORT` | `5188` | HTTP 服务端口 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `DB_BACKUP_CRON` | `0 19 * * 5` | 数据库备份 cron（每周五 19:00） |
| `DB_BACKUP_DIR` | `db-backup/` | 备份目录路径 |

---

## 常见问题

### 1. 编译报错 `package crypto/sha3 is not in std`

Go 版本过低。需要 Go 1.22 或更高版本：

```bash
go version  # 确认版本
brew upgrade go  # macOS 升级
```

### 2. 编译报错 `cgo: C compiler not found`

SQLite 驱动 (`mattn/go-sqlite3`) 使用 CGo，需要 C 编译器：

```bash
# macOS（通常自带 clang，如果没有）
xcode-select --install
```

### 3. 数据库锁定错误

SQLite 不支持高并发写入。Go 后端已设置 `MaxOpenConns=1` 和 `busy_timeout=5000` 来避免此问题。

### 4. Git 扫描返回 0 条提交

检查：
- 仓库路径是否正确（绝对路径）
- 是否已添加作者（author email 必须与 Git 提交中的 email 匹配）
- 仓库是否启用

### 5. 前端无法连接后端

- 确认 Go 后端已启动：`curl http://localhost:5188/health`
- 确认端口正确（默认 5188）
- 确认 CORS 配置允许 `http://localhost:5173`
