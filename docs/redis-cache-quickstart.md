# Redis 查询缓存快速使用

本文用于在新设备上为 Coding History 后端启用 Redis 查询缓存。

## 1. 前置条件

- 已安装 Docker 和 Docker Compose 插件，或已安装可访问的 Redis 7+。
- 项目依赖已安装：`pnpm install`。
- SQLite 数据库已按项目正常配置。

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

若本机的 6379 端口已被占用，请将第一个端口改为其他端口，例如 `-p 6380:6379`，并在下一步的 `REDIS_URL` 使用 `redis://127.0.0.1:6380`。

## 3. 配置后端

在 `backend/.env` 加入或修改以下配置：

```env
REDIS_ENABLED=true
REDIS_URL=redis://127.0.0.1:6379
REDIS_KEY_PREFIX=coding-history:
```

说明：

- `REDIS_ENABLED` 仅接受 `true` 时启用；其他值或缺省时后端直接查询 SQLite。
- `REDIS_URL` 支持 Redis 标准连接串。远程 Redis 可使用 `redis://:password@host:6379/0`；生产环境应使用 TLS 和受限网络访问。
- `REDIS_KEY_PREFIX` 用于隔离不同环境。建议开发、测试、生产使用不同前缀，例如 `coding-history:dev:`、`coding-history:test:`、`coding-history:prod:`。

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

- Redis 未启动、连接失败或暂时不可用时，后端记录告警后自动回源 SQLite，查询接口仍可用。
- 关闭缓存：设置 `REDIS_ENABLED=false` 并重启后端；已有 Redis Key 会自然过期，不影响 SQLite 数据。
- Docker 日志：`docker logs coding-history-redis`。
- Redis 容器状态：`docker ps --filter name=coding-history-redis`。
- 后端日志出现 `[Redis] cache connection ready` 表示连接成功；`[Redis] unavailable, falling back to SQLite` 表示已降级。

## 7. 已验证结果

在本机 Docker Redis 上，重复请求 `GET /api/v1/statistics`：首次响应约 39ms，第二次约 4ms；Redis 生成了结果缓存 Key，且其 TTL 正常生效。
