# Electron 桌面应用改造计划

## Context

将当前 Web 应用（Hono 后端 + React 前端）改造为 Electron 桌面应用，支持 macOS 系统安装为独立 .dmg 应用。

---

## Phase 1: 后端重构（向后兼容）

### 1.1 端口可配置
- **文件**: `backend/src/index.ts`
- **改动**: 硬编码端口 `5188` 改为读取 `PORT` 环境变量
- **状态**: [x] 已完成

### 1.2 日志目录可配置
- **文件**: `backend/src/config/logger.ts`
- **改动**: 日志目录读取 `LOG_DIR` 环境变量
- **状态**: [x] 已完成

### 1.3 重构 startServer 导出方式
- **文件**: `backend/src/index.ts`
- **改动**: 将 `startServer()` 改为不自动执行，导出 `app`、`startServer`、`gracefulShutdown`，通过环境变量控制是否自动启动
- **状态**: [x] 已完成

### 1.4 CORS 可配置
- **文件**: `backend/src/index.ts`
- **改动**: CORS origin 改为读取 `CORS_ORIGIN` 环境变量
- **状态**: [x] 已完成

### 1.5 修复硬编码备份路径
- **文件**: `backend/src/jobs/dbBackupScheduler.ts`
- **改动**: 默认备份路径改为基于 `LOG_DIR` 或当前目录计算
- **状态**: [x] 已完成

### 1.6 验证
- **操作**: 运行 `pnpm dev` 确认 Web 模式正常工作
- **状态**: [x] 已完成

---

## Phase 2: 前端重构（向后兼容）

### 2.1 创建 API 配置文件
- **文件**: `frontend/src/config/api.ts`（新建）
- **改动**: 根据是否在 Electron 中运行动态计算 API base URL
- **状态**: [x] 已完成

### 2.2 更新 4 个 service 文件
- **文件**: `frontend/src/services/gitStatisticsApi.ts`、`configApi.ts`、`logsApi.ts`、`tasksApi.ts`
- **改动**: 使用集中的 API 配置替代硬编码 `baseURL: '/api/v1'`
- **状态**: [x] 已完成

### 2.3 BrowserRouter 改 HashRouter
- **文件**: `frontend/src/App.tsx`
- **改动**: `BrowserRouter` 替换为 `HashRouter`（兼容 file:// 协议）
- **状态**: [x] 已完成

### 2.4 Vite base 路径
- **文件**: `frontend/vite.config.ts`
- **改动**: 添加 `base: './'` 确保生成相对路径资源引用
- **状态**: [x] 已完成

### 2.5 验证
- **操作**: 运行 `pnpm dev` 确认 Web 模式正常工作，Hash 路由正常
- **状态**: [x] 已完成

---

## Phase 3: Electron 工作区搭建

### 3.1 创建 electron 目录结构
- **操作**: 创建 `electron/src/`、`electron/resources/` 目录
- **状态**: [x] 已完成

### 3.2 添加 electron package.json 和 tsconfig
- **文件**: `electron/package.json`、`electron/tsconfig.json`（新建）
- **状态**: [x] 已完成

### 3.3 更新 pnpm-workspace.yaml
- **文件**: `pnpm-workspace.yaml`
- **改动**: 添加 `electron` 工作区
- **状态**: [x] 已完成

### 3.4 添加 Electron 依赖
- **操作**: 安装 `electron`、`electron-builder`、`electron-vite`、`@electron/rebuild`
- **状态**: [x] 已完成

---

## Phase 4: Electron 主进程开发

### 4.1 路径解析模块
- **文件**: `electron/src/paths.ts`（新建）
- **功能**: 解析 userData 路径用于数据库、日志、备份
- **状态**: [x] 已完成

### 4.2 后端运行器
- **文件**: `electron/src/backendRunner.ts`（新建）
- **功能**: 导入 Hono app，设置环境变量，动态端口启动服务
- **状态**: [x] 已完成

### 4.3 窗口管理
- **文件**: `electron/src/window.ts`（新建）
- **功能**: BrowserWindow 创建，加载前端页面
- **状态**: [x] 已完成

### 4.4 系统托盘
- **文件**: `electron/src/tray.ts`（新建）
- **功能**: 托盘图标、右键菜单（打开/退出）
- **状态**: [x] 已完成

### 4.5 预加载脚本
- **文件**: `electron/src/preload.ts`（新建）
- **功能**: 通过 contextBridge 注入后端端口到 `window.__BACKEND_PORT__`
- **状态**: [x] 已完成

### 4.6 主入口
- **文件**: `electron/src/main.ts`（新建）
- **功能**: 串联所有模块，管理应用生命周期
- **状态**: [x] 已完成

### 4.7 electron-vite 配置
- **文件**: `electron/electron.vite.config.ts`（新建）
- **功能**: 配置主进程、预加载、渲染器的构建
- **状态**: [x] 已完成

### 4.8 electron-builder 配置
- **文件**: `electron/electron-builder.yml`（新建）
- **功能**: macOS .dmg 打包配置
- **状态**: [x] 已完成

### 4.9 根 package.json 添加 Electron 脚本
- **文件**: `package.json`
- **改动**: 添加 `dev:electron`、`build:electron`、`package:electron` 脚本
- **状态**: [x] 已完成

### 4.10 验证
- **操作**: electron-vite build 成功，主进程/preload/renderer 均构建通过
- **状态**: [x] 已完成

---

## Phase 5: 原生模块处理

### 5.1 better-sqlite3 重建配置
- **操作**: 配置 `postinstall` 脚本和 `asarUnpack` 确保 native 模块正常
- **状态**: [x] 已完成

### 5.2 验证
- **操作**: 确认数据库读写操作在 Electron 中正常
- **状态**: [x] 已完成

---

## Phase 6: 数据库首次运行迁移

### 6.1 首次运行检测
- **文件**: `electron/src/main.ts`
- **改动**: 检测 userData 中是否存在数据库文件，首次运行时执行 Prisma 迁移
- **状态**: [x] 已完成

### 6.2 验证
- **操作**: 删除 userData 数据库，重新启动应用，确认自动创建
- **状态**: [x] 已完成

---

## Phase 7: 构建与打包

### 7.1 应用图标
- **操作**: 准备 1024x1024 图标并转换为 .icns 格式
- **状态**: [x] 已完成

### 7.2 打包测试
- **操作**: electron-builder --dir 打包成功，生成 Coding History.app
- **状态**: [x] 已完成

### 7.3 安装测试
- **操作**: 在 macOS 上安装并测试全部功能
- **状态**: [x] 已完成

---

## Phase 8: 优化与收尾

### 8.1 窗口状态持久化
- **功能**: 记住窗口大小和位置
- **状态**: [ ] 待完成

### 8.2 git 可用性检测
- **功能**: 启动时检测 git 是否安装，未安装时提示用户
- **状态**: [ ] 待完成

### 8.3 最终验证
- **操作**: 全面功能测试
- **状态**: [ ] 待完成

---

## 关键风险

| 风险 | 缓解措施 |
|------|---------|
| better-sqlite3 原生模块在 Electron 中编译失败 | 使用 @electron/rebuild，提前测试 |
| Prisma 引擎路径在打包后找不到 | 显式包含 generated client，测试 migrate deploy 流程 |
| 动态端口导致前端加载时序问题 | 主进程等待后端 listening 事件后再创建窗口 |
| dotenv 在 Electron 中加载错误的 .env | 主进程在导入后端前显式设置所有环境变量 |
