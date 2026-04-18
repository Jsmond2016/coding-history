function getApiBaseUrl(): string {
  // Electron 环境下，preload 脚本注入后端端口
  const electronPort = (window as any).__BACKEND_PORT__;
  if (electronPort) {
    return `http://localhost:${electronPort}/api/v1`;
  }
  // Web 模式：相对 URL 配合 Vite proxy 或同源访问
  return '/api/v1';
}

export const API_BASE_URL = getApiBaseUrl();
