# XServer VPS: Nginx reverse proxy (Docker only)

## What this does

- `http://<your-subdomain>/` -> `http://127.0.0.1:3000/` (React frontend)
- `http://<your-subdomain>/api/...` -> `http://127.0.0.1:8000/api/...` (Python API)
- Designed for a Linux VPS where frontend and backend are **already listening** on the host ports 3000 and 8000.
- `--network host` means the Nginx container shares the VPS network namespace; it can reach localhost on the VPS.
- This bundle configures HTTP on port 80 **only**. It does not configure HTTPS or issue certificates.

## Deploy

Copy the whole directory to the VPS (e.g. `/opt/nginx-vps`). Then:

```bash
cd /opt/nginx-vps
chmod +x start.sh stop.sh
sudo ss -lntp | grep -E ':(80|3000|8000)\b' || true
sudo ./start.sh
sudo docker exec platbase-nginx nginx -t
curl -I http://127.0.0.1/
```

Open TCP/80 in the XServer VPS packet filter and any OS firewall. Verify external access:

```bash
curl -I http://<your-subdomain>/
curl -i http://<your-subdomain>/api/<existing-route>
```

## Docker commands (without scripts)

```bash
cd /opt/nginx-vps
sudo docker build -t platbase-nginx:local .
sudo docker run -d --name platbase-nginx --restart unless-stopped --network host platbase-nginx:local
sudo docker logs -f platbase-nginx
sudo docker exec platbase-nginx nginx -t
sudo docker rm -f platbase-nginx
```

For a config change, run `sudo ./start.sh` again to rebuild/recreate the container.

## Important requirements / caveats

1. The VPS **must be Linux** for the given host networking setup; 80/tcp must be free.
2. The frontend and backend must really be reachable from the VPS host at `127.0.0.1:3000` and `127.0.0.1:8000`. If their Docker containers are currently published with e.g. `-p 3000:3000` and `-p 8000:8000`, check with `curl -I http://127.0.0.1:3000/` and an appropriate backend route.
3. Some Python apps define routes as `/shifts` instead of `/api/shifts`. In that case, in `nginx.conf`, change the `/api/` block to `proxy_pass http://127.0.0.1:8000/;` (trailing slash), which strips the `/api/` prefix.
4. Change the port values in `nginx.conf` to match your actual app.
5. Do not publish the API/database ports publicly unless necessary; restrict them at VPS packet filtering and firewall. Host networking does not add isolation.
6. A Vite dev server (`npm run dev`) should not be used as the permanent production frontend; serve built static assets instead.
7. HTTPS requires a future port 443 + certificate config. Don't send real credentials over this HTTP-only configuration.
8. If other services already listen on port 80, this Nginx instance will not start until port 80 is freed or the services are consolidated behind one proxy.

## Troubleshooting

```bash
sudo docker ps -a --filter name=platbase-nginx
sudo docker logs --tail=100 platbase-nginx
sudo ss -lntp | grep -E ':(80|3000|8000)\b'
curl -I http://127.0.0.1:3000/
curl -I http://127.0.0.1:8000/
```

`502 Bad Gateway` generally means the upstream is not reachable, not that DNS has failed. Backend `/` may intentionally return 404 or 405, so test a real API route.
