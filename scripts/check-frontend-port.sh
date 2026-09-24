#!/usr/bin/env bash

set -u

PORT="${FRONTEND_PORT:-5173}"

if ! command -v lsof >/dev/null 2>&1; then
  exit 0
fi

PIDS="$(lsof -nP -t -iTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null | sort -u || true)"
for pid in ${PIDS}; do
  command_line="$(ps -p "${pid}" -o command= 2>/dev/null || true)"
  case "${command_line}" in
    *"coding-history"*)
      ;;
    *)
      printf '[Frontend] ERROR: 端口 %s 已被其他进程占用（PID %s）：%s\n' "${PORT}" "${pid}" "${command_line}" >&2
      printf '[Frontend] 请停止占用进程后再执行 pnpm start，或先修改 frontend/vite.config.ts 的端口。\n' >&2
      exit 1
      ;;
  esac
done
