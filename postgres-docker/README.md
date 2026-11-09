# PostgreSQL Docker構成

PostgreSQL 17用。Dockerfile、docker-compose.yml、環境変数の例、初回実行SQLを同梱しています。フロントエンド・バックエンドは既存コンテナを利用する想定です。

## 起動

このフォルダで実行します。

```bash
cp .env.example .env
```

`.env` の `POSTGRES_PASSWORD` に任意の十分長いパスワードを設定してください。空のままでは起動できません。`POSTGRES_USER` と `POSTGRES_DB` で初回に作成するユーザーとDBを指定します。このユーザーはDB管理者（スーパーユーザー）です。アプリ専用の権限を限定したユーザーを使う場合は別途作成してください。

既存バックエンドと同じDockerネットワークを使います。以下はネットワークが存在しなければ作成します。

```bash
docker network inspect floor-shift >/dev/null 2>&1 || docker network create floor-shift
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 postgres
```

ホストの5432番が使用中なら `.env` の `POSTGRES_PORT=5433` などに変更してください。ホスト公開先は127.0.0.1に限定しています。

## バックエンドからの接続

バックエンドも `floor-shift` ネットワークに接続してください。同じネットワーク上からはDBホスト名 `postgres`、ポート `5432` で接続します。バックエンドの `.env` は、今回作成したDBと同じ値に設定します。

```dotenv
PGHOST=postgres
PGPORT=5432
PGDATABASE=floor_shift
PGUSER=postgres
PGPASSWORD=ここにDBのパスワード
```

既存の `DATABASE_URL` が設定されている場合はそちらが優先されるため、削除またはコメントアウトしてください。ホスト上で直接Pythonを起動する場合は `PGHOST=127.0.0.1`、`PGPORT` は公開ポートにします。

バックエンドの環境変数変更後は、既存の起動オプションを引き継いでコンテナを再作成してください。再起動だけではDockerの `--env-file` は読み直されません。

この構成は空のDBを作成します。既存アプリのDDLは含めていません。新規環境の管理者・テーブル作成にはバックエンドの `python -m app.manage init`、既存DBのスキーマ更新には `python -m app.manage migrate` を使ってください。旧DBのデータも移行する場合は別途バックアップ・復元が必要です。

## 停止・再ビルド・起動

```bash
docker compose down
docker compose up -d --build
```

通常の `down` ではデータボリュームは残ります。`down -v` はDBデータを削除するので、通常の更新には使わないでください。PostgreSQLのメジャーバージョンを変える場合は、既存ボリュームの使い回しではなく移行が必要です。

## 初期化SQLと設定変更

`initdb/` 内のSQLは空のデータボリュームで初回起動した場合のみ実行されます。追加・変更したSQLはイメージの再ビルドで取り込まれますが、既存DBには自動適用されません。`.env` のユーザー・パスワード・DB名を書き換えるだけでは既存DBの認証情報も変わりません。

`.env` とDBバックアップはGitに登録しないでください。

## 確認状況

ファイル構成とYAMLの構文を確認済み。この作成環境にはDockerがないため、コンテナ起動確認は未実施です。

参考: https://hub.docker.com/_/postgres
