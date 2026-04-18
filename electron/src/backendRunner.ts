import { getPaths } from './paths.js';

let backendPort: number | null = null;

export function getBackendPort(): number | null {
  return backendPort;
}

export async function startBackend(): Promise<number> {
  const paths = getPaths();

  // 设置后端需要的环境变量（在导入后端之前）
  process.env.DATABASE_URL = paths.dbUrl();
  process.env.LOG_DIR = paths.logs;
  process.env.DB_BACKUP_DIR = paths.dbBackup;
  process.env.CORS_ORIGIN = '*';
  process.env.ENABLE_STARTUP_SCAN = 'false';
  process.env.PORT = '0';

  // 动态导入后端源码（运行时由 tsx 或编译后的 JS 处理）
  const backend = await import(
    process.env.ELECTRON_DEV_BACKEND_PATH ||
    /* @vite-ignore */
    new URL('../../../backend/src/index.ts', import.meta.url).pathname
  );

  // 调用 startServer
  await backend.startServer();

  // 从 server 对象获取实际端口
  const server = backend.server;
  if (server) {
    const addr = server.address();
    if (addr && typeof addr === 'object') {
      backendPort = addr.port;
    }
  }

  if (!backendPort) {
    backendPort = parseInt(process.env.PORT || '5188', 10);
  }

  return backendPort;
}

export async function stopBackend(): Promise<void> {
  const backend = await import(
    process.env.ELECTRON_DEV_BACKEND_PATH ||
    /* @vite-ignore */
    new URL('../../../backend/src/index.ts', import.meta.url).pathname
  );
  await backend.gracefulShutdown('APP_QUIT');
}
