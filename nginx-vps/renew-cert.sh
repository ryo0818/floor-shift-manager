#!/bin/bash
set -e

docker run --rm \
  -v /root/nginx-vps/certbot/www:/var/www/certbot \
  -v /root/nginx-vps/certbot/conf:/etc/letsencrypt \
  certbot/certbot renew --quiet

docker exec platbase-nginx nginx -s reload

