# アカウント管理・パスワード変更・ドラッグ調整（2026-10-07）

## 追加した機能

- 管理者：フロア・従業員管理の「ログインアカウント管理」から従業員を選び、ログインIDと仮パスワードを登録。
- 登録済み従業員：同じ画面で管理者が仮パスワードにリセット。確認後に実行し、対象の全ログインセッションを失効。
- 本人：ヘッダーの「パスワード変更」から現在のパスワードを確認して変更。変更時に他端末のセッションを失効。
- 初期・リセット後の仮パスワード：本人による変更を必須化。変更前はシフトAPIや管理APIも拒否。ログアウトは可能。
- パスワードは12〜256文字、現在と異なるもの。ハッシュのみ保存し、APIの一覧にパスワードは含めない。
- 管理者によるメール送信は行わない。設定した仮パスワードを管理者から本人に伝える。
- 管理者自身がパスワードを忘れた場合は、既存の `python -m app.manage reset-password --login admin` を使用。
- 既存アカウントのパスワードは引き継ぐ。移行しただけでは変更必須にしない。

## チャート操作

- 管理者の「日別タイムライン」で未確定の横棒を左右にドラッグすると勤務時間を移動。
- 左端・右端をドラッグすると開始時刻・終了時刻を調整。
- 15分単位、最低15分、00:00〜23:45の範囲。日付またぎは不可。
- 希望の重複は警告・確認後に保存。キャンセル、通信失敗、競合時には表示を元に戻す。
- 確定済み・見送りは直接ドラッグ不可。未確定に戻して操作する。
- 保存後に人数集計を更新する。ドラッグ中の人数は保存済みデータを表示。
- クリックによる従来の編集・確定操作も維持。フロア変更は編集画面から行う。
- フロア間ドラッグ、上下移動による従業員変更、日をまたぐ移動は今回含めない。
- 時間軸は0〜24時。横スクロールで対象時刻へ移動する。

## 既存環境への反映（Docker）

既存の設定済み `backend/.env` を保持し、frontend/backend のソースを更新してください。
このZIPには前回配布のFrontend・BackendのDockerfileも含めています。
DBコンテナを新たに作る必要はありません。外部PostgreSQLも引き続き使用できます。

プロジェクト直下で：

```bash
# 新しいイメージをビルド
 docker build -t floor-shift-backend ./backend
 docker build -t floor-shift-frontend ./frontend

# 既存Backendを停止してから追加カラムを反映（既存データは保持）
 docker stop backend
 docker run --rm --network floor-shift --env-file backend/.env floor-shift-backend python -m app.manage migrate
```

**migrate が正常終了してから**コンテナを更新してください。今回は `init` やDB削除は不要です。

```bash
 docker rm backend
 docker run -d --name backend --network floor-shift --env-file backend/.env floor-shift-backend
 docker stop frontend
 docker rm frontend
 docker run -d --name frontend --network floor-shift -p 8080:80 -e BACKEND_URL=http://backend:8000 floor-shift-frontend
```

上記は前回案内したコンテナ名・ポートの例です。公開中の環境で別のポート、ネットワーク、リバースプロキシ設定を使っている場合は既存設定を引き継いでください。
`SHIFT_ALLOWED_ORIGINS` と `SHIFT_ALLOWED_HOSTS` も公開URLに合わせた既存値を保持します。
ブラウザを再読み込みしてからログインしてください。

Dockerを使わない場合は、backendで仮想環境を有効化して `python -m app.manage migrate` を実行し、APIを再起動します。

## API追加

| メソッド・パス | 権限・内容 |
|---|---|
| GET /api/accounts | 管理者：従業員アカウント一覧（ID、従業員ID、変更必須状態のみ） |
| POST /api/accounts | 管理者：login / employeeId / password を指定して作成 |
| POST /api/accounts/reset-password | 管理者：login / password を指定してリセット |
| POST /api/session/change-password | 本人：currentPassword / newPassword を指定。新しいsessionとcsrfTokenを返す |

変更系APIには既存のCSRF・Originチェックを適用。パスワード確認の連続失敗にも回数制限を設ける。
`session.mustChangePassword` がtrueの間は、セッション確認・ログアウト・パスワード変更以外の認証必須APIを拒否する。
DBは `accounts.must_change_password` を追加。マイグレーションは再実行可能。
