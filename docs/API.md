# Python API契約

APIは `/api`。JSONのcamelCaseはReactと統一しています。

## 認証

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | /api/session | `{session,csrfToken}`。未認証ならsessionはnull。CSRF用の匿名Cookieを発行 |
| POST | /api/session/login | `{id,password}`。認証成功時はCookieとCSRFトークンを再発行 |
| POST | /api/session/logout | ログインセッションを失効し、新しい匿名Cookie・CSRFトークンを返す |
| GET | /api/workspace?period=YYYY-MM-01または16 | 認証済み本人の権限で半月データを取得 |
| POST | /api/commands | 業務操作。共通項目はperiod、type、expectedRevision |
| GET | /api/health | APIプロセスの稼働確認。DB接続確認は起動時と実操作で実施 |

変更系リクエストは全て `X-CSRF-TOKEN` とセッションCookieが必要です。ログイン前にもGET /sessionを呼びます。CookieはHttpOnly / SameSite=Lax、本番ではSecureも有効化します。セッションは8時間、未認証用は30分で失効します。

従業員のemployeeIdとroleはサーバー側アカウントに紐付けます。本人以外のIDをリクエストに付けて参照・提出する方法はありません。

## workspace

Reactの `src/domain/model.ts` のWorkspaceに、全体の更新番号 `revision` を加えた形です。

- floors、employees：管理者は全件、従業員は本人と割り当てフロアのみ
- period：id / start / end / deadline。締切はタイムゾーン付きISO日時
- submissions：従業員は本人のみ。管理者への応答ではdraftRowsとdraftNoteを空にし、dirty=falseとする
- shifts：管理者のみ返す。従業員には空配列
- policy.allowEarlyConfirm：現在false
- revision：取得した値を変更リクエストのexpectedRevisionで送信

管理用shiftのIDは希望行のIDとは別です。提出時にサーバーでUUIDを発行します。originalに元の希望行を保持します。

## commands

| type | 追加の入力 | 権限 |
| --- | --- | --- |
| saveDraft | rows、note | 従業員本人、締切前 |
| submit | acknowledgeOverlap | 従業員本人、締切前 |
| saveShift | shift、acknowledgeOverlap | 管理者 |
| deleteShift | id | 管理者、未確定のみ |
| setStatus | ids、status | 管理者 |
| setDeadline | deadline | 管理者 |
| saveFloor | floor | 管理者 |
| saveEmployee | employee | 管理者 |

- rows：id、date、start、end、floorId、note
- shift：上記にemployeeIdを加える。statusやoriginalは送信しない
- status：pending / confirmed / declined
- floor：id、name、color（#RRGGBB）
- employee：id、name、floorIds
- 成功：`{ok:true,revision:更新後の番号}`
- 400：業務入力エラー、401：未認証・期限切れ、403：権限・CSRF・接続元違反、409：競合・締切・状態違反、422：入力スキーマ違反、429：ログイン試行制限
- 失敗：`{message:"日本語の説明"}`。422ではfieldsも返す

全体で1つの更新番号を持ちます。別の利用者や別の半月で更新があった場合も409になり得ます。再取得後に操作し直します。サーバーでの自動上書き・自動再送は行いません。

## PostgreSQL

`metadata`、`floors`、`employees`、`periods`、`accounts`、`sessions`、`login_attempts`。

マスタと半月データはJSONB、アカウント・セッション・更新番号は専用カラム。`periods.data` にその半月のsubmissions/shiftsを保存します。SQLはパラメータ化しています。業務変更はPostgreSQLのトランザクションアドバイザリロックを取得してから更新番号・業務ルールを検証し、成功時だけコミットします。読み取りはREPEATABLE READで一貫したスナップショットを返します。

初期スキーマは `python -m app.manage migrate`、初期データと管理者作成は `python -m app.manage init`。スキーマの初期化は冪等ですが、既存の将来バージョンを変更する自動移行機構ではありません。

## 現在の境界

従業員の公開アカウント登録、メール再発行、完全な監査ログ、確定シフトの従業員公開は未実装。約50人の初期運用を想定し、書き込みは直列化しています。高負荷・大量データ向けに最適化したDBスキーマではありません。
