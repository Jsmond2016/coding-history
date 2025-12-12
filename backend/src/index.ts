import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import repositoriesRoute from './routes/repositories.js';
import commitsRoute from './routes/commits.js';
import statisticsRoute from './routes/statistics.js';
import { startScheduler, restartScheduler } from './jobs/scanScheduler.js';
import { logger } from './config/logger.js';
import { RepositoryService } from './services/RepositoryService.js';
import { readFileSync, watch } from 'fs';
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

