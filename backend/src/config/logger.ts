import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createStream } from 'rotating-file-stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 确保 logs 目录存在
const logsDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/** 本地日历日期 YYYY-MM-DD（与滚动边界一致，非 UTC） */
export function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 当前自然日对应的日志文件路径（仅用于启动提示；滚动由 rotating-file-stream 负责）
 */
export function getCurrentResolvedLogPaths(): {
  dir: string;
  app: string;
  error: string;
  rotation: string;
} {
  const ymd = toLocalYmd(new Date());
  return {
    dir: logsDir,
    app: path.join(logsDir, `app-${ymd}.log`),
    error: path.join(logsDir, `error-${ymd}.log`),
    rotation: '本地自然日每日 0 点切换（interval=1d）'
  };
}

function dailyLogBasename(prefix: 'app' | 'error') {
  return (time: number | Date | false | null | undefined): string => {
    const d =
      time === false || time === null || time === undefined
        ? new Date()
        : time instanceof Date
          ? time
          : new Date(time);
    return `${prefix}-${toLocalYmd(d)}.log`;
  };
}

/** 按日滚动的文件流（与进程是否跨天无关，午夜自动换新文件） */
const appRotateStream = createStream(dailyLogBasename('app'), {
  interval: '1d',
  path: logsDir
});

const errorRotateStream = createStream(dailyLogBasename('error'), {
  interval: '1d',
  path: logsDir
});

// 创建日志流
export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    serializers: {
      error: pino.stdSerializers.err
    }
  },
  pino.multistream([
    {
      level: 'info',
      stream: pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          errorProps: '*'
        }
      })
    },
    {
      level: 'info',
      stream: appRotateStream
    },
    {
      level: 'error',
      stream: errorRotateStream
    }
  ])
);
