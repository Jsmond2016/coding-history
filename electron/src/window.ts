import { BrowserWindow, shell } from 'electron';
import path from 'path';
import { getBackendPort } from './backendRunner.js';

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function createMainWindow(): BrowserWindow {
  const preloadPath = path.join(__dirname, '../preload/preload.cjs');

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    show: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 外部链接在系统浏览器中打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // 开发模式下打开 DevTools
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.webContents.openDevTools();
  }

  loadFrontend(mainWindow);

  return mainWindow;
}

function loadFrontend(win: BrowserWindow) {
  const port = getBackendPort();

  if (process.env.ELECTRON_RENDERER_URL) {
    // 开发模式：加载 Vite dev server
    const devUrl = new URL(process.env.ELECTRON_RENDERER_URL);
    if (port) {
      devUrl.searchParams.set('backendPort', String(port));
    }
    console.log(`[Electron] 加载前端: ${devUrl.toString()}`);
    win.loadURL(devUrl.toString());
  } else {
    // 生产模式：加载构建后的文件
    const frontendPath = path.join(__dirname, '../../../frontend/dist/index.html');
    if (port) {
      win.loadFile(frontendPath, { query: { backendPort: String(port) } });
    } else {
      win.loadFile(frontendPath);
    }
  }
}

export function restoreMainWindow(): BrowserWindow {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    return mainWindow;
  }
  return createMainWindow();
}
