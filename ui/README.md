# UI 服务

这是基于 Next.js App Router 的前端服务。

## 本地开发

```bash
npm install
npm run dev
```

默认 API 地址由 `ui/.env.local` 配置为 `http://localhost:8000/api`，请求封装会自动拼接接口路径。

## 生产构建

项目提供 standalone 多阶段 Dockerfile。根目录 Compose 会在构建时注入 `NEXT_PUBLIC_API_BASE_URL=/api`，浏览器请求通过 Nginx 同源代理；服务端组件使用 `INTERNAL_API_BASE_URL=http://api:8000/api` 访问 API。

```bash
docker compose up -d --build ui nginx
```

UI 容器只在 Docker 网络中监听 `3000`。腾讯云 COS 的 HTTPS 图片域名已在 `next.config.ts` 的 `images.remotePatterns` 中配置；如使用自定义 COS 域名，请将其加入该配置后重新构建镜像。
