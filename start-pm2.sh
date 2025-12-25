#!/bin/bash

# Coding History PM2 后台启动脚本

echo "=========================================="
echo "Coding History - PM2 后台启动"
echo "=========================================="
echo ""

# 检查 pnpm 是否安装
if ! command -v pnpm &> /dev/null; then
    echo "❌ 错误: 未找到 pnpm，请先安装 pnpm"
    echo "安装命令: npm install -g pnpm"
    exit 1
fi

# 检查 PM2 是否安装
if ! command -v pm2 &> /dev/null; then
    echo "⚠️  PM2 未安装，正在安装 PM2..."
    npm install -g pm2
    if [ $? -ne 0 ]; then
        echo "❌ PM2 安装失败，请手动安装: npm install -g pm2"
        exit 1
    fi
    echo "✅ PM2 安装成功"
    echo ""
fi

# 创建日志目录
echo "📁 创建日志目录..."
mkdir -p backend/logs/pm2
mkdir -p frontend/logs/pm2
echo "✅ 日志目录已创建"
echo ""

# 检查是否已安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 正在安装依赖..."
    pnpm install
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        exit 1
    fi
    echo "✅ 依赖安装完成"
    echo ""
fi

# 停止已存在的进程（如果存在）
echo "🛑 检查并停止已存在的进程..."
pm2 delete ecosystem.config.cjs 2>/dev/null || true
echo ""

# 启动服务
echo "🚀 正在启动服务..."
pm2 start ecosystem.config.cjs

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ 服务启动成功！"
    echo "=========================================="
    echo ""
    echo "📊 服务信息:"
    echo "  后端服务: http://localhost:3000"
    echo "  前端应用: http://localhost:5173"
    echo ""
    echo "📝 常用命令:"
    echo "  查看状态: pnpm status:pm2 或 pm2 status"
    echo "  查看日志: pnpm logs:pm2 或 pm2 logs"
    echo "  停止服务: pnpm stop:pm2 或 pm2 stop ecosystem.config.cjs"
    echo "  重启服务: pnpm restart:pm2 或 pm2 restart ecosystem.config.cjs"
    echo "  删除进程: pnpm delete:pm2 或 pm2 delete ecosystem.config.cjs"
    echo ""
    echo "💡 提示: 服务已在后台运行，您可以关闭终端窗口"
    echo ""
    
    # 显示当前状态
    pm2 status
else
    echo ""
    echo "❌ 服务启动失败，请检查错误信息"
    exit 1
fi

