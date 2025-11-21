# Git 提交记录统计系统 - 需求文档

## 一、项目概述

开发一个全栈 Web 应用，用于统计和展示多个本地 Git 仓库的提交记录。系统能够扫描配置的 Git 仓库，将提交数据存储到 SQLite 数据库，并通过 Web 界面以表格形式展示统计结果。

## 二、技术栈

### 包管理器
- **pnpm**: 统一使用 pnpm 作为包管理器

### 后端
- **运行环境**: Node.js 18+
- **Web 框架**: Hono.js (轻量级、高性能、类型安全的 Web 框架)
- **数据验证**: Zod (TypeScript-first 的 schema 验证库)
- **数据库**: SQLite3
- **数据库操作**: better-sqlite3 (同步 API，性能更好)
- **Git 操作**: simple-git
- **定时任务**: node-cron
- **日志**: pino (高性能 JSON 日志库)
- **开发工具**: tsx (TypeScript 执行器)

### 前端
- **框架**: React 18 + TypeScript
- **UI 组件**: Ant Design 5.x
- **状态管理**: Jotai
- **HTTP 客户端**: axios
- **工具库**: ahooks, ramda, dayjs
- **构建工具**: Vite

## 三、核心功能需求

### 3.1 仓库配置管理

**配置文件**: `backend/config/repositories.json`

```json
{
  "repositories": [
    {
      "id": "repo-1",
      "name": "项目A",
      "path": "/Users/username/projects/project-a",
      "enabled": true
    },
    {
      "id": "repo-2", 
      "name": "项目B",
      "path": "/Users/username/projects/project-b",
      "enabled": true
    }
  ],
  "author": {
    "name": "Your Name",
    "email": "your.email@company.com"
  },
  "scanInterval": "0 2 * * *"
}
```

**Zod Schema 定义**:

```typescript
import { z } from 'zod';

export const RepositoryConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  enabled: z.boolean()
});

export const ConfigSchema = z.object({
  repositories: z.array(RepositoryConfigSchema),
  author: z.object({
    name: z.string(),
    email: z.string().email()
  }),
  scanInterval: z.string()
});
```

### 3.2 数据扫描与存储

**扫描策略**:
1. **首次扫描**: 应用启动时检查数据库，如果为空则扫描所有配置的仓库
2. **增量扫描**: 
   - 查询数据库中每个仓库的最新提交时间
   - 只扫描该时间点之后的新提交
   - 避免重复扫描历史数据
3. **手动触发**: 提供 API 接口和前端按钮手动触发扫描
4. **定时扫描**: 根据配置的 cron 表达式自动执行增量扫描

**数据库设计**:

```sql
-- 仓库表
CREATE TABLE repositories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  last_scan_time INTEGER,
  total_commits INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 提交记录表
CREATE TABLE commits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  commit_date INTEGER NOT NULL,
  message TEXT NOT NULL,
  files_changed INTEGER DEFAULT 0,
  insertions INTEGER DEFAULT 0,
  deletions INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (repo_id) REFERENCES repositories(id),
  UNIQUE(repo_id, commit_hash)
);

-- 索引
CREATE INDEX idx_commits_repo_date ON commits(repo_id, commit_date);
CREATE INDEX idx_commits_author ON commits(author_email, commit_date);
CREATE INDEX idx_commits_date ON commits(commit_date);
```

### 3.3 后端 API 设计 (Hono.js)

**基础路径**: `/api/v1`

#### API 路由结构

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';

const app = new Hono();

// 仓库管理路由
app.get('/api/v1/repositories', getRepositories);
app.get('/api/v1/repositories/:id', getRepositoryById);
app.post('/api/v1/repositories/scan', zValidator('json', ScanRequestSchema), triggerScan);

// 提交记录路由
app.get('/api/v1/commits', zValidator('query', CommitsQuerySchema), getCommits);

// 统计数据路由
app.get('/api/v1/statistics', zValidator('query', StatisticsQuerySchema), getStatistics);
```

#### Zod 验证 Schema

```typescript
// 查询参数验证
export const CommitsQuerySchema = z.object({
  startDate: z.string().transform(val => parseInt(val)),
  endDate: z.string().transform(val => parseInt(val)),
  repositoryIds: z.string().optional().transform(val => val?.split(',')),
  page: z.string().default('1').transform(val => parseInt(val)),
  pageSize: z.string().default('20').transform(val => parseInt(val))
});

// 扫描请求验证
export const ScanRequestSchema = z.object({
  repositoryIds: z.array(z.string()).optional()
});
```

#### 3.3.1 仓库管理 API
- `GET /repositories` - 获取所有仓库列表
- `GET /repositories/:id` - 获取单个仓库详情
- `POST /repositories/scan` - 手动触发扫描
  - Body: `{ repositoryIds?: string[] }`
  - Response: `{ success: boolean, scannedCount: number }`

#### 3.3.2 提交记录查询 API
- `GET /commits` - 获取提交记录列表
  - Query 参数: `startDate`, `endDate`, `repositoryIds`, `page`, `pageSize`
  - Response: 分页的提交记录列表

```json
{
  "data": [
    {
      "id": 1,
      "repoId": "repo-1",
      "repoName": "项目A",
      "commitHash": "abc123...",
      "authorName": "张三",
      "authorEmail": "zhangsan@company.com",
      "commitDate": 1700000000000,
      "message": "feat: 添加新功能",
      "filesChanged": 5,
      "insertions": 120,
      "deletions": 30
    }
  ],
  "total": 150,
  "page": 1,
  "pageSize": 20
}
```

#### 3.3.3 统计数据 API
- `GET /statistics` - 获取统计数据
  - Query 参数: 同 `/commits`
  - Response: 聚合统计数据

```json
{
  "totalCommits": 150,
  "totalInsertions": 5000,
  "totalDeletions": 2000,
  "totalFilesChanged": 300,
  "byRepository": [
    {
      "repoId": "repo-1",
      "repoName": "项目A",
      "commits": 80,
      "insertions": 3000,
      "deletions": 1200
    }
  ],
  "byDate": [
    {
      "date": "2024-11-15",
      "commits": 10,
      "insertions": 200,
      "deletions": 50
    }
  ]
}
```

### 3.4 前端界面设计

#### 3.4.1 页面结构

```
/git-statistics
├── 顶部操作区
│   ├── 时间范围选择器 (快捷选项: 最近一周 | 最近一个月 | 自定义)
│   ├── 仓库多选下拉框
│   └── 手动扫描按钮
├── 统计卡片区 (总提交次数、总代码行数、涉及文件数)
└── 提交记录表格 (支持分页、排序、导出)
```

#### 3.4.2 组件设计

**页面组件**: `pages/GitStatistics/GitStatisticsList/`
- `GitStatisticsList.tsx` - 主组件
- `components/StatisticsFilter.tsx` - 筛选区域
- `components/StatisticsCards.tsx` - 统计卡片
- `components/CommitsTable.tsx` - 提交记录表格

**状态管理**: `biz/atoms/gitStatistics.atom.ts`

```typescript
import { atom } from 'jotai';
import dayjs from 'dayjs';

export const filterAtom = atom({
  dateRange: [dayjs().subtract(7, 'day'), dayjs()],
  repositoryIds: [] as string[],
  quickSelect: 'week' as 'week' | 'month' | 'custom'
});

export const commitsTableAtom = atom({
  data: [],
  loading: false,
  pagination: { current: 1, pageSize: 20, total: 0 }
});

export const statisticsAtom = atom({
  totalCommits: 0,
  totalInsertions: 0,
  totalDeletions: 0,
  byRepository: []
});
```

#### 3.4.3 表格列定义

使用 Ant Design Table 组件，包含以下列：
- 仓库名称 (固定左侧)
- 提交Hash (截取前7位)
- 提交时间 (支持排序)
- 提交信息 (支持省略)
- 文件变更数
- 新增行数 (绿色显示)
- 删除行数 (红色显示)

```typescript
const columns = [
  {
    title: '仓库',
    dataIndex: 'repoName',
    width: 120,
    fixed: 'left'
  },
  {
    title: '提交Hash',
    dataIndex: 'commitHash',
    width: 100,
    render: (hash: string) => hash.substring(0, 7)
  },
  {
    title: '提交时间',
    dataIndex: 'commitDate',
    width: 180,
    sorter: true,
    render: (date: number) => dayjs(date).format('YYYY-MM-DD HH:mm:ss')
  },
  {
    title: '提交信息',
    dataIndex: 'message',
    ellipsis: true,
    width: 300
  },
  {
    title: '文件变更',
    dataIndex: 'filesChanged',
    width: 100,
    align: 'right'
  },
  {
    title: '新增行数',
    dataIndex: 'insertions',
    width: 100,
    align: 'right',
    render: (val: number) => <span style={{ color: '#52c41a' }}>+{val}</span>
  },
  {
    title: '删除行数',
    dataIndex: 'deletions',
    width: 100,
    align: 'right',
    render: (val: number) => <span style={{ color: '#ff4d4f' }}>-{val}</span>
  }
];
```

## 四、非功能性需求

### 4.1 性能要求
- 单次扫描处理时间: < 30秒 (取决于仓库大小)
- 接口响应时间: < 500ms
- 支持大数据量表格渲染 (虚拟滚动或分页)

### 4.2 数据验证
- 使用 Zod 进行所有 API 请求参数验证
- 日期范围不超过2年
- 仓库路径有效性检查
- Git 仓库合法性验证

### 4.3 错误处理
- 统一的错误响应格式
- 仓库不存在或无权限访问时的友好提示
- 数据库操作失败的回滚机制
- 前端友好的错误提示 (使用 message.error)

### 4.4 日志记录
- 使用 pino 记录结构化 JSON 日志
- 记录扫描任务的开始/结束
- 记录 API 请求和响应
- 记录错误信息和堆栈跟踪
- 日志文件按日期轮转

## 五、项目结构

```
git-statistics-app/
├── pnpm-workspace.yaml
├── package.json
├── README.md
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.ts          # 数据库配置
│   │   │   ├── logger.ts            # 日志配置
│   │   │   └── repositories.json    # 仓库配置文件
│   │   ├── schemas/
│   │   │   ├── config.schema.ts     # 配置文件 Zod schema
│   │   │   ├── api.schema.ts        # API 请求/响应 schema
│   │   │   └── database.schema.ts   # 数据库模型 schema
│   │   ├── services/
│   │   │   ├── GitScanService.ts    # Git 扫描服务
│   │   │   ├── RepositoryService.ts # 仓库管理服务
│   │   │   └── CommitService.ts     # 提交记录服务
│   │   ├── routes/
│   │   │   ├── repositories.ts      # 仓库路由
│   │   │   ├── commits.ts           # 提交记录路由
│   │   │   └── statistics.ts        # 统计数据路由
│   │   ├── db/
│   │   │   ├── client.ts            # 数据库客户端
│   │   │   └── migrations.ts        # 数据库迁移
│   │   ├── jobs/
│   │   │   └── scanScheduler.ts     # 定时任务调度器
│   │   ├── utils/
│   │   │   ├── response.ts          # 统一响应格式
│   │   │   └── errors.ts            # 错误处理
│   │   └── index.ts                 # 应用入口
│   ├── database/
│   │   └── git-statistics.db        # SQLite 数据库文件
│   ├── logs/                         # 日志目录
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   └── GitStatistics/
│   │   │       └── GitStatisticsList/
│   │   │           ├── index.tsx
│   │   │           ├── GitStatisticsList.tsx
│   │   │           └── components/
│   │   │               ├── StatisticsFilter.tsx
│   │   │               ├── StatisticsCards.tsx
│   │   │               └── CommitsTable.tsx
│   │   ├── biz/
│   │   │   └── atoms/
│   │   │       └── gitStatistics.atom.ts
│   │   ├── services/
│   │   │   └── gitStatisticsApi.ts
│   │   ├── types/
│   │   │   └── gitStatistics.ts
│   │   └── App.tsx
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
└── .gitignore
```

## 六、关键技术实现

### 6.1 Hono.js 应用初始化

```typescript
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import repositoriesRoute from './routes/repositories';
import commitsRoute from './routes/commits';
import statisticsRoute from './routes/statistics';

const app = new Hono();

// 中间件
app.use('*', logger());
app.use('*', cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

// 路由注册
app.route('/api/v1/repositories', repositoriesRoute);
app.route('/api/v1/commits', commitsRoute);
app.route('/api/v1/statistics', statisticsRoute);

// 健康检查
app.get('/health', (c) => c.json({ status: 'ok' }));

// 启动服务器
const port = 3000;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port
});

export default app;
```

### 6.2 Zod 数据验证中间件

```typescript
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

// 定义查询参数 schema
export const CommitsQuerySchema = z.object({
  startDate: z.string().transform(val => parseInt(val)),
  endDate: z.string().transform(val => parseInt(val)),
  repositoryIds: z.string().optional().transform(val => val?.split(',')),
  page: z.string().default('1').transform(val => parseInt(val)),
  pageSize: z.string().default('20').transform(val => parseInt(val))
});

// 使用验证中间件
app.get('/api/v1/commits', 
  zValidator('query', CommitsQuerySchema),
  async (c) => {
    const validated = c.req.valid('query');
    // validated 数据已经过类型验证和转换
    const commits = await getCommitsFromDB(validated);
    return c.json(commits);
  }
);
```

### 6.3 better-sqlite3 数据库操作

```typescript
import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '../../database/git-statistics.db');
export const db = new Database(dbPath);

// 启用 WAL 模式提升性能
db.pragma('journal_mode = WAL');

// 创建表
export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      last_scan_time INTEGER,
      total_commits INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS commits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id TEXT NOT NULL,
      commit_hash TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_email TEXT NOT NULL,
      commit_date INTEGER NOT NULL,
      message TEXT NOT NULL,
      files_changed INTEGER DEFAULT 0,
      insertions INTEGER DEFAULT 0,
      deletions INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repositories(id),
      UNIQUE(repo_id, commit_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_commits_repo_date ON commits(repo_id, commit_date);
    CREATE INDEX IF NOT EXISTS idx_commits_author ON commits(author_email, commit_date);
    CREATE INDEX IF NOT EXISTS idx_commits_date ON commits(commit_date);
  `);
}

// 批量插入提交记录
export function batchInsertCommits(commits: Commit[]) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO commits 
    (repo_id, commit_hash, author_name, author_email, commit_date, message, files_changed, insertions, deletions, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((commits) => {
    for (const commit of commits) {
      insert.run(
        commit.repoId,
        commit.commitHash,
        commit.authorName,
        commit.authorEmail,
        commit.commitDate,
        commit.message,
        commit.filesChanged,
        commit.insertions,
        commit.deletions,
        Date.now()
      );
    }
  });

  insertMany(commits);
}
```

### 6.4 Git 扫描服务 (使用 simple-git + ramda)

```typescript
import simpleGit, { SimpleGit } from 'simple-git';
import * as R from 'ramda';
import { logger } from '../config/logger';

export class GitScanService {
  private git: SimpleGit;

  constructor(private repoPath: string) {
    this.git = simpleGit(repoPath);
  }

  /**
   * 扫描仓库提交记录
   * @param fromDate 起始日期，用于增量扫描
   * @param authorEmail 作者邮箱，用于过滤
   */
  async scanRepository(fromDate?: Date, authorEmail?: string) {
    try {
      // 检查是否为有效的 Git 仓库
      const isRepo = await this.git.checkIsRepo();
      if (!isRepo) {
        throw new Error(`${this.repoPath} is not a valid git repository`);
      }

      // 构建 log 选项
      const logOptions: any = {
        to: 'HEAD'
      };

      if (fromDate) {
        logOptions.from = fromDate.toISOString();
      }

      if (authorEmail) {
        logOptions['--author'] = authorEmail;
      }

      // 获取提交日志
      const logs = await this.git.log(logOptions);
      
      logger.info(`Found ${logs.all.length} commits in ${this.repoPath}`);

      // 使用 ramda 处理提交数据
      const commits = await Promise.all(
        R.map(async (commit) => {
          try {
            // 获取每个提交的 diff 统计
            const diff = await this.git.diffSummary([`${commit.hash}^`, commit.hash]);
            
            return {
              hash: commit.hash,
              message: commit.message,
              date: new Date(commit.date).getTime(),
              authorName: commit.author_name,
              authorEmail: commit.author_email,
              filesChanged: diff.files.length,
              insertions: diff.insertions,
              deletions: diff.deletions
            };
          } catch (error) {
            // 第一个提交没有父提交，使用默认值
            logger.warn(`Failed to get diff for commit ${commit.hash}: ${error}`);
            return {
              hash: commit.hash,
              message: commit.message,
              date: new Date(commit.date).getTime(),
              authorName: commit.author_name,
              authorEmail: commit.author_email,
              filesChanged: 0,
              insertions: 0,
              deletions: 0
            };
          }
        }, logs.all)
      );

      return commits;
    } catch (error) {
      logger.error(`Error scanning repository ${this.repoPath}:`, error);
      throw error;
    }
  }

  /**
   * 增量扫描：只扫描指定日期之后的提交
   */
  async incrementalScan(lastScanDate: Date, authorEmail?: string) {
    logger.info(`Incremental scan from ${lastScanDate.toISOString()}`);
    return this.scanRepository(lastScanDate, authorEmail);
  }
}
```

### 6.5 定时任务调度器

```typescript
import cron from 'node-cron';
import { readFileSync } from 'fs';
import { GitScanService } from '../services/GitScanService';
import { db } from '../db/client';
import { logger } from '../config/logger';
import type { Config } from '../schemas/config.schema';

export function startScheduler() {
  // 读取配置文件
  const config: Config = JSON.parse(
    readFileSync('./config/repositories.json', 'utf-8')
  );

  // 启动定时任务
  cron.schedule(config.scanInterval, async () => {
    logger.info('Starting scheduled scan...');
    
    try {
      for (const repo of config.repositories) {
        if (!repo.enabled) continue;

        // 获取上次扫描时间
        const lastScan = db.prepare(
          'SELECT last_scan_time FROM repositories WHERE id = ?'
        ).get(repo.id) as { last_scan_time: number } | undefined;

        const fromDate = lastScan?.last_scan_time 
          ? new Date(lastScan.last_scan_time)
          : new Date('2000-01-01');

        // 执行增量扫描
        const scanner = new GitScanService(repo.path);
        const commits = await scanner.incrementalScan(fromDate, config.author.email);

        // 保存到数据库
        // ... (批量插入逻辑)

        logger.info(`Scanned ${commits.length} new commits from ${repo.name}`);
      }
    } catch (error) {
      logger.error('Scheduled scan failed:', error);
    }
  });

  logger.info(`Scheduler started with cron: ${config.scanInterval}`);
}
```

### 6.6 前端数据处理 (使用 ramda)

```typescript
import * as R from 'ramda';
import dayjs from 'dayjs';
import type { Commit, StatisticsByDate } from '../types/gitStatistics';

/**
 * 按日期分组统计提交数据
 */
export const groupCommitsByDate = R.pipe(
  R.groupBy((commit: Commit) => dayjs(commit.commitDate).format('YYYY-MM-DD')),
  R.map(
    R.applySpec({
      commits: R.length,
      insertions: R.pipe(R.pluck('insertions'), R.sum),
      deletions: R.pipe(R.pluck('deletions'), R.sum),
      filesChanged: R.pipe(R.pluck('filesChanged'), R.sum)
    })
  ),
  R.toPairs,
  R.map(([date, stats]) => ({ date, ...stats })),
  R.sortBy(R.prop('date'))
) as (commits: Commit[]) => StatisticsByDate[];

/**
 * 按仓库分组统计
 */
export const groupCommitsByRepository = R.pipe(
  R.groupBy(R.prop('repoId')),
  R.map(
    R.applySpec({
      commits: R.length,
      insertions: R.pipe(R.pluck('insertions'), R.sum),
      deletions: R.pipe(R.pluck('deletions'), R.sum)
    })
  ),
  R.toPairs,
  R.map(([repoId, stats]) => ({ repoId, ...stats }))
);

/**
 * 计算总体统计数据
 */
export const calculateTotalStatistics = R.applySpec({
  totalCommits: R.length,
  totalInsertions: R.pipe(R.pluck('insertions'), R.sum),
  totalDeletions: R.pipe(R.pluck('deletions'), R.sum),
  totalFilesChanged: R.pipe(R.pluck('filesChanged'), R.sum)
});
```

### 6.7 前端 API 服务

```typescript
import axios from 'axios';
import type { CommitsQuery, CommitsResponse, StatisticsResponse } from '../types/gitStatistics';

const api = axios.create({
  baseURL: 'http://localhost:3000/api/v1',
  timeout: 30000
});

export const gitStatisticsApi = {
  // 获取仓库列表
  getRepositories: () => 
    api.get('/repositories').then(res => res.data),

  // 获取提交记录
  getCommits: (params: CommitsQuery) =>
    api.get<CommitsResponse>('/commits', { params }).then(res => res.data),

  // 获取统计数据
  getStatistics: (params: CommitsQuery) =>
    api.get<StatisticsResponse>('/statistics', { params }).then(res => res.data),

  // 手动触发扫描
  triggerScan: (repositoryIds?: string[]) =>
    api.post('/repositories/scan', { repositoryIds }).then(res => res.data)
};
```

## 七、配置示例

### 7.1 仓库配置文件

**backend/config/repositories.json**:

```json
{
  "repositories": [
    {
      "id": "monkey-saas-web",
      "name": "Monkey SaaS Web",
      "path": "/Users/huangjing/Desktop/Code/monkey-saas-enterprise-web",
      "enabled": true
    },
    {
      "id": "another-project",
      "name": "另一个项目",
      "path": "/Users/huangjing/Desktop/Code/another-project",
      "enabled": true
    }
  ],
  "author": {
    "name": "huangjing",
    "email": "huangjing@company.com"
  },
  "scanInterval": "0 2 * * *"
}
```

### 7.2 pnpm workspace 配置

**pnpm-workspace.yaml**:

```yaml
packages:
  - 'backend'
  - 'frontend'
```

### 7.3 后端 package.json

**backend/package.json**:

```json
{
  "name": "git-statistics-backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "hono": "^4.0.0",
    "@hono/node-server": "^1.8.0",
    "@hono/zod-validator": "^0.2.0",
    "zod": "^3.22.0",
    "better-sqlite3": "^9.0.0",
    "simple-git": "^3.20.0",
    "node-cron": "^3.0.0",
    "pino": "^8.16.0",
    "pino-pretty": "^10.2.0",
    "ramda": "^0.29.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/node-cron": "^3.0.0",
    "@types/ramda": "^0.29.0",
    "tsx": "^4.0.0",
    "typescript": "^5.3.0"
  }
}
```

### 7.4 前端 package.json

**frontend/package.json**:

```json
{
  "name": "git-statistics-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "antd": "^5.12.0",
    "jotai": "^2.6.0",
    "axios": "^1.6.0",
    "ahooks": "^3.7.0",
    "ramda": "^0.29.0",
    "dayjs": "^1.11.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@types/ramda": "^0.29.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

### 7.5 TypeScript 配置

**backend/tsconfig.json**:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## 八、开发流程

### 阶段一: 项目初始化
1. 创建项目目录，初始化 pnpm workspace
2. 配置 backend 和 frontend 子项目
3. 安装所有依赖包

### 阶段二: 后端开发
1. 搭建 Hono.js 基础架构
2. 定义 Zod schemas (配置、API、数据库)
3. 初始化 SQLite 数据库和表结构
4. 实现 Git 扫描服务 (simple-git + ramda)
5. 开发 API 路由 (repositories, commits, statistics)
6. 实现定时任务调度器 (node-cron)
7. 配置 pino 日志系统

### 阶段三: 前端开发
1. 搭建 Vite + React 项目
2. 创建 Jotai atoms (状态管理)
3. 开发 API 服务层 (axios)
4. 实现页面组件:
   - StatisticsFilter (时间范围、仓库选择)
   - StatisticsCards (统计卡片)
   - CommitsTable (提交记录表格)
5. 使用 ramda 处理数据转换和聚合

### 阶段四: 集成测试
1. 前后端联调
2. 测试增量扫描逻辑
3. 测试定时任务
4. 性能优化 (数据库查询、前端渲染)

### 阶段五: 部署上线
1. 编写使用文档
2. 配置启动脚本
3. 打包构建
4. 部署到服务器

## 九、使用说明

### 9.1 安装依赖

```bash
# 在项目根目录
pnpm install
```

### 9.2 配置仓库

编辑 `backend/config/repositories.json`，添加您的 Git 仓库路径和作者信息。

### 9.3 启动后端

```bash
cd backend
pnpm dev
```

后端服务将在 `http://localhost:3000` 启动。

### 9.4 启动前端

```bash
cd frontend
pnpm dev
```

前端应用将在 `http://localhost:5173` 启动。

### 9.5 首次使用

1. 访问前端页面
2. 点击"手动扫描"按钮，系统会扫描所有配置的仓库
3. 扫描完成后，可以通过时间范围和仓库筛选查看统计数据

### 9.6 定时扫描

后端启动后会自动根据配置的 cron 表达式执行定时扫描，默认为每天凌晨2点。

## 十、后续扩展功能

1. **多作者统计**: 支持统计多个作者的提交数据
2. **可视化图表**: 使用 ECharts 展示提交趋势、代码变更趋势
3. **代码贡献排行榜**: 展示团队成员的代码贡献排名
4. **导出报告**: 支持导出 Excel、PDF 格式的统计报告
5. **邮件推送**: 定期通过邮件推送统计报告
6. **远程仓库支持**: 支持 GitHub/GitLab API 集成
7. **分支统计**: 支持按分支统计提交数据
8. **标签统计**: 支持按 Git 标签统计版本发布数据
9. **代码审查统计**: 统计 PR/MR 的审查数据
10. **团队协作分析**: 分析团队成员之间的协作关系

## 十一、注意事项

1. **权限问题**: 确保应用有权限访问配置的 Git 仓库路径
2. **性能优化**: 对于大型仓库，首次扫描可能需要较长时间，建议在非工作时间执行
3. **数据备份**: 定期备份 SQLite 数据库文件
4. **日志管理**: 定期清理日志文件，避免占用过多磁盘空间
5. **时区处理**: 确保前后端时区一致，避免时间显示错误
6. **并发扫描**: 多个仓库扫描时建议串行执行，避免系统资源占用过高
7. **错误恢复**: 扫描失败时应记录错误日志，并在下次扫描时重试

## 十二、技术亮点

1. **类型安全**: 全栈 TypeScript + Zod 验证，确保类型安全
2. **高性能**: Hono.js 轻量级框架 + better-sqlite3 同步 API
3. **函数式编程**: 使用 ramda 进行数据处理，代码简洁优雅
4. **增量扫描**: 智能增量扫描，避免重复处理历史数据
5. **原子化状态管理**: Jotai 提供灵活的状态管理方案
6. **现代化 UI**: Ant Design 5.x 提供美观的用户界面
7. **结构化日志**: pino 提供高性能的 JSON 日志
8. **Monorepo 管理**: pnpm workspace 统一管理前后端依赖

---

**文档版本**: v1.0.0  
**创建日期**: 2024-11-21  
**作者**: AI Assistant

