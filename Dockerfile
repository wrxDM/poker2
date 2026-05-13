FROM node:22-alpine

WORKDIR /app

# Backend
COPY backend/package*.json backend/
RUN cd backend && npm install

COPY backend/tsconfig.json backend/

# Frontend
COPY frontend/package*.json frontend/
RUN cd frontend && npm install

COPY frontend/vite.config.ts frontend/
COPY frontend/tsconfig*.json frontend/
COPY frontend/tailwind.config.js frontend/
COPY frontend/postcss.config.js frontend/

# Root
COPY package.json package-lock.json* ./

RUN npm install --workspace=backend --workspace=frontend

COPY . .

RUN cd backend && npm run build

EXPOSE 3001 5173

CMD ["sh", "-c", "npm run dev"]
