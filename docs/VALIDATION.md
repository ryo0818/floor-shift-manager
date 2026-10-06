# 今回の整理版の確認

- React側テスト7件成功、TypeScript型チェック・本番ビルド成功。
- Pythonの全アプリファイルの構文チェック成功。
- Python接続設定、expectedRevisionの送信処理、ボタン表示修正を確認。
- Argon2の修正済みバージョン25.1.0を両lockファイルで確認。
- 今回はDB接続テスト、Python依存関係の再インストール、ブラウザ実機確認は実施していません。
- 下記は整理前のPython版を作成した際の検証記録であり、今回の再実行結果ではありません。

---

# 検証結果

## 実施済み

- Python 3.12で構文チェック・未定義名チェック成功。
- Python APIテスト：18件成功。PostgreSQLプロトコル対応の **PGlite + psycopg** 環境で実行。
- 検証対象：ログイン・セッション更新/失効・CSRF・Origin制限、ログイン試行制限、本人以外の情報を返さない制御、マスタ登録、15分単位、期間/締切、空欄の休み扱い、再提出、入力ID衝突対策、状態遷移、一括確定失敗時の全件取り消し、更新番号の競合、新しいAPIインスタンスから同じDBの保存済みデータを読み込む動作。
- React APIアダプター → Viteプロキシ → FastAPI → PGliteのHTTP結合テスト成功。匿名セッション、管理者ログイン、従業員ログイン、下書き、提出、時間変更、確定、セッション復元、ログアウトを確認。
- React側のルールテスト：7件成功。
- ReactのTypeScript型チェック・本番ビルド成功。
- Python依存関係の `pip check` 成功。

## 未検証・制約

- この環境ではネイティブのPostgreSQLサーバーをインストール・起動できなかったため、実際のPostgreSQL 16サービスとDocker Compose起動は未検証です。
- PGliteはネイティブPostgreSQLの複数プロセス動作を完全には再現しません。同時更新テストも通っていますが、実際のPostgreSQLでトランザクション・複数利用者の競合・運用性能を再検証してください。
- PGliteは今回の検証にのみ使用しており、アプリ・納品物の依存関係には含めていません。アプリの接続先はPostgreSQLです。
- ブラウザ実機での画面表示・クリック操作は未検証。HTTPテストはReactの通信モジュールを実際に使用していますが、ブラウザのCookie規則・レイアウト・ダイアログ操作の検証を代替するものではありません。
- TestClientからhttpxを使う際の非推奨警告が1件あります。テストは全件成功しています。
- 本番環境のHTTPS・バックアップ/復元・長時間/負荷試験は未実施です。

## PostgreSQLで再実行する

READMEに従って専用のテストDBを準備し、backendで実行します。

```bash
python -m pip install -r requirements-dev.lock
export TEST_DATABASE_URL='postgresql://user:password@127.0.0.1:5432/floor_shift_test'
python -m pytest -q
```

テストごとに一意のスキーマを作成してデータを分離し、終了時に削除します。テスト用ユーザーにはスキーマ作成権限が必要です。
