import { getPaths } from './paths.js';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

let backendPort: number | null = null;
let backendProcess: ChildProcess | null = null;

export function getBackendPort(): number | null {
  return backendPort;
}

export async function startBackend(): Promise<number> {
  const paths = getPaths();

  // 设置后端需要的环境变量
  const backendEnv = {
    ...process.env,
    DATABASE_URL: paths.dbUrl(),
    LOG_DIR: paths.logs,
    DB_BACKUP_DIR: paths.dbBackup,
    CORS_ORIGIN: '*',
    ENABLE_STARTUP_SCAN: 'false',
    PORT: '0',
  };

  // 确定后端入口路径
  const isDev = !!process.env.ELECTRON_RENDERER_URL;
  const backendRoot = path.resolve(__dirname, '../../../backend');

  let cmd: string;
  let args: string[];

  if (isDev) {
    // 开发模式：使用 tsx 运行 TypeScript 源码
    const tsxPath = path.resolve(__dirname, '../../../node_modules/.bin/tsx');
    cmd = tsxPath;
    args = [path.join(backendRoot, 'src/index.ts')];
  } else {
    // 生产模式：运行编译后的 JS
    cmd = process.execPath;
    args = [path.join(backendRoot, 'dist/index.js')];
  }

  console.log(`[Electron] 启动后端: ${cmd} ${args.join(' ')}`);

  return new Promise((resolve, reject) => {
    backendProcess = spawn(cmd, args, {
      env: backendEnv,
      cwd: backendRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let resolved = false;

    backendProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      console.log('[Backend]', text.trimEnd());

      // 从输出中捕获端口号
      if (!resolved) {
        const portMatch = text.match(/服务就绪.*?端口\s+(\d+)/);
        if (portMatch) {
          backendPort = parseInt(portMatch[1], 10);
          resolved = true;
          resolve(backendPort);
        }
      }
    });

    backendProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[Backend stderr]', data.toString().trimEnd());
    });

    backendProcess.on('error', (err) => {
      console.error('[Electron] 后端进程启动失败:', err);
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    backendProcess.on('exit', (code) => {
      console.log(`[Electron] 后端进程退出，code=${code}`);
      backendProcess = null;
    });

    // 超时 fallback：5秒后如果没有捕获到端口，使用默认端口
    setTimeout(() => {
      if (!resolved) {
        backendPort = 5188;
        resolved = true;
        resolve(backendPort);
      }
    }, 5000);
  });
}

export function stopBackend(): Promise<void> {
  return new Promise((resolve) => {
    if (!backendProcess) {
      resolve();
      return;
    }
    backendProcess.kill('SIGTERM');
    backendProcess.on('exit', () => {
      backendProcess = null;
      resolve();
    });
    // 3秒后强制结束
    setTimeout(() => {
      if (backendProcess) {
        backendProcess.kill('SIGKILL');
        backendProcess = null;
      }
      resolve();
    }, 3000);
  });
}
