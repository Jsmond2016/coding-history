#!/bin/bash

# 日志清理脚本
# 删除超过30天的日志文件

LOGS_DIR="$(dirname "$0")/../logs"
DAYS=30

echo "=== 清理旧日志文件 ==="
echo "日志目录: $LOGS_DIR"
echo "保留天数: $DAYS 天"
echo ""

# 查找并删除超过30天的日志文件
find "$LOGS_DIR" -name "*.log" -type f -mtime +$DAYS -print -delete

echo ""
echo "=== 清理完成 ==="
echo "当前日志文件:"
ls -lh "$LOGS_DIR"/*.log 2>/dev/null || echo "没有日志文件"

