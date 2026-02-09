#!/bin/bash
# nohup = 让进程在关闭终端后也不退出，& = 放到后台
cd "$(dirname "$0")"
set -m
nohup pnpm start &>/dev/null &
echo $! > .start.pid
echo "已后台启动，后端 http://localhost:5188  前端 http://localhost:5173"
echo "关闭: pnpm stop:bg"
