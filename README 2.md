# フロアシフト — React + Python + PostgreSQL

管理者によるシフト調整・確定と、従業員の希望提出を行うアプリです。今回のバックエンドは **Python / FastAPI**、DBは **PostgreSQL** です。Java / Spring Bootは使用しません。

`frontend/` は日別タイムラインとボタン表示修正を含むReactの最新版、`backend/` は認証・業務ルール・保存処理です。このZIPは一式で使用できます。

## 整理版を使う前に

このZIPは `frontend/` と `backend/` が1階層ずつの構成です。旧フォルダへマージせず、別の場所に展開して確認してください。既存リポジトリへ反映する方法は [整理内容](docs/RELEASE-NOTES.md) に記載しています。既存DBを削除したり、サンプルで再初期化したりする必要はありません。

Mac向けの対策として `argon2-cffi-bindings==25.1.0` を保持し、以下ではコンパイル済みパッケージだけをインストールします。対応パッケージがない場合はコンパイルへ進まずエラーになります。その場合は対象パッケージ名とPythonバージョンを確認してください。

## 準備するもの

- Python 3.12（検証したバージョン。`python3 --version` で確認）
- Node.js 22.13以上、npm
- PostgreSQL 16以降を想定。既存DB、または付属のDocker Compose設定で用意

## 1. PostgreSQLを用意する

### 既存のPostgreSQLを使う場合

専用のDBと接続ユーザーを用意してください。すでにある場合は作成不要です。

管理権限のある `psql` セッションでの例：

```sql
CREATE ROLE floor_shift LOGIN;
\password floor_shift
CREATE DATABASE floor_shift OWNER floor_shift;
```

`\password` はパスワードを画面に表示せず設定するpsqlコマンドです。SQLエディタでは、そのツールのユーザー作成機能などからパスワードを設定してください。

### Dockerを使う場合（任意）

プロジェクト直下で：

```bash
cp .env.example .env
```

`.env` の `POSTGRES_PASSWORD` を自分で決めたDB用パスワードへ変更して起動します。

```bash
docker compose up -d db
docker compose ps
```

DBは `127.0.0.1:5432`、データは名前付きボリュームに保存されます。既存の5432番ポートと競合する場合は、直下 `.env` の `POSTGRES_PORT` と後述の `backend/.env` の `PGPORT` を同じ別の番号へ変更してください。

## 2. Python側の設定・初期化

Mac / Linux：

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install --only-binary=:all: -r requirements.txt
cp .env.example .env
```

Windows PowerShellでは仮想環境を次のように作成・有効化します。

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install --only-binary=:all: -r requirements.txt
Copy-Item .env.example .env
```

`backend/.env` を編集します。Python側はこのファイルを自動で読み込みます。

```dotenv
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=floor_shift
PGUSER=floor_shift
PGPASSWORD=自分で設定したDB用パスワード
```

`DATABASE_URL` を指定する方法も使えます。こちらを指定した場合はPG系設定より優先します。パスワードに特殊文字がある場合、URLではエンコードが必要なので、通常は上記のPG系設定が簡単です。

初期化し、管理者のログインパスワードを設定します。

```bash
python -m app.manage init --sample-data
```

- ログインID：`admin`
- パスワード：ここで入力したもの（12〜256文字、確認入力あり）
- サンプル：5フロア・50人、現在の半月と次の半月の希望シフト
- 現在の半月：締切済みで確定操作を試せます
- 次の半月：受付中で希望の提出を試せます
- 架空の従業員のうち35名を提出済みとして生成
- `--sample-data` を外すと、5フロアと管理者のみ作成します
- 初期化済みのDBへ再実行しても、既存の業務データを上書きしません

**DB接続用パスワードと、画面ログイン用パスワードは別のものです。デモ用の `demo1234` はPython版の固定パスワードではありません。**

従業員ログインも試す場合は、サンプル従業員 `e1` 用のアカウントを作成します。

```bash
python -m app.manage create-user --login employee01 --employee-id e1
```

このコマンドで別途入力したパスワードでログインできます。従業員の認証方式は未定だったため、今回はID・パスワードを仮採用しています。

## 3. バックエンドを起動する

`backend/` で、仮想環境が有効な状態で実行：

```bash
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- 稼働確認：<http://127.0.0.1:8000/api/health>
- API仕様：<http://127.0.0.1:8000/docs>

## 4. フロントエンドを起動する

別のターミナルで：

```bash
cd frontend
npm ci
npm run dev
```

<http://localhost:5173> を開きます。

- 管理者：`admin` と初期化時に設定したパスワード
- 従業員：`employee01` とアカウント作成時に設定したパスワード
- ログインした権限に応じて管理者／従業員画面へ移動
- 従業員はログイン後、受付中の半月へ切り替えて入力
- この一式はAPI接続が既定です。前のフロントエンドにあった `.env.development.local` を引き継ぐ場合、`VITE_DEMO_MODE=true` が残っていないか確認してください

保存・提出・確定した内容はPostgreSQLに残り、画面を再読み込みしても消えません。ただし、従業員の入力途中は「下書き保存」または「提出」を押すまで保存されません。

## 操作できること

- 管理者：フロア・従業員の登録と割り当て、半月ごとの締切設定、希望一覧、時間・フロア調整、個別／一括確定、見送り、未確定に戻す
- 日別タイムライン：フロア別の勤務時間、日単位と15分単位の人数、横棒から調整・確定
- 従業員：本人の希望だけを閲覧、割り当てフロアで登録、下書き、提出・再提出、全日休みの提出
- バックエンドでも15分単位・期間・締切・権限・時間重複を検証
- 希望の重複は確認後に許可、同じ人の確定重複はフロアを問わず禁止
- 一括確定は、対象のどれかに重複があれば全件変更しない
- 他の画面で更新された古いデータは409エラーにして、意図しない上書きを防止

## 従業員アカウントの追加・パスワード再設定

まず管理者画面で従業員を登録し、次のコマンドでIDを確認します。

```bash
python -m app.manage list-employees
python -m app.manage create-user --login staff02 --employee-id 表示された従業員ID
python -m app.manage reset-password --login staff02
```

従業員情報とログインアカウントは別です。画面で従業員を追加しただけではログインできません。アカウント発行・パスワード変更は今回CLIから行います。再設定すると、そのアカウントの既存ログインセッションを失効させます。管理者アカウントはDB制約により1つです。

## 現在の仮ルール

- 従業員認証：ID・パスワード方式。公開登録、メール認証、パスワード再発行メールは未実装
- 締切前の確定：禁止。締切後に確定
- 確定／見送りが残っている半月：受付再開不可。未確定に戻してから締切を延長
- 元の希望と最新の提出内容を保持。完全な操作履歴は未実装
- メモ：1シフト500文字、提出全体1000文字
- 確定シフトは管理者だけが閲覧

## データ・接続・構成

| パス | 内容 |
| --- | --- |
| backend/app/main.py | FastAPIのエンドポイント・例外応答 |
| backend/app/models.py | 入力スキーマ |
| backend/app/service.py | 締切・権限・状態遷移・重複検証 |
| backend/app/db.py | psycopg接続・トランザクション・永続化 |
| backend/app/schema.sql | PostgreSQLの初期化SQL |
| backend/app/auth.py | Argon2パスワード・セッション・CSRF・ログイン試行制限 |
| backend/app/manage.py | 初期化・アカウント管理CLI |
| frontend/src/data/api.ts | API接続・CSRF・更新番号の送信 |
| frontend/src/components/timeline.tsx | 日別タイムライン |
| docs/API.md | API契約とデータ構造 |
| docs/VALIDATION.md | 実施した検証と未検証範囲 |

PostgreSQLではマスタ・アカウント・セッションを別テーブルにし、半月ごとの希望・勤務シフトを `periods.data` のJSONBとして保存します。約50人向けの初期実装として、更新を1トランザクションで扱う構成です。任意のDBへSQLを直接実行した際は、APIの検証・更新番号チェックは適用されません。

## 検証コマンド

React：

```bash
cd frontend
npm test
npm run build
```

Python APIは専用のPostgreSQLテストDBを使用します。テストごとに一意なスキーマを作成・削除するため、接続ユーザーには `CREATE SCHEMA` 権限が必要です。

```bash
cd backend
python -m pip install -r requirements-dev.lock
export TEST_DATABASE_URL='postgresql://user:password@127.0.0.1:5432/floor_shift_test'
python -m pytest -q
```

PowerShellの環境変数は `$env:TEST_DATABASE_URL = '接続URL'` で設定します。`TEST_DATABASE_URL` がない場合、DBを使うテストはスキップされます。

## 公開環境へ移すとき

この一式はまずローカルで動かす構成です。公開時はHTTPSの同一オリジンでReactを配信し、`/api` をFastAPIへ転送します。`SHIFT_SECURE_COOKIE=true` と公開先に合わせた許可Host／Originを設定してください。DBは外部に直接公開せず、バックアップと復元手順を用意してください。`.env` はGitに含めません。

参考： [FastAPIのCookie応答](https://fastapi.tiangolo.com/advanced/response-cookies/) / [Psycopgのトランザクション](https://www.psycopg.org/psycopg3/docs/basic/transactions.html) / [PostgreSQLのロック](https://www.postgresql.org/docs/16/explicit-locking.html)
