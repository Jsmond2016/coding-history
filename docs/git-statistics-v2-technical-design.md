# Git 数据工作台 V2 技术方案

## 1. 总体方案

本次以现有 React、Jotai、ahooks、Ant Design 和 Hono 接口为基础，不新增数据库表。后端继续负责日期、仓库、作者和加班模式过滤；关键字和提交类型在当前接口返回结果上进行前端二次过滤。

## 2. 状态模型

### 2.1 Draft Filter

`filterAtom` 保存筛选表单当前值：

```ts
interface FilterState {
  dateRange: [Dayjs, Dayjs]
  repositoryIds: string[]
  authorEmails: string[]
  overtimeMode: OvertimeMode
  keyword: string
  commitTypes: CommitType[]
}
```

### 2.2 Applied Filter

页面组件保存最近一次成功发起查询的筛选快照。结果区、趋势标题和同步弹窗中的“当前筛选日期”均引用 Applied Filter。Draft 与 Applied 不一致时显示待应用提示。

### 2.3 URL

已应用筛选写入以下查询参数：

- `start`、`end`：`YYYY-MM-DD`
- `repos`：逗号分隔仓库 ID
- `authors`：逗号分隔邮箱
- `overtime`：加班模式
- `q`：关键字
- `types`：逗号分隔提交类型

初始化时优先读取 URL；参数无效时回退默认值。

## 3. 查询流程

1. 使用日期、仓库、作者和 `overtimeMode` 请求可见提交数据。
2. 当 `overtimeMode !== all` 时，并行请求相同日期、仓库、作者下的完整日期数据。
3. 对可见提交执行关键字和提交类型过滤，并重建日期分组元数据。
4. 提交汇总和趋势使用过滤后的可见提交。
5. 工作状态使用完整日期数据，避免局部提交导致状态失真。
6. 使用请求序号丢弃过期响应，避免连续查询发生结果覆盖。

## 4. 提交类型识别

按优先级识别：

1. `chore(release)`、`chore: release` -> `release`
2. `Merge ` -> `merge`
3. `feat` -> `feat`
4. `fix` -> `fix`
5. `refactor` -> `refactor`
6. `docs` -> `docs`
7. `chore` -> `chore`
8. 其他 -> `other`

匹配忽略大小写。Merge 与 Release 保留在全部提交和活动规模统计中。

## 5. 组件拆分

- `StatisticsFilter`：Draft Filter 编辑、待应用提示、应用和重置。
- `SyncDataModal`：同步日期与仓库范围确认。
- `StatisticsCards`：当前可见提交汇总。
- `WorkStatusCards`：完整日期工作强度与加班摘要。
- `WorkStatusReport`：补齐日期后的非平滑趋势。
- `CommitsWorkbench`：左侧日期导航和右侧单日时间线。
- `CommitsByDateList`：保留为总览页下钻复用，不再作为工作台主视图。

## 6. 同步流程

- 页面初始化并行加载仓库、作者和主任务。
- 弹窗根据 Draft Filter 展示仓库范围；实际请求传入相同 `repositoryIds`。
- 未选择仓库时不传 `repositoryIds`，后端继续使用主任务集合。
- 同步完成后使用 Applied Filter 重新查询。

## 7. 性能与兼容

- 不修改现有 API 响应结构和数据库结构。
- 日期工作台只渲染当前选中日期的提交，显著减少 DOM 数量。
- 关键字和类型过滤使用 `useMemo`，避免无关状态变化重复计算。
- 趋势最多补齐 2 年约 731 个点，可接受。
- `/data-overview` 继续复用 `CommitsByDateList`，行为不受影响。

## 8. 测试计划

- URL 筛选序列化与恢复。
- Commit 类型识别和关键字匹配。
- 加班提交模式下完整工作状态保持不变。
- 0 提交日期补齐和跨年份唯一日期。
- 同步仓库与日期范围一致。
- 单日 50 条以上提交时只渲染当前日期。
- 桌面和窄屏布局构建检查。
- 前后端 TypeScript 构建与真实接口回归。
