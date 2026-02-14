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
import tasksRoute from './routes/tasks.js';
import configRoute from './routes/config.js';
import { startScheduler, restartScheduler } from './jobs/scanScheduler.js';
import { logger } from './config/logger.js';
import { LogService } from './services/LogService.js';
import { DataMetricsConfigService } from './services/DataMetricsConfigService.js';


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
  
  // 提取模块名称（从路由名称中提取最后一个部分）
  // 例如: /api/v1/repositories -> repositories
  let module: string | undefined;
  const pathParts = pathname.split('/').filter(Boolean);
  if (pathParts.length >= 3 && pathParts[0] === 'api' && pathParts[1] === 'v1') {
    module = pathParts[2]; // 提取模块名称，如 repositories, commits, logs 等
  }
  
  // 获取请求体（仅对 POST/PUT/PATCH 请求）
  let requestBody: string | undefined;
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    try {
      // Hono 的请求体只能读取一次，所以先尝试读取
      const body = await c.req.json().catch(() => null);
      if (body) {
        // 过滤敏感字段
        const sanitizedBody = sanitizeRequestBody(body);
        requestBody = JSON.stringify(sanitizedBody);
      }
    } catch {
      // 忽略解析错误（请求体可能已被读取或格式错误）
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
    module,
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

// 全局错误处理：将未捕获的异常转为 500 JSON，便于排查
app.onError((err, c) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  logger.error({ msg: 'Route error', error: message, stack });
  return c.json({ error: message }, 500);
});

// 路由注册
app.route('/api/v1/repositories', repositoriesRoute);
app.route('/api/v1/commits', commitsRoute);
app.route('/api/v1/statistics', statisticsRoute);
app.route('/api/v1/logs', logsRoute);
app.route('/api/v1/tasks', tasksRoute);
app.route('/api/v1/config', configRoute);

// 健康检查
app.get('/health', (c) => c.json({ status: 'ok' }));

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
const port = 5188;

async function startServer() {
  try {
    logger.info('[应用启动] 正在初始化...');

    // 初始化数据指标配置（如果不存在则创建默认配置）
    try {
      const dataMetricsConfigService = new DataMetricsConfigService();
      await dataMetricsConfigService.initDefaultConfig();
      logger.info('[初始化] 数据指标配置已就绪');
    } catch (error) {
      logger.warn('[初始化] 数据指标配置初始化失败，将使用默认配置:', error);
    }

    // 启动定时任务（从数据库加载）
    await startScheduler();

    logger.info(`[服务就绪] 服务器运行在端口 ${port}`);
    logger.info('[提示] 如需初始化历史数据，请运行: pnpm init-scan');
    logger.info('[提示] 配置已迁移到数据库，请使用配置管理功能进行管理');

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

