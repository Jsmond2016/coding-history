# 数据采集流程 V2 技术方案

## 1. 方案状态

- 版本：v2.0（已确认）
- 日期：2026-07-15
- 2026-07-15 已确认进入实施。

## 2. 设计目标

1. 以数据源、扫描计划、扫描执行替代当前仓库配置与手动/定时任务混合模型。
2. 消除读取接口副作用和系统自动生成的单仓库手动任务。
3. 在扫描前完成路径和作者校验，在扫描后提供可查询的运行结果。
4. 保持现有 Commit 数据和统计页面兼容。

## 3. 数据模型

### 3.1 Repository

保留现有表，建议增加：

```prisma
model Repository {
  // existing fields
  normalizedPath String? @unique @map("normalized_path")
  lastSuccessScanTime BigInt? @map("last_success_scan_time")
  lastScanRunId Int? @map("last_scan_run_id")
}
```

`normalizedPath` 使用 `realpath`、去除末尾分隔符后生成，用于阻止同一路径重复添加。

### 3.2 Author

保留现有多作者关系。`isDefault` 进入废弃状态：

- 新 UI 不再展示和写入默认作者。
- 扫描仍使用仓库下全部作者邮箱。
- 后续迁移确认无调用后删除字段。

### 3.3 ScanTask -> ScanPlan

短期复用 `scan_tasks` 表，产品和代码统一改称 Scan Plan：

- 新建记录固定 `taskType = scheduled`。
- `isPrimary` 迁移为 `isDefault` 语义，短期可继续复用字段，接口不再自动改其他属性。
- 定时计划禁止 `scanRangeType = custom`。
- `repositoryIds` 必填且非空。

中期迁移建议将表改名为 `scan_plans`，移除 `taskType`、`startDate`、`endDate` 和 `sortOrder`。

### 3.4 ScanRun

新增统一执行表：

```prisma
model ScanRun {
  id                Int     @id @default(autoincrement())
  planId            Int?    @map("plan_id")
  triggerSource     String  @map("trigger_source") // manual | scheduled
  status            String  // queued | running | success | partial | failed
  requestedRepoIds  String  @map("requested_repo_ids")
  rangeStart        BigInt  @map("range_start")
  rangeEnd          BigInt  @map("range_end")
  startedAt         BigInt? @map("started_at")
  finishedAt        BigInt? @map("finished_at")
  insertedCommits   Int     @default(0) @map("inserted_commits")
  skippedCommits    Int     @default(0) @map("skipped_commits")
  errorMessage      String? @map("error_message")
  createdAt         BigInt  @map("created_at")
  results           ScanRunRepository[]
}

model ScanRunRepository {
  id              Int     @id @default(autoincrement())
  runId           Int     @map("run_id")
  repoId          String  @map("repo_id")
  status          String  // success | skipped | failed
  insertedCommits Int     @default(0) @map("inserted_commits")
  skippedCommits  Int     @default(0) @map("skipped_commits")
  errorMessage    String? @map("error_message")
  startedAt       BigInt? @map("started_at")
  finishedAt      BigInt? @map("finished_at")
  run             ScanRun @relation(fields: [runId], references: [id], onDelete: Cascade)
}
```

现有 `ScheduledTaskLog` 暂时保留用于兼容日志页，新执行器可双写一个版本，稳定后迁移日志查询至 ScanRun。

## 4. 后端服务拆分

### 4.1 RepositoryInspectionService

职责：

- 规范化和验证路径。
- 判断是否为 Git 仓库。
- 读取仓库基础信息。
- 从 `git log --all` 聚合作者姓名、邮箱、提交数量和最近提交时间。
- 不写数据库。

作者发现默认读取最近 2,000 条提交；允许用户触发全历史发现。

### 4.2 DataSourceService

职责：

- 在事务中保存仓库和作者。
- 计算数据源准备状态。
- 检查计划覆盖和最近执行结果。
- 停用数据源但不删除计划关系。

### 4.3 ScanPlanService

由现有 `ScanTaskService` 演进：

- 只管理定时计划。
- `listPlans` 为只读，不调用 `syncDefaultRepositoryTasks`。
- `setDefaultPlan` 只更新默认标记。
- 创建和更新时校验仓库启用、作者完整、Cron 有效、窗口合法。
- 任何计划变化后重载调度器。

### 4.4 ScanRunService

职责：

- 创建 queued 运行。
- 获取仓库级互斥锁。
- 更新 running 和逐仓库结果。
- 汇总 success、partial、failed。
- 提供运行列表和详情查询。

现有 `executeScanTask` 改为接收明确的运行参数，不依赖 Task 类型：

```ts
executeScanRun({
  runId,
  repositoryIds,
  rangeStart,
  rangeEnd,
  triggerSource,
  planId,
})
```

## 5. API 设计

### 5.1 仓库检查与作者发现

```text
POST /api/v1/data-sources/inspect-directory
POST /api/v1/data-sources/inspect-repository
GET  /api/v1/data-sources/:id/discovered-authors
POST /api/v1/data-sources/setup
GET  /api/v1/data-sources
PUT  /api/v1/data-sources/:id
POST /api/v1/data-sources/:id/enable
POST /api/v1/data-sources/:id/disable
DELETE /api/v1/data-sources/:id
```

`setup` 请求示例：

```json
{
  "repositories": [
    {
      "id": "repo-a",
      "name": "repo-a",
      "path": "/code/repo-a",
      "authors": [
        { "name": "User", "email": "user@example.com" }
      ]
    }
  ],
  "firstScan": { "enabled": true, "rangeType": "1month" },
  "defaultPlan": { "addRepositories": true }
}
```

服务端先完成全部路径、重复、作者和计划校验，再通过事务保存。首次扫描在事务提交后创建 ScanRun。

### 5.2 扫描计划

```text
GET    /api/v1/scan-plans
POST   /api/v1/scan-plans
PUT    /api/v1/scan-plans/:id
DELETE /api/v1/scan-plans/:id
POST   /api/v1/scan-plans/:id/enable
POST   /api/v1/scan-plans/:id/disable
POST   /api/v1/scan-plans/:id/set-default
POST   /api/v1/scan-plans/:id/run
GET    /api/v1/scan-plans/:id/next-runs
```

`set-default` 只更新默认标记，不修改计划其他字段。

### 5.3 扫描执行

```text
POST /api/v1/scan-runs
GET  /api/v1/scan-runs
GET  /api/v1/scan-runs/:id
```

手动扫描统一调用 `POST /scan-runs`。响应返回 `202 Accepted` 和 `runId`，前端每 2 秒查询运行详情，完成后停止。

## 6. 前端方案

### 6.1 数据源页

新增组件：

- `DataSourceReadinessSummary`：总数、正常、待配置、异常。
- `DataSourceTable`：状态驱动的列表和操作。
- `DataSourceSetupWizard`：添加方式、仓库校验、作者选择、完成方式。
- `AuthorDiscoverySelector`：作者发现和逐仓库覆盖。
- `ManualScanModal`：统一的手动扫描弹窗。

使用 Ant Design Steps、Table、Result、Alert 和 Drawer/Modal。向导中间状态保存在页面内，离开前提示未保存更改。

### 6.2 扫描计划页

新增组件：

- `ScanPlanSummary`：启用计划、覆盖数据源、下一次执行、最近失败。
- `ScanPlanTable`：业务化计划列表。
- `ScanPlanForm`：仓库、频率、窗口、启用和默认设置。
- `ScheduleBuilder`：预设与高级 Cron。
- `ScanRunList` / `ScanRunDrawer`：执行列表和逐仓库结果。

计划列表不再加载或展示手动任务，不再支持拖拽排序。

### 6.3 系统设置

将当前备份弹窗迁移到 `/config` 的“系统维护”页签，表单直接展示当前备份目录和备份计划，保存后显示明确生效状态。

## 7. 迁移策略

### 阶段一：兼容改造

1. 新增 ScanRun 表和只读数据源状态接口。
2. 停止在仓库创建、更新和任务列表读取时调用 `syncDefaultRepositoryTasks`。
3. 新扫描计划接口只返回 `taskType = scheduled`。
4. 旧 `/tasks` API 暂时保留供回滚。
5. 旧手动任务保留在数据库但从新 UI 隐藏。

### 阶段二：默认计划迁移

1. 选取当前 `isPrimary = true` 的定时任务作为默认扫描计划。
2. 若无默认计划，创建一个禁用状态的“默认扫描计划草稿”，由用户确认后启用。
3. 不自动修改现有 Cron、窗口和仓库范围。

### 阶段三：历史任务清理

1. 提供旧手动任务审计列表。
2. 识别系统生成任务：单仓库、manual、名称等于仓库名、描述符合旧模板。
3. 用户确认后批量归档或删除。
4. 无确认不自动删除，避免误处理用户自定义任务。

## 8. 并发与一致性

- 使用进程内仓库锁作为第一阶段实现；同仓库同时只能存在一个 running 扫描。
- 后续多实例部署时升级为数据库锁或唯一 running 约束。
- 计划调度与手动扫描均通过 ScanRunService，避免两套扫描状态。
- `lastSuccessScanTime` 只在仓库扫描成功后更新；没有新提交也算成功扫描。
- 当前执行器只在有提交时更新 `lastScanTime`，V2 必须修正。

## 9. 安全与校验

- 仓库路径必须通过 `realpath`，并验证目录和 `.git`。
- Cron 使用 `cron-parser` 校验并生成未来执行时间。
- 扫描计划只能选择准备完成的数据源。
- 删除数据源前查询关联计划、提交数量和运行记录，前端展示影响摘要。
- 所有写操作使用 Zod 结构校验，错误返回可操作的中文信息。

## 10. 测试方案

### 单元测试

- 路径规范化、Git 仓库校验和重复识别。
- 作者聚合与邮箱去重。
- 数据源状态机。
- Cron 预设转换、校验和未来执行时间。
- ScanRun 状态汇总与部分成功。

### 集成测试

- setup 事务失败时不产生半配置数据。
- 无作者仓库不能扫描或加入计划。
- 列表 GET 不产生数据库写入。
- 设置默认计划不修改其他字段。
- 同仓库并发扫描被拒绝或排队。
- 手动和定时运行都生成一致的 ScanRun 记录。

### 前端验收

- 从空配置到首次扫描可以在一个向导内完成。
- 作者可从发现列表选择并逐仓库覆盖。
- 数据源状态与下一步操作一致。
- 普通计划设置不需要输入 Cron。
- 执行详情能定位具体失败仓库和原因。

## 11. 推荐实施顺序

1. 修复现有任务模型不变量和 GET 副作用。
2. 新增 ScanRun 数据模型与统一执行服务。
3. 新增仓库检查、作者发现和数据源状态接口。
4. 重写数据源管理页和新增向导。
5. 重写扫描计划页和执行记录。
6. 迁移默认计划，隐藏旧手动任务。
7. 将统计页同步入口切换到 ScanRun API。
8. 回归统计、日志、调度和数据库备份。

## 12. 需要确认的技术取舍

1. 同意新增 `ScanRun`、`ScanRunRepository` 两张表。
2. 同意短期复用 `scan_tasks` 保存定时计划，后续再改表名。
3. 同意旧手动任务先隐藏、不自动删除。
4. 同意作者发现默认读取最近 2,000 条提交。
5. 同意第一阶段使用单进程内仓库锁，暂不引入队列服务。

补充确认：首次扫描使用近 1 个月窗口，日常快速同步默认近 3 天；扫描范围属于每次 ScanRun，不再依赖持久化手动任务。
