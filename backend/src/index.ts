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

// 初始化仓库配置
async function initRepositories() {
  const configPath = path.join(__dirname, '../config/repositories.json');
  const configContent = readFileSync(configPath, 'utf-8');
  const config: Config = JSON.parse(configContent);
  
  const repositoryService = new RepositoryService();
  
  // 将配置中的仓库信息同步到数据库
  for (const repo of config.repositories) {
    await repositoryService.upsertRepository({
      id: repo.id,
      name: repo.name,
      path: repo.path
    });
  }
  
  logger.info(`Initialized ${config.repositories.length} repositories`);
}

// 启动服务器
const port = 3000;

async function startServer() {
  logger.info('Initializing application...');

  // 初始化仓库配置
  await initRepositories();

  // 启动定时任务
  startScheduler();

  console.log(`Server is running on port ${port}`);

  serve({
    fetch: app.fetch,
    port
  });
}

startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

export default app;

