#!/bin/bash
# 与 start.sh 一致：在 frontend 目录下执行，保证工作目录与 pnpm start 一致
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}/frontend"
pnpm dev

