# poker2

H5 Texas Hold'em Poker - Multiplayer Online

## 技术栈

- **后端**: Node.js + TypeScript + Socket.io + Redis + MySQL
- **前端**: React + TypeScript + Vite + TailwindCSS

## 快速启动

```bash
# 安装依赖
npm install

# 开发模式（前后端同时运行）
npm run dev

# 生产部署
docker-compose up -d
```

## 项目结构

```
poker2/
├── backend/          # 后端服务
│   └── src/
│       ├── game/     # 游戏引擎核心
│       ├── room/     # 房间管理
│       ├── socket/   # Socket.io 事件处理
│       └── services/ # 业务服务
└── frontend/         # 前端 H5
    └── src/
        ├── components/  # 组件
        ├── hooks/       # 自定义 Hooks
        ├── pages/       # 页面
        └── store/       # 状态管理
```
