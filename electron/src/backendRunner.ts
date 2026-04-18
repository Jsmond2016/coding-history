import { getPaths } from './paths.js';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

let backendPort: number | null = null;
let backendProcess: ChildProcess | null = null;

export function getBackendPort(): number | null {
  return backendPort;
}

function findTsx(): string | null {
  const candidates = [
    path.resolve(__dirname, '../../../backend/node_modules/.bin/tsx'),
    path.resolve(__dirname, '../../node_modules/.pnpm/node_modules/.bin/tsx'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
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

  const backendRoot = path.resolve(__dirname, '../../../backend');
  const isDev = !!process.env.ELECTRON_RENDERER_URL;

  let cmd: string;
  let args: string[];

  if (isDev) {
    // 开发模式：使用 tsx 运行 TypeScript 源码
    const tsxPath = findTsx();
    if (!tsxPath) {
      throw new Error('未找到 tsx，请确认 backend 依赖已安装');
    }
    cmd = tsxPath;
    args = [path.join(backendRoot, 'src/index.ts')];
  } else {
    // 生产模式：使用系统 Node 运行编译后的 JS
    // Electron 中 process.execPath 是 Electron 二进制，需要找到真正的 Node
    cmd = process.env.NODE_PATH || '/usr/local/bin/node';
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

    // 超时 fallback：8秒后如果没有捕获到端口，使用默认端口
    setTimeout(() => {
      if (!resolved) {
        console.log('[Electron] 后端启动超时，使用默认端口');
        backendPort = 5188;
        resolved = true;
        resolve(backendPort);
      }
    }, 8000);
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
    setTimeout(() => {
      if (backendProcess) {
        backendProcess.kill('SIGKILL');
        backendProcess = null;
      }
      resolve();
    }, 3000);
  });
}
