# フロアシフト — React フロントエンド

作成済みの画面を React + TypeScript + Vite の独立したフロントエンドとして取り出したものです。公開済みサイトの内容・データは変更していません。

## 含まれるもの

フロア・スタッフ管理、シフト登録・編集・削除、日別・週別表示、フロア絞り込み、夜勤表示、PC/スマートフォン用スタイル、共通UIコンポーネント。

## 起動手順

Node.js 22.13.0以上を使用します。

```bash
npm install
npm run dev
```

http://localhost:5173 を開きます。

**Java / Spring Bootのサーバーは同梱していません。** `docs/API.md` のAPIを実装したサーバーが必要です。未接続の場合は読み込みエラーが表示されます。元の公開サイトのデータベースには接続しません。

開発中の `/api` は既定で `http://localhost:8080` に転送します。変更時は `.env.example` を `.env` にコピーして `API_PROXY_TARGET` を編集し、開発サーバーを再起動してください。

## ファイルの役割

| ファイル | 内容 |
| --- | --- |
| src/App.tsx | シフト画面、フォーム、表示ロジック、API通信 |
| src/styles.css | デザイン、レスポンシブ対応 |
| src/components/ui/ | ダイアログ、タブ、選択欄など |
| src/main.tsx | Reactの起動処理 |
| vite.config.ts | 開発サーバーとAPI転送設定 |
| docs/API.md | Spring Boot側で実装するAPIの現行仕様 |

## ビルド

```bash
npm run build
```

`dist/` が配布用ファイルです。本番では `/api` をSpring Bootへルーティングしてください。Viteの `server.proxy` は開発時のみ有効です。

例えば、`dist/` の内容をSpring Bootの `src/main/resources/static/` に配置して同じサーバーから配信できます。認証・認可・CSRF等はSpring Boot側の構成に合わせて設計します。このフロントエンドにはログイン機能はありません。

## 要件定義との関係

元の画面を引き継ぐためのたたき台です。休憩・夜勤・重複チェックは試作の挙動であり、確定要件ではありません。本人入力は未実装です。要件が決まったら画面とAPIを調整してください。

元のNext.js互換環境、Cloudflareのサーバー実装、公開設定、AI操作用のブラウザ連携は除きました。

## 確認範囲

元のプロジェクトに導入済みの依存関係でTypeScriptチェックとViteビルドを確認しています。Spring Bootとの結合試験、新規npm install、ブラウザ操作試験は未実施です。
