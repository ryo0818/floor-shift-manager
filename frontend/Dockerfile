# syntax=docker/dockerfile:1
# Place in frontend/Dockerfile. Build from the project root:
# docker build -t floor-shift-frontend ./frontend
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts postcss.config.mjs ./
COPY src ./src
COPY public ./public
COPY vendor ./vendor
ENV VITE_DEMO_MODE=false
RUN npm run build

FROM nginx:stable-alpine
# Run on the same Docker network as the container named "backend".
# Override BACKEND_URL if the API has a different address.
ENV BACKEND_URL=http://backend:8000
COPY --from=build /app/dist /usr/share/nginx/html
# Nginx configuration is embedded so no separate config file is needed.
COPY <<'NGINX' /etc/nginx/templates/default.conf.template
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        resolver 127.0.0.11 valid=30s ipv6=off;
        set $api_upstream "${BACKEND_URL}";
        proxy_pass $api_upstream$request_uri;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
