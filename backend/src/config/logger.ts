import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 确保 logs 目录存在
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// 生成带日期的日志文件名
const getLogFileName = (type: 'app' | 'error') => {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(logsDir, `${type}-${date}.log`);
};

// 日志文件路径（按日期分割）
const logFilePath = getLogFileName('app');
const errorLogFilePath = getLogFileName('error');

// 创建日志流
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // 序列化错误对象
  serializers: {
    error: pino.stdSerializers.err
  }
}, pino.multistream([
  // 控制台输出（带颜色）
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
  // 文件输出（所有日志，按日期分割）
  {
    level: 'info',
    stream: pino.destination({
      dest: logFilePath,
      sync: false,
      mkdir: true
    })
  },
  // 错误日志单独输出（按日期分割）
  {
    level: 'error',
    stream: pino.destination({
      dest: errorLogFilePath,
      sync: false,
      mkdir: true
    })
  }
]));

