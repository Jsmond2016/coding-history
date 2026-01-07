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

# 根据环境变量决定是否执行初始化扫描
# ENABLE_STARTUP_SCAN 控制是否在启动时执行扫描（默认: false）
ENABLE_STARTUP_SCAN=${ENABLE_STARTUP_SCAN:-false}

if [ "$ENABLE_STARTUP_SCAN" = "true" ]; then
    # 同步最近3个月的代码记录
    echo "正在同步最近3个月的代码记录..."
    if pnpm init-scan -- --months 3; then
        echo "✓ 代码记录同步完成"
    else
        echo "⚠ 代码记录同步失败，将继续启动服务（可稍后手动执行: pnpm init-scan）"
    fi
    echo ""
else
    echo "跳过启动时扫描（ENABLE_STARTUP_SCAN=false）"
    echo "如需手动扫描，请执行: pnpm init-scan"
    echo ""
fi

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

