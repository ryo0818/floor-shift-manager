#!/usr/bin/env bash
# Routine updates AFTER migration to compose.production.yaml (see docs/PRODUCTION-COMPOSE.md).
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

stage="事前確認"
stopped=false
on_error() {
  local code=$?
  echo "更新失敗：${stage}（終了コード ${code}）" >&2
  if [[ "$stopped" == true ]]; then
    echo "アプリの停止・一部起動状態が残る可能性があります。DBとバックアップは削除していません。" >&2
    echo "docker compose --env-file .env.production -f compose.production.yaml ps" >&2
    echo "docker compose --env-file .env.production -f compose.production.yaml logs --tail 50 backend" >&2
    echo "原因を解消してから再実行してください。スキーマ更新後の自動巻き戻しは行いません。" >&2
  fi
  exit "$code"
}
trap on_error ERR

for file in compose.production.yaml .env.production backend/.env; do
  if [[ ! -f "$file" ]]; then
    echo "$file が見つかりません。docs/PRODUCTION-COMPOSE.mdを確認してください。" >&2
    exit 1
  fi
done
command -v docker >/dev/null
command -v flock >/dev/null
# Prevent two deployments from stopping or migrating the app concurrently.
exec 9>.restart.lock
flock -n 9 || { echo "別の更新処理が実行中です。" >&2; exit 1; }
compose=(docker compose --project-name floor-shift-db --env-file .env.production -f compose.production.yaml)
"${compose[@]}" config --quiet
compose_help=$(docker compose up --help)
[[ "$compose_help" == *--wait-timeout* ]]

# Refuse to adopt docker-run containers implicitly. Migration is a separate operation.
for container in frontend backend floor-shift-db-postgres-1; do
  project=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$container")
  if [[ "$project" != floor-shift-db ]]; then
    echo "$container は本番Composeへ移行されていません。先にdocs/PRODUCTION-COMPOSE.mdの初回移行を実施してください。" >&2
    exit 1
  fi
done
[[ "$(docker inspect -f '{{.State.Health.Status}}' floor-shift-db-postgres-1)" == healthy ]]
[[ "$(docker inspect -f '{{.State.Running}}' platbase-nginx)" == true ]]
docker exec platbase-nginx nginx -t

stage="frontend/backendのビルド"
echo "$stage（稼働中のアプリはまだ停止しません）"
"${compose[@]}" build backend frontend

stage="アプリ停止"
stopped=true
"${compose[@]}" stop frontend backend

stage="DBバックアップ"
umask 077
mkdir -p backups
chmod 700 backups
backup_file=$(mktemp "backups/before-restart-$(date +%Y%m%d-%H%M%S)-XXXXXX.dump")
"${compose[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_file"
test -s "$backup_file"
"${compose[@]}" exec -T postgres pg_restore --list < "$backup_file" > /dev/null
echo "バックアップの目録検証成功：$backup_file"

stage="DBスキーマ更新"
"${compose[@]}" run --rm --no-deps backend python -m app.manage migrate

stage="frontend/backendの起動"
# Do not recreate or upgrade the running PostgreSQL container during app updates.
"${compose[@]}" up -d --no-deps --wait --wait-timeout 180 backend frontend
"${compose[@]}" exec -T frontend wget -q -O /dev/null http://127.0.0.1/api/health

stage="公開用Nginxの再読み込み"
docker exec platbase-nginx nginx -t
docker exec platbase-nginx nginx -s reload
stopped=false
"${compose[@]}" ps
echo "更新完了。公開サイトでログイン・既存データを確認してください。"
echo "バックアップ：$backup_file（自動削除しません。保存世代を運用で管理してください）"
