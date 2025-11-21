import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import repositoriesRoute from './routes/repositories.js';
import commitsRoute from './routes/commits.js';
import statisticsRoute from './routes/statistics.js';
import { startScheduler } from './jobs/scanScheduler.js';
import { logger } from './config/logger.js';
import { RepositoryService } from './services/RepositoryService.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import type { Config } from './schemas/config.schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = new Hono();

// 中间件
app.use('*', honoLogger());
app.use('*', cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

// 路由注册
app.route('/api/v1/repositories', repositoriesRoute);
app.route('/api/v1/commits', commitsRoute);
app.route('/api/v1/statistics', statisticsRoute);

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

// 启动服务器
const port = 3000;

async function startServer() {
  try {
    logger.info('[应用启动] 正在初始化...');

    // 初始化仓库配置
    await initRepositories();

    // 启动定时任务（每天增量扫描）
    startScheduler();

    logger.info(`[服务就绪] 服务器运行在端口 ${port}`);
    logger.info('[提示] 如需初始化历史数据，请运行: pnpm init-scan');

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
    throw error;
  }
}

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

