# Spring Boot API契約案

フロントエンドのみの実装です。以下のAPIはバックエンド側で作成してください。元のZIPの `/api/shifts` とは異なり、今回の要件に合わせた新しい契約です。型の正本は `src/domain/model.ts`、呼び出しは `src/data/api.ts` です。

## 共通

- JSONのキーはcamelCase。
- 通信先は同一オリジンの `/api`。Cookie認証を想定し `credentials: include` で送信。
- GET /api/session でCSRFトークンを取得。更新リクエストは `X-CSRF-TOKEN` に設定。
- 認証方式の最終決定時にSpring Securityの構成と整合させる。
- エラーは適切なステータスと `{"message":"日本語の説明"}` を返す。
- 期間キー `period` は `YYYY-MM-01` または `YYYY-MM-16`。
- 日付・時刻は日本時間。締切はISO 8601のオフセット付き日時。シフトの時刻はHH:mm。
- 15分単位、日付またぎ不可、開始＜終了。休憩のフィールドなし。
- 永続化・整合性・認証認可・同時操作制御はサーバーの責務。画面のボタン非表示は認可にならない。

## GET /api/session

未認証でも200とCSRFトークンを返す想定。

```json
{"session":null,"csrfToken":"token"}
```

認証済みの例：

```json
{"session":{"role":"admin","name":"管理者"},"csrfToken":"token"}
```

従業員の場合：

```json
{"session":{"role":"employee","name":"田中 葵","employeeId":"e1"},"csrfToken":"token"}
```

従業員の認証経路は未定。画面から任意のemployeeIdを指定して本人としてログインするAPIを本番に設けないこと。

## POST /api/session/login

```json
{"id":"管理者ID","password":"入力したパスワード"}
```

成功時はセッションCookieを設定し、GET /api/sessionと同じ形のJSONを返す。デモのパスワードは本番で使用しない。ログイン失敗は401等で返す。

## POST /api/session/logout

リクエスト `{}`。セッションを無効化する。成功は200 `{}` または204。

## GET /api/workspace?period=YYYY-MM-01

`Workspace` 型のJSONを返す。

```json
{
  "floors":[{"id":"f1","name":"1F ホール","color":"#236b59"}],
  "employees":[{"id":"e1","name":"田中 葵","floorIds":["f1"]}],
  "period":{"id":"2026-10-01","start":"2026-10-01","end":"2026-10-15","deadline":"2026-09-25T23:59:00+09:00"},
  "submissions":[],
  "shifts":[],
  "policy":{"allowEarlyConfirm":false}
}
```

### Row

```json
{"id":"r1","date":"2026-10-03","start":"09:00","end":"17:00","floorId":"f1","note":"調整可能"}
```

### Shift

Rowの項目に以下を追加する。

- employeeId: 対象従業員
- status: pending / confirmed / declined
- original: 調整前のRow

### Submission

```json
{
  "employeeId":"e1",
  "draftRows":[],
  "draftNote":"",
  "submittedRows":[],
  "submittedNote":"",
  "submittedAt":null,
  "dirty":false
}
```

- submittedAtがnullなら未提出。提出済みでsubmittedRowsが空なら全日休み希望。
- dirtyは保存済みの下書きに未提出の変更があることを示す。
- 管理者には全員の提出内容を返すが、下書きのdraftRowsは空、draftNoteは空文字、dirtyはfalseにする。
- 従業員には本人のEmployeeとSubmission、および割り当てられたFloorだけを返す。
- 従業員のshiftsは空配列とし、確定内容や管理者の調整結果を配信しない。

## POST /api/commands

共通で `{ "period":"2026-10-01", "type":"...", ... }` を送信。成功時200 `{ "ok":true }` または204。画面は成功後にworkspaceを再取得する。

### 従業員のみ

| type | 追加フィールド | 動作 |
| --- | --- | --- |
| saveDraft | rows: Row[], note: string | 本人の下書きを保存 |
| submit | acknowledgeOverlap: boolean | 保存済みの下書きを半月分まとめて提出・再提出 |

本人はセッションから特定する。締切後は両操作を拒否する。空のrowsの提出は全日休み希望。希望時間が重複していてacknowledgeOverlap=falseなら確認を求めるエラーにする。

提出時にsubmittedRows・submittedNote・submittedAtを更新し、希望から管理対象の未確定Shiftを作成する。管理者の確定／見送り済みの内容を再提出で上書きする競合を防止する。締切前の確定の仕様が未定のため、デモは管理処理済みの場合の再提出を拒否している。

### 管理者のみ

| type | 追加フィールド | 動作 |
| --- | --- | --- |
| saveShift | shift: Row + employeeId, acknowledgeOverlap: boolean | 未確定シフトの追加・調整 |
| deleteShift | id: string | 未確定シフトの削除。提出記録は保持 |
| setStatus | ids: string[], status: pending / confirmed / declined | 個別／一括の状態変更 |
| setDeadline | deadline: ISO日時 | 対象期間の締切設定 |
| saveFloor | floor: Floor | フロアの登録・編集 |
| saveEmployee | employee: Employee | 従業員の登録・編集と割り当て |

IDは画面で生成するUUIDを許容する契約。更新時は対象存在・権限を検証する。JSON内のoriginalやstatusはsaveShiftで任意に上書きさせず、サーバーで保護する。

### setStatusの整合性

- pending → confirmed / declined、confirmed / declined → pendingのみ許可。
- 確定済みの直接編集・削除を拒否し、未確定へ戻す操作を必要とする。
- confirmedへの変更時は、同一従業員・同日の時間の重複をチェックする。
- 条件：`既存開始 < 新終了 AND 既存終了 > 新開始`。終了と開始が等しい場合は許可。
- 対象同士、対象と既存confirmedの両方を確認。フロアが異なっても重複禁止。
- 対象全件を一つのトランザクションで扱い、1件でも重複すれば変更しない。
- 同時更新でチェックをすり抜けないよう、対象従業員・日付等で整合性を保護する。
- 409のmessageに重複する氏名・日付・時間・フロアを含めると画面に表示される。

### 暫定の入力上限

フロア名・従業員名は50文字、シフトメモは500文字、提出全体メモは1000文字。これらは要件未確定のため暫定値。フロア名は重複不可。API側でも同じ制約を実装する。
