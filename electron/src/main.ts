import { app, BrowserWindow } from 'electron';
import { startBackend, stopBackend, getBackendPort } from './backendRunner.js';
import { createMainWindow, getMainWindow } from './window.js';
import { createTray, destroyTray } from './tray.js';
import { getPaths } from './paths.js';
import fs from 'fs';

async function initializeDatabase() {
  const paths = getPaths();

  // 确保 userData 目录存在
  fs.mkdirSync(paths.userData, { recursive: true });
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.mkdirSync(paths.dbBackup, { recursive: true });

  // 如果数据库不存在，使用 Prisma db push 创建
  if (!fs.existsSync(paths.db)) {
    console.log('[Electron] 首次运行，初始化数据库...');
    try {
      const { execSync } = await import('child_process');
      const prismaBin = require.resolve('prisma', { paths: [paths.userData] });
      // 使用 backend 的 prisma CLI
      execSync(
        `node "${prismaBin}" db push --schema "${paths.userData}/prisma/schema.prisma"`,
        {
          env: { ...process.env, DATABASE_URL: paths.dbUrl() },
          stdio: 'inherit',
        }
      );
    } catch {
      console.log('[Electron] 数据库初始化失败，将由后端自动处理');
    }
  }
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
