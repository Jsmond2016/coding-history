import { app, BrowserWindow } from 'electron';
import { startBackend, stopBackend } from './backendRunner.js';
import { createMainWindow } from './window.js';
import { createTray, destroyTray } from './tray.js';
import { getPaths } from './paths.js';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

async function initializeDatabase() {
  const paths = getPaths();

  // 确保目录存在
  fs.mkdirSync(paths.userData, { recursive: true });
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.mkdirSync(paths.dbBackup, { recursive: true });

  // 如果数据库已存在，跳过初始化
  if (fs.existsSync(paths.db)) {
    return;
  }

  console.log('[Electron] 首次运行，初始化数据库...');

  try {
    // 查找 prisma CLI
    const prismaBinPath = findPrismaBin();
    if (prismaBinPath) {
      const schemaPath = findPrismaSchema();
      if (schemaPath) {
        execSync(
          `"${process.execPath}" "${prismaBinPath}" db push --schema "${schemaPath}" --skip-generate`,
          {
            env: { ...process.env, DATABASE_URL: paths.dbUrl() },
            stdio: 'pipe',
          }
        );
        console.log('[Electron] 数据库初始化完成');
        return;
      }
    }
    console.log('[Electron] 未找到 Prisma CLI，将尝试由后端自动创建');
  } catch (error) {
    console.error('[Electron] 数据库初始化失败:', error);
    // 不阻止启动，后端可能会处理
  }
}

function findPrismaBin(): string | null {
  // 在开发模式下从 node_modules 查找
  const candidates = [
    path.join(__dirname, '../../../backend/node_modules/.bin/prisma'),
    path.join(__dirname, '../../node_modules/.bin/prisma'),
  ];

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
    // 初始化数据库目录
    await initializeDatabase();

    // 启动后端服务
    const port = await startBackend();
    console.log(`[Electron] 后端服务启动在端口 ${port}`);

    // 创建托盘
    createTray();

    // 创建主窗口
    createMainWindow();
  } catch (error) {
    console.error('[Electron] 启动失败:', error);
    app.quit();
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
