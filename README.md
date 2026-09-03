# MoocManus

MoocManus 是一个可私有化部署的智能体应用，由 Next.js 前端、FastAPI 中控 API 和带浏览器环境的 Sandbox 组成。生产环境使用 Nginx 提供统一入口，内部服务只加入 Docker 网络，不直接暴露宿主机端口。

## 项目架构

```text
浏览器
  │ http://HOST:NGINX_PORT
  ▼
manus-nginx:80
  ├── /       ───────────────> manus-ui:3000      Next.js SSR/静态资源
  └── /api/   ───────────────> manus-api:8000     FastAPI + SSE + WebSocket
                                  ├── manus-postgres:5432  数据库
                                  ├── manus-redis:6379     Redis Stream/缓存
                                  └── manus-sandbox:8080   文件/Shell/浏览器控制
                                      └── :6080/websockify  noVNC WebSocket
```

目录职责：

| 目录      | 技术                                 | 职责                           | 容器监听端口                   |
| --------- | ------------------------------------ | ------------------------------ | ------------------------------ |
| `api`     | Python、FastAPI、SQLAlchemy、Alembic | API、任务编排、COS、VNC 转发   | `8000`                         |
| `sandbox` | Ubuntu、Chromium、Supervisor、noVNC  | 浏览器、文件、Shell、VNC       | `8080`、`9222`、`5900`、`6080` |
| `ui`      | Next.js、React、TypeScript           | 用户界面和会话展示             | `3000`                         |
| `nginx`   | Nginx                                | 统一 HTTP、SSE、WebSocket 入口 | 宿主机 `NGINX_PORT`            |

## 一键部署

要求 Docker Engine/Docker Desktop 和 Docker Compose v2。首次部署：

```bash
cp .env.example .env
# Windows PowerShell：Copy-Item .env.example .env
# 编辑 .env，修改 POSTGRES_PASSWORD、COS，并在 api/config.yaml 中配置 LLM
docker compose up -d --build
```

访问 `http://localhost:8088`。常用运维命令：

```bash
docker compose ps
docker compose logs -f api
docker compose restart api
docker compose down
```

`postgres-data` 和 `redis-data` 是持久化卷。仅在确认要删除全部数据时执行 `docker compose down -v`。

## 配置说明

根目录 `.env.example` 是唯一部署模板，复制为根目录 `.env` 后填写。Compose 会将配置注入 API，并强制使用以下 Docker DNS 名称：

| 配置              | 生产值             | 说明                        |
| ----------------- | ------------------ | --------------------------- |
| `NGINX_PORT`      | `8088`             | 唯一发布到宿主机的端口      |
| `POSTGRES_*`      | `manus-postgres`   | Postgres 数据库和认证信息   |
| `REDIS_HOST`      | `manus-redis`      | Redis 服务名                |
| `SANDBOX_ADDRESS` | `manus-sandbox`    | Sandbox 服务名              |
| `SANDBOX_NETWORK` | `manus-network`    | 动态 Sandbox 容器加入的网络 |
| `COS_*`           | 按腾讯云控制台填写 | 文件上传和 COS 对象存储     |

API 的 LLM、MCP 等应用配置在 `api/config.yaml` 中。敏感的 COS/LLM 密钥只放在未跟踪的 `.env` 或部署平台 Secret 中，不要写入 Dockerfile、README 或镜像。

## 请求地址

开发时，`ui/.env.local` 使用 `http://localhost:8000/api`，API 本地监听 `8000`。生产构建时：

- 浏览器端使用同源 `/api`，由 Nginx 代理到 API。
- Next.js 服务端组件使用 `http://api:8000/api`，通过 Docker 网络访问 API。
- VNC 使用 `/api/sessions/{session_id}/vnc`，Nginx 转发 Upgrade 请求，API 再连接 Sandbox 的 `6080/websockify`。

## HTTPS 预留

当前版本只配置 HTTP。证书部署时，在 `nginx/nginx.conf` 的 server 中增加 `listen 443 ssl`、证书路径和 HTTP 到 HTTPS 的重定向，并将证书以只读卷挂载到 Nginx；同时把前端 VNC 协议切换为 `wss`。

## 安全注意事项

当前工作区的 `api/.env` 含有真实 COS 凭据。它已被根 `.gitignore` 和 API `.dockerignore` 排除，但仍建议立即在腾讯云控制台轮换 `COS_SECRET_ID/COS_SECRET_KEY`，再把新值写入根目录 `.env`。如果这些凭据曾经提交到远程仓库或日志，也应一并撤销旧密钥。

## 子项目文档

- [API 服务](api/README.md)
- [Sandbox 服务](sandbox/README.md)
- [UI 服务](ui/README.md)
- [Compose 配置](docker-compose.yml)
- [Nginx 配置](nginx/nginx.conf)
