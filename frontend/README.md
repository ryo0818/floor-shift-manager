# フロアシフト Reactフロントエンド

Python / FastAPI + PostgreSQL版です。全体のセットアップは `../README.md`、API契約は `../docs/API.md` を参照してください。

```bash
npm ci
npm run dev
```

API接続が既定です。`/api` は `http://127.0.0.1:8000` へプロキシします。`.env.development.local` で `API_PROXY_TARGET` を変更できます。

- `npm test`：フロントエンド側のルールを検証
- `npm run build`：型チェック・API用本番ビルド
- `npm run build:demo`：APIなしの操作確認用ビルド
- `npm run preview`：直前のビルドをプレビュー（開発プロキシはなし）

デモへ切り替える場合のみ `.env.development.local` に `VITE_DEMO_MODE=true` を設定して再起動します。デモの入力はメモリ上のみで、PostgreSQLには保存されません。

`tests/api.integration.mjs` はReactのAPIアダプターからVite・Python・DBへの通信を試す任意のテストです。使い捨てDBでadminとemployee01（e1）に同じテスト用パスワードを設定し、`SHIFT_TEST_PASSWORD` を指定して起動中のViteに対して実行してください。本番・日常利用のDBでは実行しないでください。
