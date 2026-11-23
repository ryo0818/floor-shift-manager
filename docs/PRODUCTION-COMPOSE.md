# 現行VPS構成からComposeへ移行

2026-11-23 / リポジトリmainのDockerfile・restart.sh・nginx設定を確認して作成。
VPS自体には接続していません。以下の確認で実際の設定と一致することを確かめてください。

## 対象

- frontend / backend / floor-shift-db-postgres-1 をこのComposeで管理します。
- platbase-nginx、証明書、Certbotのcronは既存のnginx-vps管理を継続します。
- floor-shiftネットワーク、DBの実際の既存ボリュームをexternalとして利用します。
- コンテナ名、DBのlocalhost:5432、frontendの公開8080を維持します。
- backendの8000はホストに公開しません。他アプリのホスト8000とは競合しません。
- 旧restart.sh、旧DB Composeと、このComposeを同時に運用しないでください。
- ボリュームはバックアップではありません。別途バックアップを保管してください。

## 1. 既存DBの保存先・バージョン・ネットワークを確認（停止前）

リポジトリ直下で実行します。

```bash
docker inspect floor-shift-db-postgres-1 --format '{{range .Mounts}}{{println .Type .Name .Source "->" .Destination}}{{end}}'
docker exec floor-shift-db-postgres-1 postgres --version
docker network inspect floor-shift --format '{{range .Containers}}{{println .Name}}{{end}}'
```

`/var/lib/postgresql/data` に対応するTypeが `volume` の行のNameを控えます。
例は `floor-shift-db_postgres_data` ですが、必ず実際の値を使ってください。
このComposeのDB DockerfileはPostgreSQL 17です。稼働DBも17であることを確認します。
**bind mount、マウントなし、別のメジャーバージョンの場合は、ここで止めて構成を合わせてください。**
DBのメジャーバージョンを変更して既存ボリュームを直接開く手順ではありません。

## 2. ファイルと環境変数を準備

compose.production.yaml、production.env.exampleはリポジトリ直下にあります。
既存のcompose.yamlは上書きしません。.env.production・backend/.env・backups/は.gitignoreで除外されます。

```bash
cp -n production.env.example .env.production
chmod 600 .env.production
```

.env.productionのREPLACE_WITH_*を全て編集します。
POSTGRES_DB / USER / PASSWORD は稼働DBのものを使います。値を変えるだけでは既存DBの認証情報は変わりません。
POSTGRES_VOLUME_NAMEは手順1の実際のNameです。存在しない名前ではComposeが停止し、空ボリュームを自動作成しません。
パスワードに特殊文字がある場合はComposeの.envの引用ルールに従ってください。

既存のbackend/.envも必要です。**SHIFT_CREDENTIAL_KEYは既存の値をそのまま保持します。**
この鍵は初期パスワードの復号に使われるため、再生成・紛失しないでください。
本ファイルではDB接続先・HTTPS Cookie・許可ホストをCompose側で上書きします。
古いDATABASE_URLも空に上書きし、PG*の設定を使用します。

```bash
# 内容を出力せず構成検証。config単体ではパスワードが表示されるので注意。
docker compose --env-file .env.production -f compose.production.yaml config --quiet
docker volume inspect "実際の既存ボリューム名"
# 停止時間を減らすため先にビルド
docker compose --env-file .env.production -f compose.production.yaml build
```

## 3. 初回の切り替え（ここから停止時間あり）

まずアプリを停止し、更新が止まった状態でDBをバックアップします。
他にこのDBへ書き込むアプリがある場合も停止してから実施します。

```bash
docker stop frontend backend
(
  set -e
  mkdir -p backups
  chmod 700 backups
  umask 077
  backup_file="backups/floor-shift-before-compose-$(date +%Y%m%d-%H%M%S).dump"
  docker exec floor-shift-db-postgres-1 sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup_file"
  test -s "$backup_file"
  docker exec -i floor-shift-db-postgres-1 pg_restore --list < "$backup_file" > /dev/null
  echo "バックアップ検証成功: $backup_file"
)
```

「バックアップ検証成功」と表示されたことを確認して次へ進みます。
失敗した場合は進まず、`docker start backend frontend` で旧アプリを戻します。
バックアップはDB用環境変数とSHIFT_CREDENTIAL_KEYの控えとともに安全な場所にも保管します。

旧コンテナを削除し、同じ名前を新しいComposeに引き渡します。**ボリュームは削除しません。**

```bash
docker rm frontend backend
docker stop floor-shift-db-postgres-1
docker rm floor-shift-db-postgres-1

docker compose --env-file .env.production -f compose.production.yaml up -d --wait postgres

# 既存データを引き継ぐためinitではなくmigrateを使用
docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps backend python -m app.manage migrate

docker compose --env-file .env.production -f compose.production.yaml up -d --wait backend frontend

# IPが変わる可能性があるため公開用Nginxの名前解決を更新
docker exec platbase-nginx nginx -t && docker exec platbase-nginx nginx -s reload
```

各コマンドが成功してから次へ進みます。`--wait`が未対応ならCompose v2を更新してから実施してください。
`docker compose down -v`、`docker volume rm`、ボリューム削除を伴うpruneは実行しないでください。

## 4. 確認

```bash
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs --tail 50 backend
docker network inspect floor-shift --format '{{range .Containers}}{{println .Name}}{{end}}'
curl -fsS https://platbase-tooltech.xvps.jp/api/health
```

管理者でログインし、既存の従業員・フロア・シフトが残っていることを確認します。
起動できてもデータが見えない場合、新しい管理者を作らず接続先DB名とボリューム名を再確認します。

## 5. 今後の更新

マージ済みコードを取得し、必要なバックアップ後に実行します。

```bash
git pull --ff-only
docker compose --env-file .env.production -f compose.production.yaml build backend frontend
docker compose --env-file .env.production -f compose.production.yaml stop backend frontend
docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps backend python -m app.manage migrate
docker compose --env-file .env.production -f compose.production.yaml up -d --wait backend frontend
docker exec platbase-nginx nginx -t && docker exec platbase-nginx nginx -s reload
```

停止だけなら `docker compose --env-file .env.production -f compose.production.yaml stop`。
.env.productionやbackend/.envの変更後は `up -d` で再作成を反映します。単なるrestartでは環境変数は更新されません。

## 新規DBを用意する場合だけ

このファイルは既存DBの引き継ぎ用です。新規の場合は別名のvolumeを明示作成し、POSTGRES_VOLUME_NAMEに設定します。
DB起動後、migrateの代わりに次を実行して管理者・初期5フロアを登録します。

```bash
docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps backend python -m app.manage init --login admin
```

本番では --sample-data を付けません。既存DBではinitの再実行は不要です。

## nginx-vpsについて

現在のリポジトリ設定はHTTPSの `/api/` を `http://backend:8000`、`/` を `http://frontend:80` に転送します。
このComposeはその名前を維持します。80/443と証明書更新はplatbase-nginx側のままです。
8080は従来互換で公開しています。NginxがDockerネットワーク経由でのみfrontendへ接続する運用なら、
別途確認後にFRONTEND_BIND_IPを127.0.0.1に制限できます。

## 切り替えに失敗した場合

空のDBを初期化したりボリュームを削除したりしないでください。
旧構成へ戻す場合は、このComposeのコンテナだけを停止・削除し（down、-vなし）、
旧postgres-docker Composeを元のプロジェクト名floor-shift-db・元のボリュームで起動します。
旧backend/.envとイメージを使って従来の起動手順でfrontend/backendを戻し、Nginxをreloadします。
DBスキーマ更新後に古いアプリへ戻す場合は互換性を確認してください。
