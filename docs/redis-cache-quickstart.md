# Redis 查询缓存快速使用

本文用于在新设备上为 Coding History 后端启用 Redis 查询缓存。

> **先看这里：`redis-cli` 不是项目运行依赖。**
>
> 后端只需要能够连接 Redis；单机开发不要求启用 Redis，也不要求本机安装 Redis 或
> `redis-cli`。如果使用本文的 Docker 方案，可以直接执行容器内置的
> `docker exec coding-history-redis redis-cli ...`。单独安装 macOS 版 `redis-cli`
> 的价值主要在于：不进入容器即可查看 Key、TTL、连接状态和缓存内容，调试更方便。

> `pnpm start` 和 `pnpm restart` 默认会尝试启动 `redis-server`，并使用 `redis-cli ping` 做健康检查。
> 这两个命令启动的是 Redis 服务，不是“启动 redis-cli”客户端；如果本机没有对应命令，脚本会在日志中告警，后端自动降级到 Node 进程内 TTL 缓存。
> `pnpm stop`、`pnpm delete` 和 `pnpm reset` 只会关闭由本项目创建并记录在 `backend/.runtime/redis.pid` 的 Redis 实例，不会关闭用户手工启动的 Redis。
> 如需跳过自动启动，在 `backend/.env` 设置 `REDIS_AUTOSTART=false`。

## macOS 安装 `redis-cli`（可选）

### 方式一：Homebrew 安装 Redis 工具链（推荐）

Homebrew 的 `redis` 公式会同时安装 `redis-cli` 和 Redis 服务端。即使项目使用
Docker 运行 Redis，也可以只把它当作本机调试客户端使用，不需要启动本机 Redis 服务。

```bash
# 如果还没有 Homebrew，请先按官方文档安装
brew --version

brew install redis
redis-cli --version
```

如果希望完全使用本机 Redis，而不是 Docker，再启动 Homebrew 服务：

```bash
brew services start redis
brew services info redis
redis-cli ping
```

停止本机服务：

```bash
brew services stop redis
```

### 方式二：只安装 `redis-cli`

如果不需要本机 Redis 服务，只想安装客户端，可使用 Redis 官方安装脚本：

```bash
curl -fsSL https://packages.redis.io/redis-cli/install.sh | sh
redis-cli --version
```

安装脚本的具体落盘路径和 PATH 配置以脚本输出为准；如果终端提示找不到命令，重新打开终端，或将脚本提示的目录加入 `~/.zshrc` 后执行 `source ~/.zshrc`。

## `redis-cli` 基础命令

以下命令假设 Redis 在本机 `127.0.0.1:6379`，并且使用本文 Docker 配置启动：

```bash
# 查看客户端版本
redis-cli --version

# 测试连接
redis-cli -h 127.0.0.1 -p 6379 ping

# 进入交互模式
redis-cli -h 127.0.0.1 -p 6379
```

进入交互模式后，可执行：

```text
PING
INFO server
DBSIZE
SCAN 0 MATCH coding-history:* COUNT 100
TTL <缓存 Key>
GET <缓存 Key>
QUIT
```

常用的一次性命令：

```bash
# 扫描本项目缓存 Key（不要使用 KEYS * 处理生产实例）
redis-cli -h 127.0.0.1 -p 6379 --scan --pattern 'coding-history:*'

# 查看某个 Key 的剩余 TTL
redis-cli -h 127.0.0.1 -p 6379 TTL '<缓存 Key>'

# 查看 JSON 缓存内容
redis-cli -h 127.0.0.1 -p 6379 GET '<缓存 Key>'
```

如果 Redis 使用密码，优先通过环境变量传递，避免把密码写进 shell 历史：

```bash
REDISCLI_AUTH='你的密码' redis-cli -h 127.0.0.1 -p 6379 ping
```

远程 Redis 也可以直接使用连接串：

```bash
redis-cli -u 'redis://:你的密码@主机:6379/0' ping
```

> 不要在共享终端、日志或文档中记录真实密码。`DEL`、`FLUSHDB`、`FLUSHALL` 等写入或清理命令可能造成数据丢失，执行前请确认目标实例和数据库。

## 1. 前置条件

- 已安装 Docker 和 Docker Compose 插件，或已安装可访问的 Redis 7+。
- 项目依赖已安装：`pnpm install`。
- SQLite 数据库已按项目正常配置。
- `redis-cli` **可选**：使用 Docker 时可直接调用容器内的客户端；只有需要在宿主机上频繁排查缓存时才建议按上文安装。

## 2. 使用 Docker 启动 Redis

```bash
docker run -d \
  --name coding-history-redis \
  --restart unless-stopped \
  -p 6379:6379 \
  redis:7-alpine \
  redis-server --appendonly yes
```

确认 Redis 可用：

```bash
docker exec coding-history-redis redis-cli ping
```

预期输出：`PONG`。

如果已经在 macOS 安装了宿主机版 `redis-cli`，也可以直接验证 Docker 暴露的端口：

```bash
redis-cli -h 127.0.0.1 -p 6379 ping
```

若本机的 6379 端口已被占用，请将第一个端口改为其他端口，例如 `-p 6380:6379`，并在下一步的 `REDIS_URL` 使用 `redis://127.0.0.1:6380`。

## 3. 配置后端

在 `backend/.env` 加入或修改以下配置：

```env
REDIS_ENABLED=true
REDIS_URL=redis://127.0.0.1:6379
REDIS_KEY_PREFIX=coding-history:
```

说明：

- `REDIS_ENABLED` 仅接受 `true` 时连接 Redis；其他值或 Redis 不可用时使用 Node 进程内 TTL 缓存，未命中再查询 SQLite。
- `REDIS_URL` 支持 Redis 标准连接串。远程 Redis 可使用 `redis://:password@host:6379/0`；生产环境应使用 TLS 和受限网络访问。
- `REDIS_KEY_PREFIX` 用于隔离不同环境。建议开发、测试、生产使用不同前缀，例如 `coding-history:dev:`、`coding-history:test:`、`coding-history:prod:`。
- `REDIS_AUTOSTART` 控制 `pnpm start/restart` 是否自动启动本机 `redis-server`，默认是 `true`；设为 `false` 可跳过。

重启后端使配置生效：

```bash
pnpm dev:backend
```

或使用生产进程管理命令：

```bash
pnpm restart
```

## 4. 缓存的请求

以下只读接口会使用 Redis 结果缓存，接口的请求和响应格式不变：

| 请求 | TTL | 缓存命名空间 |
| --- | ---: | --- |
| `GET /api/v1/statistics` | 300 秒 | `commits` |
| `GET /api/v1/statistics/overview` | 300 秒 | `commits` |
| `GET /api/v1/commits/by-date` | 180 秒 | `commits` |
| `GET /api/v1/commits` | 120 秒 | `commits` |

查询参数会按稳定顺序生成 Key。因此仓库 ID、作者邮箱的传参顺序不同，仍会命中同一条缓存。

提交扫描写入新记录后会失效 `commits` 命名空间；更新数据指标配置后也会失效相关提交查询缓存。下一次读取会自动重新查询 SQLite 并写入新的缓存版本。

## 5. 快速验证

先请求两次同一统计接口：

```bash
curl -s -o /dev/null -w '%{http_code} %{time_total}\n' \
  'http://127.0.0.1:5188/api/v1/statistics?startDate=0&endDate=4102444800000'
```

第二次通常比第一次更快。确认 Redis Key：

```bash
docker exec coding-history-redis redis-cli --scan \
  --pattern 'coding-history:*'
```

检查某个结果缓存的剩余有效期：

```bash
docker exec coding-history-redis redis-cli TTL '<缓存 Key>'
```

TTL 返回大于 `0` 的整数表示缓存有效；`-2` 表示 Key 不存在，`-1` 表示 Key 没有过期时间。

## 6. 降级与排障

- Redis 未启动、连接失败或暂时不可用时，后端记录告警后优先使用 Node 进程内 TTL 缓存；缓存未命中时再查询 SQLite，查询接口仍可用。
- `pnpm start` / `pnpm restart` 找不到 `redis-cli` 或 `redis-server` 时，脚本会输出 `[Redis] WARNING`；后端改用 Node 进程内 TTL 缓存，进程重启后缓存会清空。
- 关闭 Redis：设置 `REDIS_ENABLED=false` 并重启后端；后端仍会使用 Node 进程内 TTL 缓存，已有 Redis Key 会自然过期，不影响 SQLite 数据。
- 跳过 Redis 服务自动启动：设置 `REDIS_AUTOSTART=false`；这不会关闭或修改已有 Redis 实例。
- Docker 日志：`docker logs coding-history-redis`。
- Redis 容器状态：`docker ps --filter name=coding-history-redis`。
- 后端日志出现 `[Redis] cache connection ready` 表示连接成功；`[Redis] unavailable, falling back to SQLite` 表示已降级。

## 7. 已验证结果

在本机 Docker Redis 上，重复请求 `GET /api/v1/statistics`：首次响应约 39ms，第二次约 4ms；Redis 生成了结果缓存 Key，且其 TTL 正常生效。

## 官方参考

- [Redis：在 macOS 安装 Redis](https://redis.io/docs/latest/operate/oss_and_stack/install/archive/install-redis/install-redis-on-mac-os/)
- [Redis：只安装 `redis-cli`](https://redis.io/docs/latest/operate/oss_and_stack/install/install-stack/install-redis-cli/)
- [Homebrew：redis 公式](https://formulae.brew.sh/formula/redis)
