#!/usr/bin/env bash
set -euo pipefail

# 設定ファイルを確認
test -f backend/.env || {
  echo "backend/.env が見つかりません"
  exit 1
}

# 1. 停止
docker stop frontend backend

# 2. 再ビルド
docker build -t floor-shift-backend ./backend
docker build -t floor-shift-frontend ./frontend

# 3. DBの追加変更を反映（既存データは保持）
docker run --rm \
  --network floor-shift \
  --env-file backend/.env \
  floor-shift-backend \
  python -m app.manage migrate

# 4. 古いコンテナを削除
docker rm frontend backend

# 5. Backend起動
docker run -d \
  --name backend \
  --restart unless-stopped \
  --network floor-shift \
  --env-file backend/.env \
  floor-shift-backend

# 6. Frontend起動
docker run -d \
  --name frontend \
  --restart unless-stopped \
  --network floor-shift \
  -p 8080:80 \
  -e BACKEND_URL=http://backend:8000 \
  floor-shift-frontend

# 7. 公開用Nginxが起動中なら設定を再読み込み
if [ "$(docker inspect -f '{{.State.Running}}' platbase-nginx 2>/dev/null || true)" = "true" ]; then
  docker exec platbase-nginx nginx -t
  docker exec platbase-nginx nginx -s reload
fi

# 8. 起動状態を確認
docker ps -a --filter name=backend --filter name=frontend
docker logs --tail 30 backend
