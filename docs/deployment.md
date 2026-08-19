# 部署文档

## 生产部署

### 后端

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 前端

```bash
cd frontend
npm run build
# 将 dist/ 目录部署到 Nginx 或其他 Web 服务器
```

### 启动器

```bash
cd launcher
cargo tauri build
# 生成的可执行文件在 src-tauri/target/release/
```

## Docker 部署

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```bash
docker build -t ft1-monitor-backend -f backend/Dockerfile .
docker run -p 8000:8000 ft1-monitor-backend
```

## Nginx 配置

```nginx
server {
    listen 80;
    server_name localhost;

    location / {
        root /path/to/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ws {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```
