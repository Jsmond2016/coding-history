import { app, BrowserWindow } from 'electron';
import { startBackend, stopBackend } from './backendRunner.js';
import { createMainWindow } from './window.js';
import { createTray, destroyTray } from './tray.js';
import { getPaths } from './paths.js';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

function ensureDirectories() {
  const paths = getPaths();
  fs.mkdirSync(paths.userData, { recursive: true });
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.mkdirSync(paths.dbBackup, { recursive: true });
}

function initializeDatabase() {
  const paths = getPaths();

  // 如果数据库已存在，跳过初始化
  if (fs.existsSync(paths.db)) {
    return;
  }

  console.log('[Electron] 首次运行，初始化数据库...');

  try {
    const schemaPath = findPrismaSchema();
    if (!schemaPath) {
      console.log('[Electron] 未找到 Prisma schema，跳过数据库初始化');
      return;
    }

    const prismaEntry = findPrismaEntry();
    if (!prismaEntry) {
      console.log('[Electron] 未找到 Prisma CLI，跳过数据库初始化');
      return;
    }

    // Electron 中 process.execPath 指向 Electron 二进制，
    // 需要用 Node.js 来执行 prisma，这里直接用 backend 的 tsx 作为 runtime
    const nodePath = findNodeBin();
    const runner = nodePath || findTsxBin();
    if (!runner) {
      console.log('[Electron] 未找到 Node.js 运行时，跳过数据库初始化');
      return;
    }

    execFileSync(runner, [
      prismaEntry, 'db', 'push',
      '--schema', schemaPath,
      '--url', paths.dbUrl(),
      '--accept-data-loss',
    ], {
      env: { ...process.env, DATABASE_URL: paths.dbUrl() },
      timeout: 15000,
      stdio: 'pipe',
    });
    console.log('[Electron] 数据库初始化完成');
  } catch (error) {
    console.error('[Electron] 数据库初始化失败:', error);
    // 不阻止启动
  }
}

function findPrismaEntry(): string | null {
  const candidates = [
    path.join(__dirname, '../../../backend/node_modules/prisma/build/index.js'),
    path.join(__dirname, '../../node_modules/prisma/build/index.js'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

function findTsxBin(): string | null {
  const candidates = [
    path.join(__dirname, '../../../backend/node_modules/.bin/tsx'),
    path.join(__dirname, '../../node_modules/.pnpm/node_modules/.bin/tsx'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

function findNodeBin(): string | null {
  // 常见的 Node.js 路径
  const candidates = [
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node',
    process.env.NODE_PATH || '',
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

function findPrismaSchema(): string | null {
  const candidates = [
    path.join(__dirname, '../../../backend/prisma/schema.prisma'),
    path.join(process.resourcesPath || '', 'prisma/schema.prisma'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

app.whenReady().then(async () => {
  try {
    // 确保目录存在并初始化数据库（同步，有超时保护）
    ensureDirectories();
    initializeDatabase();

    // 启动后端服务（子进程方式）
    const port = await startBackend();
    console.log(`[Electron] 后端服务启动在端口 ${port}`);

    // 创建托盘
    createTray();

    // 创建主窗口
    createMainWindow();
  } catch (error) {
    console.error('[Electron] 启动失败:', error);
    // 即使失败也创建窗口，让用户看到错误信息
    createMainWindow();
  }
});

// macOS: 点击 dock 图标时重新创建窗口
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

// 所有窗口关闭时
app.on('window-all-closed', () => {
  // macOS 上保持在托盘，不退出
});

// 应用退出前清理
app.on('before-quit', async () => {
  try {
    await stopBackend();
  } catch (error) {
    console.error('[Electron] 后端停止失败:', error);
  }
  destroyTray();
});
