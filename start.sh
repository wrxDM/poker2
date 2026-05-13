#!/bin/bash

# ─────────────────────────────────────────────────────
#  德州扑克 · 启动脚本
# ─────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "🎰 正在启动德州扑克服务器..."

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装 Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "❌ Docker 未运行，请启动 Docker Desktop"
    exit 1
fi

# 拉起服务
echo "📦 构建并启动容器..."
docker-compose up --build -d

echo ""
echo "✅ 服务启动成功！"
echo "   前端界面:  http://localhost:5173"
echo "   后端 API:  http://localhost:3001"
echo ""
echo "📝 快速开始:"
echo "   1. 打开浏览器访问 http://localhost:5173"
echo "   2. 注册一个账号（自动获得 500 筹码）"
echo "   3. 创建房间，邀请朋友加入"
echo "   4. 开始游戏！"
echo ""
echo "🛑 停止服务: ./start.sh stop"
