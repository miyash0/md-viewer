# frontend/dist を Node なしでビルドする:
#   docker build -f frontend/Dockerfile --output frontend/dist frontend
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ビルド結果だけを書き出す（--output の出力先に dist の中身が入る）
FROM scratch
COPY --from=build /app/dist /
