import { contextBridge } from 'electron';

function getBackendPort(): string | null {
  // 从 URL query string 中获取后端端口
  const params = new URLSearchParams(window.location.search);
  return params.get('backendPort');
}

const backendPort = getBackendPort();

contextBridge.exposeInMainWorld('__BACKEND_PORT__', backendPort ? parseInt(backendPort, 10) : null);
