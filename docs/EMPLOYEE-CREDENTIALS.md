# 従業員ログインの自動発行

管理者が新規従業員を保存すると、`emp-` から始まる固有のログインIDとランダムな16文字の初期パスワードが発行されます。従業員の保存とアカウント発行は同時に確定します。

- 「従業員・フロア」→「ログインアカウント管理」で対象を選び、IDを確認します。「初期パスワードを表示」を押すと確認・コピーできます。
- 既存従業員のログインIDやパスワードは更新されません。未発行の従業員は「アカウントを発行」で登録できます。
- 本人は初回ログイン時にパスワードの変更が必要です。変更後は初期パスワードを再表示できません。
- 管理者の「パスワードを再発行」は同じIDに新しい仮パスワードを発行し、ログイン中の端末もすべてログアウトします。旧版やCLIで手入力した仮パスワードは復元できません。必要なら再発行してください。

## 更新手順

1. バックエンド・フロントエンドを同じ版に更新します。Dockerの場合は両方のイメージを再ビルドします。
2. 暗号化キーを一度だけ生成し、出力された `SHIFT_CREDENTIAL_KEY=...` の行を **`backend/.env`** に設定します。既に設定済みなら生成し直さないでください。
3. 新しいバックエンドで `python -m app.manage migrate` を実行し、既存DBにカラムを追加します。`init` のやり直しは不要です。
4. バックエンドを更新後の環境変数で起動し、フロントエンドも更新します。

既存VPSで `floor-shift` ネットワークと `floor-shift-backend` イメージを使う場合の手順2・3：

```bash
docker run --rm floor-shift-backend python -m app.manage generate-credential-key

# 生成された行を backend/.env に設定してから実行
docker run --rm --network floor-shift --env-file backend/.env \
  floor-shift-backend python -m app.manage migrate
```

ローカルで実行する場合は `backend/` で `pip install -r requirements.txt` の後、上記と同じPythonコマンドを使います。Dockerの `--env-file` の変更を反映するには、バックエンドコンテナの再作成が必要です。

ログインの照合にはArgon2ハッシュを使います。管理者が確認できる仮パスワードだけを別に暗号化し、本人の変更後は削除します。キーはGitに登録せず、DBとは別に保管してください。キーがないと新規発行・再発行はできません。キーを紛失した場合、以前の仮パスワードの表示には元のキーが必要です。元のキーを復元できなければ、新しいキーを設定して対象者へ再発行してください。

## API

以下は管理者のみ利用できます。更新にはCSRFトークンが必要です。

| API | 内容 |
| --- | --- |
| `GET /api/accounts` | ID、従業員ID、変更待ちと表示可否。初期パスワードは含めない |
| `POST /api/accounts` | `{ "employeeId": "..." }` で既存従業員に自動発行 |
| `GET /api/accounts/initial-password?login={login}` | 表示可能な初期パスワードを返す。キャッシュしない |
| `POST /api/accounts/reset-password` | `{ "login": "..." }` で再発行、既存セッションを失効 |

`saveEmployee` は新規登録時だけ自動発行します。本人が `POST /api/session/change-password` で変更すると表示用の暗号文を削除します。
