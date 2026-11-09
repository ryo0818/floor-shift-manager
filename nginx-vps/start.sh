#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
docker build -t platbase-nginx:local .
if docker container inspect platbase-nginx >/dev/null 2>&1; then
  docker rm -f platbase-nginx
fi
# XServer VPS (Linux): host networking lets Nginx reach host 127.0.0.1:3000/8000.
docker run -d \
  --name platbase-nginx \
  --restart unless-stopped \
  --network host \
  platbase-nginx:local
docker ps --filter name=platbase-nginx
