# Redis 查询缓存技术方案

## 1. 背景

当前后端使用 SQLite + Prisma。`/statistics`、`/statistics/overview`、`/commits/by-date` 会读取较多提交记录并进行聚合、按日分组和工作状态计算，前端筛选操作会重复发送相同查询。

## 2. 目标与非目标

### 目标

- 缓存常用统计、概览、按日提交和分页提交查询结果。
- Redis 不可用、连接失败或未启用时不影响接口，优先使用 Node 进程内 TTL 缓存，未命中再回源 SQLite。
- 提交数据或指标配置发生变化后，不返回旧的统计结果。
- 不改变现有 API 路径、请求参数和响应结构。

### 非目标

- Redis 不存储提交主数据，不替代 SQLite。
- 不缓存日志、扫描创建和扫描状态接口。
- 本阶段不引入分布式锁、缓存预热或跨机器 Redis 集群。

## 3. 架构

```text
HTTP Route -> CacheService -> Redis (optional)
                    |             |
                    +---------> Prisma/SQLite
```

`CacheService` 负责连接、序列化、TTL、稳定 Key 和异常降级。业务查询仍由 `CommitService` 执行，缓存只包裹查询结果。

## 4. 缓存策略

| 命名空间 | 接口 | TTL |
| --- | --- | ---: |
| `commits` | `/api/v1/statistics` | 300 秒 |
| `commits` | `/api/v1/statistics/overview` | 300 秒 |
| `commits` | `/api/v1/commits/by-date` | 180 秒 |
| `commits` | `/api/v1/commits` | 120 秒 |

查询参数会递归排序数组和对象键，再使用 SHA-256 生成摘要，避免参数顺序导致重复 Key。Key 包含命名空间版本号；失效时递增版本号，不执行 Redis `KEYS`。

## 5. 失效规则

- `CommitService.batchInsertCommits` 实际插入新提交后，递增 `commits` 版本。
- `DataMetricsConfigService.updateConfig` 成功后，递增 `metrics` 和 `commits` 版本。
- 版本失效失败只记录告警，不阻断原有写请求。

## 6. 配置与运行

```env
REDIS_ENABLED=false
REDIS_URL=redis://127.0.0.1:6379
REDIS_KEY_PREFIX=coding-history:
```

生产环境启用时设置 `REDIS_ENABLED=true`。单机开发不要求本地必须安装 Redis，
也不要求安装 `redis-cli`；Redis 不可用或未启用时使用 Node 进程内 TTL 缓存。需要排查缓存时，可使用 Docker 容器内置客户端，或按
[Redis 查询缓存快速使用](./redis-cache-quickstart.md) 安装 macOS 客户端。

## 7. 风险与验证

- 缓存值使用 JSON；当前服务层已将 `BigInt` 转为 number 后再返回，因此不会出现 JSON 序列化异常。
- Redis 网络故障会增加一次连接/超时开销，但查询会降级到 Node 进程内 TTL 缓存并最终回源 SQLite，保证可用性。
- 验证包括 TypeScript 构建、Redis 关闭时接口回源、Redis 开启时重复查询命中，以及写入后结果刷新。

## 8. 实施状态

- 已实现：`CacheService`、四个提交查询接口的缓存包装、提交写入和指标配置更新后的版本失效、环境变量示例。
- 已验证：后端 TypeScript 构建通过；关闭 Redis 后健康检查和统计接口正常使用 Node 缓存并在未命中时回源 SQLite。
- 待部署验证：启用 Redis 后检查同一查询的命中、TTL 过期和扫描写入后的版本失效。

快速配置和验证步骤见 [Redis 查询缓存快速使用](./redis-cache-quickstart.md)。
