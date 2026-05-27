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

# 问题记录
## 手机端底部超出屏幕
解决办法，classname 去掉 h-vh 只用 h-dvh 区别在于后者在计算可现实区域的时候会去掉地址栏的干扰

## 语音 webRTC 先进房间的人 ontrack 函数不会被调用
主要是因为 B 在 createAnswer 的时候麦克风还没 ready，导致 addTrack 没有生效，所以发给 A 的 Answer 里面格式是 recvonly，修复方案，把建立语音连接放到麦克风获取之后