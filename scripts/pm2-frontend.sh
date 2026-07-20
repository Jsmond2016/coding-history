#!/bin/bash
# 与 start.sh 一致：在 frontend 目录下执行，保证工作目录与 pnpm start 一致
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}/frontend"
NODE_BIN="$(mise where node@20.19.6)/bin"
export PATH="${NODE_BIN}:${PATH}"
exec pnpm dev
