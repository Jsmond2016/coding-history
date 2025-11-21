#!/bin/bash

# Git 统计系统启动脚本

echo "正在启动 Git 统计系统..."

# 检查 pnpm 是否安装
if ! command -v pnpm &> /dev/null; then
    echo "错误: 未找到 pnpm，请先安装 pnpm"
    echo "安装命令: npm install -g pnpm"
    exit 1
fi

# 安装依赖
echo "正在安装依赖..."
pnpm install

# 启动后端（后台运行）
echo "正在启动后端服务..."
cd backend
pnpm dev &
BACKEND_PID=$!
cd ..

# 等待后端启动
sleep 3

# 启动前端
echo "正在启动前端服务..."
cd frontend
pnpm dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "=========================================="
echo "Git 统计系统已启动！"
echo "后端服务: http://localhost:3000"
echo "前端应用: http://localhost:5173"
echo "=========================================="
echo ""
echo "按 Ctrl+C 停止服务"

# 等待用户中断
trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT TERM
wait

