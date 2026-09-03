# Sandbox 服务

Sandbox 镜像内运行 FastAPI、Chromium、Xvfb、x11vnc 和 noVNC。FastAPI 监听 `8080`，noVNC WebSocket 监听 `6080`，CDP 通过 `9222` 提供。

## Compose 部署

由项目根目录的 `docker-compose.yml` 构建并启动，容器名为 `manus-sandbox`。这些端口只在 Docker 网络内提供，不发布到宿主机。API 使用 `http://manus-sandbox:8080` 调用文件和 Shell 接口，并使用 `ws://manus-sandbox:6080/websockify` 连接 VNC。

```bash
docker compose up -d --build sandbox
docker compose logs -f sandbox
```

Sandbox 的超时监控由 Supervisor 管理；生产环境应根据资源情况调整 `SANDBOX_TTL_MINUTES`。
