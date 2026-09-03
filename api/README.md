# API 服务

API 基于 FastAPI，容器内监听 `8000`，所有接口以 `/api` 为前缀。应用启动时会等待 Postgres 和 Redis，并自动执行 Alembic `head` 迁移。

## 本地开发

```bash
uv pip install --system -r requirements.txt
./run.sh
```

本地运行时，可从根目录复制 `.env.example` 为 `.env` 后运行 API，或通过 shell 环境变量提供配置；数据库和 Redis 地址应指向本机或对应 Docker 服务。健康检查地址为 `GET /api/status`。

## Compose 部署

从项目根目录复制 `.env.example` 为 `.env` 并执行 `docker compose up -d --build`。生产 Compose 读取根目录 `.env`，并注入 `manus-postgres:5432`、`manus-redis:6379` 和 `manus-sandbox:8080`。

API 不直接发布宿主机端口，只通过 Nginx 的 `/api` 访问。会话 VNC WebSocket 地址为 `/api/sessions/{session_id}/vnc`，由 API 连接 Sandbox 的 `6080/websockify` 并双向转发。

## 环境变量

参考 `api/.env.example` 和根目录 `.env.example`。COS、LLM 等密钥应通过部署环境注入，不要写入镜像或提交到版本库。Alembic 使用 `SQLALCHEMY_DATABASE_URL`，并自动将 `asyncpg` URL 转换为迁移所需的 `psycopg2` URL。
