# Git 提交记录统计系统 - 需求文档

## 版本信息
- **文档版本**: v1.0
- **创建日期**: 2025-11-21
- **最后更新**: 2025-11-28

---

## 1. 项目概述

### 1.1 项目背景
开发一个 Git 提交记录统计系统，用于追踪和分析多个 Git 仓库的提交记录，帮助开发者了解自己的编码工作状态和加班情况。

### 1.2 核心功能
- 多仓库 Git 提交记录扫描和存储
- 按日期分组展示提交记录
- 工作状态自动判断
- 加班记录识别和统计

---

## 2. 功能需求

### 2.1 数据展示功能

#### 2.1.1 按日期分组展示
**需求描述**：
- 提交记录需要按日期分组展示
- 每个日期使用折叠面板（Collapse）展示
- 默认展开第一天的数据

**展示内容**：
- 日期（格式：YYYY年MM月DD日 dddd）
- 当天总提交数
- 工作状态标签
- 加班提醒标签（如有）

#### 2.1.2 按仓库 Tab 分组展示
**需求描述**：
- 每个日期下，不同仓库使用 Tab 组件分组展示
- 每个 Tab 显示仓库名称和该仓库的提交数量
- 默认激活第一个仓库的 Tab

**展示内容**：
- Tab 标题：仓库名称 + (提交数量)
- Tab 内容：该仓库当天的所有提交记录
- 超过 10 条记录时，内容区域可滚动（最大高度 600px）

#### 2.1.3 提交记录详情展示
**需求描述**：
每条提交记录需要展示以下信息：
- Commit Hash（前 7 位，code 样式）
- 提交时间（HH:mm:ss 格式，蓝色高亮显示）
- 提交信息（commit message）
- 文件变更数量
- 代码行数变更（新增/删除，绿色/红色显示）
- 加班标签（如为加班提交，显示红色"加班"标签）

**样式要求**：
- 每条记录使用左侧边框线分隔
- 提交时间颜色：`#1890ff`（蓝色），字体粗细：500
- 新增代码行数：绿色（`#52c41a`）
- 删除代码行数：红色（`#ff4d4f`）

---

### 2.2 工作状态判断功能

#### 2.2.1 工作状态规则
**需求描述**：
系统需要根据每天多仓库合并提交次数和加班情况，自动判断工作状态。

**判断规则**：

| 提交次数 | 是否有加班（19:00后） | 工作状态 | 标签颜色 |
|---------|---------------------|---------|---------|
| < 6 次 | 否 | 悠闲 | 绿色 |
| 6-10 次 | 否 | 正常 | 蓝色 |
| 10-15 次 | 否 | 忙碌 | 橙色 |
| 15-20 次 | 否 | 疯狂 | 红色 |
| ≥ 20 次 | 否 | 疯狂 | 红色 |
| < 20 次 | 是 | 加班 | 红色 |
| ≥ 20 次 | 是 | 超级疯狂加班 | 洋红色 |

**优先级说明**：
- 如果存在 19:00 后的提交记录，优先显示加班相关状态
- 提交次数 ≥ 20 次且存在加班记录时，显示"超级疯狂加班"

#### 2.2.2 工作状态配置
**需求描述**：
工作状态判断规则需要支持配置化，便于后续调整。

**配置文件位置**：`backend/src/config/workStatus.config.ts`

**配置项**：
```typescript
{
  thresholds: {
    relaxed: 6,      // 悠闲阈值
    normal: 10,      // 正常阈值
    busy: 15,        // 忙碌阈值
    superCrazy: 20  // 超级疯狂阈值
  },
  overtimeHour: 19  // 加班时间阈值（小时）
}
```

#### 2.2.3 工作状态展示
**需求描述**：
- 在日期面板头部显示工作状态标签
- 标签颜色根据状态类型自动设置
- 标签文本使用中文显示

---

### 2.3 加班记录功能

#### 2.3.1 加班识别规则
**需求描述**：
- 提交时间 ≥ 19:00 的提交记录判定为加班
- 每个提交记录包含 `isOvertime` 字段标识是否为加班提交
- 加班提交在列表中显示红色"加班"标签

#### 2.3.2 加班统计展示
**需求描述**：
- 日期面板头部显示当天加班提交数量
- 如有加班记录，显示"又加班 (X次)"标签
- Hover 标签时，显示最晚的 5 个加班提交时间点

**展示格式**：
```
又加班 (2次) [红色标签，带时钟图标]
Hover 提示：
加班提交时间：
• 20:30
• 19:15
```

---

### 2.4 筛选功能

#### 2.4.1 日期范围筛选
**需求描述**：
- 支持选择日期范围进行筛选
- 默认筛选条件：最近一个月
- 提供快速选择选项：
  - 最近一周
  - 最近一个月
  - 最近三个月
  - 最近半年
  - 最近一年
- 时间范围不能超过 2 年

#### 2.4.2 仓库筛选
**需求描述**：
- 支持多选仓库进行筛选
- 默认选择全部仓库
- 下拉框支持搜索和清除

#### 2.4.3 加班筛选
**需求描述**：
- 支持按是否加班进行筛选
- 选项：
  - 全部：显示所有提交
  - 仅加班：只显示 19:00 后的提交
  - 非加班：只显示 19:00 前的提交

#### 2.4.4 重置功能
**需求描述**：
- 提供"重置"按钮
- 点击后恢复默认筛选条件：
  - 日期范围：最近一个月
  - 仓库：全部
  - 加班筛选：全部
- 重置后自动触发搜索

---

### 2.5 搜索功能

#### 2.5.1 手动搜索
**需求描述**：
- 提供"搜索"按钮
- 点击后根据当前筛选条件查询数据
- 页面加载时不自动搜索，需要手动点击

#### 2.5.2 数据加载状态
**需求描述**：
- 搜索时显示加载状态
- 无数据时显示"暂无数据"提示

---

## 3. 技术实现

### 3.1 后端实现

#### 3.1.1 API 接口
**接口路径**：`GET /api/v1/commits/by-date`

**请求参数**：
```typescript
{
  startDate: number;        // 开始日期（时间戳）
  endDate: number;          // 结束日期（时间戳）
  repositoryIds?: string[]; // 仓库ID列表（可选）
  isOvertime?: boolean;     // 是否加班筛选（可选）
}
```

**响应数据**：
```typescript
{
  data: [
    {
      date: string;                    // YYYY-MM-DD
      commits: Commit[];               // 提交记录列表
      totalCommits: number;            // 总提交数
      overtimeCount: number;           // 加班提交数
      latestOvertimeCommits: string[]; // 最晚5个加班时间点
      workStatus: WorkStatus;          // 工作状态
    }
  ],
  total: number; // 总记录数
}
```

#### 3.1.2 工作状态计算
**实现位置**：`backend/src/services/CommitService.ts`

**计算逻辑**：
1. 统计当天所有提交记录数量
2. 检查是否存在 19:00 后的提交
3. 根据配置的阈值和加班情况，计算工作状态
4. 返回工作状态标识

#### 3.1.3 数据去重
**需求描述**：
- 不同分支或 fork 的相同 commit hash 需要去重
- 基于 `commitHash` 字段进行去重判断

---

### 3.2 前端实现

#### 3.2.1 组件结构
```
GitStatisticsList
├── StatisticsFilter (筛选组件)
└── CommitsByDateList (列表展示组件)
    └── Collapse (日期分组)
        └── Tabs (仓库分组)
            └── CommitItem (提交记录项)
```

#### 3.2.2 状态管理
**使用库**：Jotai

**状态定义**：
```typescript
interface FilterState {
  dateRange: [Dayjs, Dayjs];  // 日期范围
  repositoryIds: string[];    // 仓库ID列表
  isOvertime?: boolean;       // 是否加班筛选
}
```

**默认值**：
- 日期范围：最近一个月
- 仓库：全部（空数组）
- 加班筛选：全部（undefined）

#### 3.2.3 UI 组件库
**使用库**：Ant Design

**主要组件**：
- `Collapse`：日期分组折叠面板
- `Tabs`：仓库分组标签页
- `DatePicker.RangePicker`：日期范围选择器
- `Select`：仓库和加班筛选下拉框
- `Button`：搜索和重置按钮
- `Tag`：工作状态和加班标签
- `Tooltip`：加班时间提示

---

## 4. 数据模型

### 4.1 Commit 数据模型
```typescript
interface Commit {
  id: number;
  repoId: string;
  repoName: string;
  commitHash: string;
  authorName: string;
  authorEmail: string;
  commitDate: number;        // 时间戳
  message: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  createdAt: number;
  isOvertime?: boolean;       // 是否加班
  overtimeCommitTimes?: string[]; // 加班时间点
}
```

### 4.2 CommitsByDate 数据模型
```typescript
interface CommitsByDate {
  date: string;                    // YYYY-MM-DD
  commits: Commit[];
  totalCommits: number;
  overtimeCount: number;
  latestOvertimeCommits: string[]; // 最晚5个加班时间点
  workStatus: WorkStatus;
}
```

### 4.3 WorkStatus 类型
```typescript
type WorkStatus = 
  | 'relaxed'           // 悠闲
  | 'normal'            // 正常
  | 'busy'              // 忙碌
  | 'crazy'             // 疯狂
  | 'overtime'          // 加班
  | 'superCrazyOvertime'; // 超级疯狂加班
```

---

## 5. UI/UX 要求

### 5.1 颜色规范
- **提交时间**：`#1890ff`（蓝色），字体粗细 500
- **新增代码**：`#52c41a`（绿色）
- **删除代码**：`#ff4d4f`（红色）
- **工作状态标签**：
  - 悠闲：绿色
  - 正常：蓝色
  - 忙碌：橙色
  - 疯狂：红色
  - 加班：红色
  - 超级疯狂加班：洋红色

### 5.2 交互要求
- 日期面板默认展开第一天
- 仓库 Tab 默认激活第一个
- 超过 10 条记录时，内容区域可滚动
- 加班标签支持 Hover 显示详细时间
- 重置按钮点击后自动搜索

### 5.3 响应式要求
- 支持不同屏幕尺寸
- 筛选条件支持换行显示
- Tab 标签支持响应式显示

---

## 6. 性能要求

### 6.1 数据加载
- 搜索时显示加载状态
- 支持大数据量展示（滚动加载）

### 6.2 防抖处理
- 手动扫描功能：30 秒内只能扫描一次
- 搜索功能：点击后立即执行，无需防抖

---

## 7. 测试要求

### 7.1 功能测试
- [ ] 日期筛选功能正常
- [ ] 仓库筛选功能正常
- [ ] 加班筛选功能正常
- [ ] 重置功能正常
- [ ] 工作状态计算正确
- [ ] 加班识别正确
- [ ] Tab 切换正常
- [ ] 数据展示完整

### 7.2 边界测试
- [ ] 无数据时显示提示
- [ ] 单个仓库时 Tab 显示正常
- [ ] 单个提交时显示正常
- [ ] 超过 20 次提交且加班时显示"超级疯狂加班"

---

## 8. 后续优化建议

### 8.1 功能扩展
- 支持自定义工作状态阈值配置（前端配置界面）
- 支持导出统计数据
- 支持图表展示（提交趋势、工作状态分布等）

### 8.2 性能优化
- 大数据量时支持虚拟滚动
- 支持分页加载
- 支持数据缓存

### 8.3 用户体验优化
- 支持快捷键操作
- 支持自定义主题
- 支持数据对比（不同时间段对比）

---

## 9. 附录

### 9.1 相关文件
- 后端工作状态配置：`backend/src/config/workStatus.config.ts`
- 后端服务：`backend/src/services/CommitService.ts`
- 前端类型定义：`frontend/src/types/gitStatistics.ts`
- 前端列表组件：`frontend/src/pages/GitStatistics/GitStatisticsList/components/CommitsByDateList.tsx`
- 前端筛选组件：`frontend/src/pages/GitStatistics/GitStatisticsList/components/StatisticsFilter.tsx`

### 9.2 参考资料
- Ant Design 文档：https://ant.design/
- Jotai 文档：https://jotai.org/
- Day.js 文档：https://day.js.org/

---

**文档结束**

