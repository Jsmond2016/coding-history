// 必须在所有其他导入之前加载环境变量
import 'dotenv/config';

import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import repositoriesRoute from './routes/repositories.js';
import commitsRoute from './routes/commits.js';
import statisticsRoute from './routes/statistics.js';
import logsRoute from './routes/logs.js';
import { startScheduler, restartScheduler } from './jobs/scanScheduler.js';
import { logger } from './config/logger.js';
import { RepositoryService } from './services/RepositoryService.js';
import { LogService } from './services/LogService.js';
import { readFileSync, watch } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import type { Config } from './schemas/config.schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = new Hono();
const logService = new LogService();

// 中间件
app.use('*', honoLogger());
app.use('*', cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

// 请求日志中间件（只记录 API 请求）
app.use('/api/v1/*', async (c, next) => {
  const startTime = Date.now();
  const method = c.req.method;
  const url = c.req.url;
  
  // 提取路由名称（从 URL 路径中提取）
  const urlObj = new URL(url);
  const pathname = urlObj.pathname;
  const routeName = pathname.split('/').slice(0, 4).join('/'); // 例如: /api/v1/repositories
  
  // 获取请求体（仅对 POST/PUT/PATCH 请求）
  let requestBody: string | undefined;
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    try {
      const body = await c.req.clone().json().catch(() => null);
      if (body) {
        // 过滤敏感字段
        const sanitizedBody = sanitizeRequestBody(body);
        requestBody = JSON.stringify(sanitizedBody);
      }
    } catch {
      // 忽略解析错误
    }
  }

  await next();

  const duration = Date.now() - startTime;
  const statusCode = c.res.status;

  // 获取响应体（仅对错误响应或特定状态码）
  let responseBody: string | undefined;
  if (statusCode >= 400) {
    try {
      const clonedRes = c.res.clone();
      const body = await clonedRes.json().catch(() => null);
      if (body) {
        responseBody = JSON.stringify(body);
      }
    } catch {
      // 忽略解析错误
    }
  }

  // 异步记录日志，不阻塞请求
  logService.createRequestLog({
    method,
    url,
    routeName,
    statusCode,
    requestBody,
    responseBody,
    duration
  }).catch((error) => {
    logger.error({
      msg: 'Failed to create request log',
      error: error instanceof Error ? error.message : String(error)
    });
  });
});

// 路由注册
app.route('/api/v1/repositories', repositoriesRoute);
app.route('/api/v1/commits', commitsRoute);
app.route('/api/v1/statistics', statisticsRoute);
app.route('/api/v1/logs', logsRoute);

// 健康检查
app.get('/health', (c) => c.json({ status: 'ok' }));

// 加载配置
function loadConfig(): Config {
  const configPath = path.join(__dirname, '../config/repositories.json');
  const configContent = readFileSync(configPath, 'utf-8');
  return JSON.parse(configContent);
}

// 初始化仓库配置
async function initRepositories() {
  try {
    const config = loadConfig();
    const repositoryService = new RepositoryService();
    
    // 将配置中的仓库信息同步到数据库
    for (const repo of config.repositories) {
      await repositoryService.upsertRepository({
        id: repo.id,
        name: repo.name,
        path: repo.path
      });
    }
    
    logger.info(`[初始化] 已同步 ${config.repositories.length} 个仓库配置到数据库`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error({
      msg: 'Failed to initialize repositories',
      error: errorMessage,
      stack: errorStack
    });
    throw error;
  }
}

// 配置文件监听和热重载
function watchConfigFile() {
  const configPath = path.join(__dirname, '../config/repositories.json');
  let reloadTimeout: NodeJS.Timeout | null = null;

  logger.info(`[配置监听] 监听路径: ${configPath}`);

  // 使用 fs.watch 监听配置文件变化
  const watcher = watch(configPath, async (eventType) => {
    logger.info(`[配置监听] 检测到文件事件: ${eventType}`);

    // 处理 change 和 rename 事件（编辑器保存时可能触发 rename）
    if (eventType === 'change' || eventType === 'rename') {
      // 防抖处理：避免短时间内多次触发
      if (reloadTimeout) {
        clearTimeout(reloadTimeout);
      }

      reloadTimeout = setTimeout(async () => {
        try {
          logger.info('[配置热重载] 检测到 repositories.json 文件变化，正在重新加载...');

          // 验证配置文件格式（如果格式错误会抛出异常）
          loadConfig();

          // 重新同步仓库配置到数据库
          await initRepositories();

          // 重启定时任务（使用新的 scanInterval）
          await restartScheduler();

          logger.info('[配置热重载] 配置已成功重新加载，无需重启服务器');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : undefined;
          logger.error({
            msg: '[配置热重载] 重新加载失败，保持使用旧配置',
            error: errorMessage,
            stack: errorStack
          });
        }
      }, 300); // 300ms 防抖延迟
    }
  });

  // 错误处理
  watcher.on('error', (error) => {
    logger.error({
      msg: '[配置监听] 文件监听出错',
      error: error.message
    });
  });

  logger.info('[配置监听] 已启动配置文件监听');

  return watcher;
}

// 过滤敏感字段的辅助函数
function sanitizeRequestBody(body: any): any {
  if (typeof body !== 'object' || body === null) {
    return body;
  }

  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'authorization'];
  const sanitized = Array.isArray(body) ? [...body] : { ...body };

  for (const key in sanitized) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeRequestBody(sanitized[key]);
    }
  }

  return sanitized;
}

// 启动服务器
const port = 3000;

async function startServer() {
  try {
    logger.info('[应用启动] 正在初始化...');

    // 初始化仓库配置
    await initRepositories();

    // 启动定时任务（每天增量扫描）
    startScheduler();

    // 启动配置文件监听
    watchConfigFile();

    logger.info(`[服务就绪] 服务器运行在端口 ${port}`);
    logger.info('[提示] 如需初始化历史数据，请运行: pnpm init-scan');
    logger.info('[提示] 修改 config/repositories.json 后会自动重新加载配置');

    // 记录服务器启动日志
    await logService.createServerLog({
      type: 'start',
      message: `服务器启动成功，运行在端口 ${port}`
    });

    serve({
      fetch: app.fetch,
      port
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error({
      msg: 'Failed to start server',
      error: errorMessage,
      stack: errorStack
    });
    
    // 记录服务器启动失败日志
    await logService.createServerLog({
      type: 'error',
      message: `服务器启动失败: ${errorMessage}`,
      errorStack
    }).catch(() => {
      // 忽略日志记录失败
    });
    
    throw error;
  }
}

// 优雅关闭处理
const gracefulShutdown = async (signal: string) => {
  logger.info(`收到 ${signal} 信号，正在关闭服务器...`);
  
  try {
    await logService.createServerLog({
      type: 'stop',
      message: `服务器收到 ${signal} 信号，正在关闭`
    });
  } catch (error) {
    logger.error('记录服务器关闭日志失败:', error);
  }
  
  process.exit(0);
};

// 注册信号处理器
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 未捕获的异常处理
process.on('uncaughtException', async (error) => {
  const errorMessage = error.message;
  const errorStack = error.stack;
  
  logger.error({
    msg: '未捕获的异常',
    error: errorMessage,
    stack: errorStack
  });
  
  try {
    await logService.createServerLog({
      type: 'error',
      message: `未捕获的异常: ${errorMessage}`,
      errorStack
    });
  } catch (logError) {
    logger.error('记录异常日志失败:', logError);
  }
  
  process.exit(1);
});

// 未处理的 Promise 拒绝
process.on('unhandledRejection', async (reason, promise) => {
  const errorMessage = reason instanceof Error ? reason.message : String(reason);
  const errorStack = reason instanceof Error ? reason.stack : undefined;
  
  logger.error({
    msg: '未处理的 Promise 拒绝',
    error: errorMessage,
    stack: errorStack
  });
  
  try {
    await logService.createServerLog({
      type: 'error',
      message: `未处理的 Promise 拒绝: ${errorMessage}`,
      errorStack
    });
  } catch (logError) {
    logger.error('记录异常日志失败:', logError);
  }
});

startServer().catch((error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  logger.error({
    msg: 'Failed to start server',
    error: errorMessage,
    stack: errorStack
  });
  process.exit(1);
});

export default app;

