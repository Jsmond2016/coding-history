#!/bin/bash
# PM2 直接管理一次性后端进程，避免 pnpm -> tsx watch 多层进程导致 restart 长时间等待。
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}/backend"
NODE_BIN="$(mise where node@20.19.6)/bin"
export PATH="${NODE_BIN}:${PATH}"
exec "${ROOT}/backend/node_modules/.bin/tsx" src/index.ts
