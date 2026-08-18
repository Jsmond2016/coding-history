# main 技术方案文档

## 开发分支
`main`

## 方案概览

将 `CommitsWorkbench` 从“选中日期 + 左右分栏”的状态模型改为单列 `Collapse`。以查询结果第一项日期作为受控默认展开项；每个面板直接渲染该日期按上海时间从早到晚排序的提交时间线，保留现有提交卡片和 Hash 复制能力。

## 需求-方案映射
| 需求 ID | 开发方案 | 影响范围 | 验证方式 | 状态 |
| --- | --- | --- | --- | --- |
| R1 | 移除 `selectedDate`、`selectedRepository`、日期侧栏和两个固定高度滚动容器，改为单列 Ant Design `Collapse`。 | `frontend/src/pages/GitStatistics/GitStatisticsList/components/CommitsWorkbench.tsx` | 宽屏与窄屏手动检查仅剩单列日期面板。 | 已验证 |
| R2 | 使用查询结果首个日期初始化并在 `data` 更新时重置展开项；允许折叠面板的正常多开/收起操作。 | 同上 | 首次查询和更新筛选后验证首日默认展开，点击日期头验证展开与收起。 | 已验证 |
| R3 | 复用并调整当前提交条目渲染，日期头显示状态标签、发版、加班数和仓库；每个面板按提交时间升序输出时间线。 | 同上 | 核对提交字段、排序和 Hash 复制；运行前端类型检查或构建。 | 已验证 |

## 技术决策

- 使用 Ant Design `Collapse` 作为唯一的日期浏览容器，避免自定义状态与双滚动区域。
- 使用当前 `CommitsWorkbench` 的时间格式化和提交条目字段，不触碰后端响应与 `Commit` 类型。
- 不复用旧 `CommitsByDateList`，以免改变 `/data-overview` 的既有行为；仅在工作台组件内实现相同的日期折叠交互。
- Redis 仅作为可选查询缓存，SQLite 仍为唯一事实来源；使用官方 `redis` Node 客户端，缓存异常统一降级回源。
- 使用命名空间版本号失效缓存，避免依赖 Redis `KEYS`；查询参数递归规范化并用 SHA-256 生成稳定 Key。
- 统计类查询 TTL 为 300 秒，按日提交 180 秒，分页提交 120 秒；提交写入后统一失效 `commits` 命名空间，指标配置更新同时失效 `metrics` 与 `commits`。

## 实施记录
| 日期 | 代码或方案变更 | 关联需求 | 影响 |
| --- | --- | --- | --- |
| 2026-08-04 | 建立方案，等待确认后实施。 | R1, R2, R3 | 尚未修改产品代码。 |
| 2026-08-04 | 用户确认方案，开始实施。 | R1, R2, R3 | 允许修改工作台组件。 |
| 2026-08-04 | `CommitsWorkbench` 改为单列日期折叠面板，移除日期侧栏、仓库分段切换和固定高度内部滚动。 | R1, R2, R3 | `/git-statistics` 提交明细恢复连续浏览体验。 |
| 2026-08-04 | 用户完成页面人工交互验证。 | R1, R2, R3 | 确认默认展开和折叠行为符合预期。 |
| 2026-08-18 | 新增 `CacheService`，接入 Redis 可选连接、稳定查询 Key、TTL、命名空间版本失效和错误降级。 | R4, R5, R6 | 不改变 API 响应结构；Redis 未启用时直接执行原查询。 |
| 2026-08-18 | 统计、概览、提交查询接入结果缓存；提交批量写入和指标配置更新触发失效。 | R4, R6 | 缓存边界覆盖常用聚合接口。 |
| 2026-08-18 | 新增 Redis 快速使用文档，覆盖 Docker、配置、命中检查和故障降级。 | R7 | 其他设备可按文档完成缓存部署。 |

## 验证结果

- `pnpm --dir frontend build`：通过，包含 TypeScript 检查和 Vite 生产构建。
- 用户已人工验证：默认展开和折叠行为符合预期。
- `pnpm --filter coding-history-backend build`：通过。
- `REDIS_ENABLED=false pnpm --filter coding-history-backend exec tsx src/index.ts`：启动通过；`GET /health` 返回 200，`GET /api/v1/statistics?startDate=0&endDate=4102444800000` 返回现有 SQLite 聚合结果（`totalCommits=185`），确认 Redis 未启用时正确回源。
- 本机没有运行 Redis 实例，Redis 命中、TTL 和版本失效需在部署 Redis 后按 `docs/redis-query-cache-technical-design.md` 的运行验收执行。
