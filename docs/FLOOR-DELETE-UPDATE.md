# 2026-10-12 フロア削除機能

管理者で「従業員・フロア」を開き、フロア右側の「削除」を押します。確認画面に割り当て解除の対象人数を表示し、「実行する」で削除します。

- 管理者のみ操作できます。
- 削除したフロアは、全従業員の勤務可能フロアからも解除します。従業員・ログインアカウントは削除しません。
- 割り当てフロアがなくなった従業員には、別のフロアを割り当ててください。
- 全期間の勤務シフト（未確定・確定・見送り）、元の希望、提出済み希望、下書きに参照がある場合は削除できません。履歴を失わないための制約です。
- 使用中の場合や更新競合がある場合は、割り当ても含めて変更しません。
- フロアが最後の1件でも未使用なら削除可能。希望の追加には新たなフロア登録と割り当てが必要です。
- 削除は元に戻せません。使用中フロアを今後の選択肢から外す「無効化」は今回含みません。

## 更新方法

前回追加したアカウント作成、管理者パスワードリセット、本人のパスワード変更、チャートのドラッグ操作も含む最新版です。

設定済みの `backend/.env`、公開用Nginxの設定、Git履歴は保持してください。frontend/backend のソースを更新後、両方のDockerイメージをビルドし、コンテナを作り直します。

プロジェクト直下で（前回のコンテナ名・ポートを使用する場合）：

```bash
docker build -t floor-shift-backend ./backend
docker build -t floor-shift-frontend ./frontend
docker stop backend
# 10月7日の更新を未反映の場合にも対応。既存データは残します。
docker run --rm --network floor-shift --env-file backend/.env floor-shift-backend python -m app.manage migrate
```

migrate が成功したことを確認してから：

```bash
docker rm backend
docker run -d --name backend --network floor-shift --env-file backend/.env floor-shift-backend
docker stop frontend
docker rm frontend
docker run -d --name frontend --network floor-shift -p 8080:80 -e BACKEND_URL=http://backend:8000 floor-shift-frontend
```

実際の公開環境のポート・ネットワーク・追加オプションが違う場合は既存設定を引き継いでください。外側のNginxがDockerの名前解決結果を保持している構成では、新コンテナ起動後にそのNginxの設定再読み込みが必要な場合があります。
ブラウザを強制再読み込みします。MacのChromeは Command + Shift + R。

フロア削除自体のDBスキーマ変更はありません。DB初期化や削除は不要です。

## API

既存の POST /api/commands に `type: "deleteFloor", id: "フロアID"` を追加。
共通の period / expectedRevision / セッションCookie / CSRFトークンが必要です。
全期間の参照チェック・フロア削除・割り当て解除・更新番号の変更を同一トランザクションで実行します。
