#!/bin/bash
# 与 start.sh 一致：在 backend 目录下执行，保证 .env、DATABASE_URL 等相对路径正确
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}/backend"
NODE_BIN="$(mise where node@20.19.6)/bin"
export PATH="${NODE_BIN}:${PATH}"
exec pnpm dev
