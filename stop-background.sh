#!/bin/bash
cd "$(dirname "$0")"
[ -f .start.pid ] || { echo "未在后台运行或已关闭"; exit 0; }
PID=$(cat .start.pid)
kill -TERM -"$PID" 2>/dev/null || kill -TERM "$PID" 2>/dev/null
rm -f .start.pid
echo "已关闭"
