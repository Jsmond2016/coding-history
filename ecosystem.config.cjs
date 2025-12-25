/**
 * PM2 进程管理器配置文件
 * 用于后台运行前端和后端服务
 */

const path = require('path');

const backendScript = path.resolve(__dirname, 'scripts/pm2-backend.sh');
const frontendScript = path.resolve(__dirname, 'scripts/pm2-frontend.sh');

module.exports = {
  apps: [
    {
      name: 'coding-history-backend',
      script: backendScript,
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development'
      },
      error_file: path.resolve(__dirname, 'backend/logs/pm2/error.log'),
      out_file: path.resolve(__dirname, 'backend/logs/pm2/out.log'),
      log_file: path.resolve(__dirname, 'backend/logs/pm2/combined.log'),
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 5000
    },
    {
      name: 'coding-history-frontend',
      script: frontendScript,
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development'
      },
      error_file: path.resolve(__dirname, 'frontend/logs/pm2/error.log'),
      out_file: path.resolve(__dirname, 'frontend/logs/pm2/out.log'),
      log_file: path.resolve(__dirname, 'frontend/logs/pm2/combined.log'),
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 5000
    }
  ]
};

