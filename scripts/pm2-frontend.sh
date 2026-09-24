#!/bin/bash
# PM2 直接管理 Vite，保留 HMR 并避免 pnpm 包装层阻塞 restart。
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}/frontend"
NODE_BIN="$(mise where node@20.19.6)/bin"
export PATH="${NODE_BIN}:${PATH}"
exec "${ROOT}/frontend/node_modules/.bin/vite"
