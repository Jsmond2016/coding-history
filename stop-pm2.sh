#!/bin/bash

# Coding History PM2 后台停止脚本

echo "=========================================="
echo "Coding History - PM2 后台停止"
echo "=========================================="
echo ""

# 检查 PM2 是否安装
if ! command -v pm2 &> /dev/null; then
    echo "⚠️  PM2 未安装，无需停止服务"
    exit 0
fi

# 检查是否有运行中的进程
pm2 list | grep -q "coding-history" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "ℹ️  没有运行中的 Coding History 服务"
    echo ""
    pm2 list
    exit 0
fi

# 显示当前运行状态
echo "📊 当前运行状态:"
pm2 status
echo ""

# 询问确认
read -p "确定要停止所有服务吗？(y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 已取消操作"
    exit 0
fi

# 停止服务
echo "🛑 正在停止服务..."
pm2 stop ecosystem.config.cjs

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 服务已停止"
    echo ""
    
    # 询问是否删除进程
    read -p "是否删除进程记录？(y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        pm2 delete ecosystem.config.cjs
        echo "✅ 进程记录已删除"
    else
        echo "ℹ️  进程记录已保留，可以使用 'pnpm restart:pm2' 重新启动"
    fi
    
    echo ""
    echo "📝 提示:"
    echo "  重新启动: pnpm start:pm2 或 ./start-pm2.sh"
    echo "  查看状态: pnpm status:pm2 或 pm2 status"
    echo ""
else
    echo ""
    echo "❌ 停止服务失败，请检查错误信息"
    exit 1
fi

