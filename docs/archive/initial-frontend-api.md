> 旧設計の参考資料です。現行APIは [../API.md](../API.md) を参照してください。

# 現行フロントエンドのAPI仕様

これは画面を動かすための現行インターフェースです。要件確定後にリソース別のREST APIへ分割する場合は `src/App.tsx` のfetch呼び出しも変更してください。

## GET /api/shifts?from=YYYY-MM-DD&to=YYYY-MM-DD

`date` がfrom〜to（両端含む）にあるシフトと、全フロア・全スタッフを返します。画面は夜勤のため週の開始日の前日から取得します。成功はHTTP 200。

```json
{
  "floors": [{"id":"floor-1","name":"1F ホール","color":"#236b59"}],
  "members": [{"id":"member-1","name":"山田 太郎"}],
  "shifts": [{
    "id":"shift-1",
    "member_id":"member-1",
    "floor_id":"floor-1",
    "date":"2026-10-03",
    "start":"09:00",
    "end":"17:00",
    "start_at":29849760,
    "end_at":29850240,
    "break_minutes":60,
    "note":"ホール担当"
  }]
}
```

配列は0件でも必ず返してください。IDは文字列。日付・時刻は日本時間です。`start_at` / `end_at` はUnixエポックからの**分数**であり、秒やミリ秒ではありません。Javaでは日付と時刻を結合し、`Asia/Tokyo` で解釈して `toEpochSecond() / 60` で算出します。終了が開始より前なら終了日は翌日とします。

日別の配置時間は当日に重なる部分（休憩含む）。週別の勤務時間と各シフトの実働は休憩を除きます。

## POST /api/shifts

`Content-Type: application/json`。新規はIDを省略、更新は既存IDを付けます。

フロア登録:

```json
{"type":"floor","name":"1F ホール","color":"#236b59"}
```

スタッフ登録:

```json
{"type":"member","name":"山田 太郎"}
```

シフト登録:

```json
{"type":"shift","member_id":"member-1","floor_id":"floor-1","date":"2026-10-03","start":"09:00","end":"17:00","break_minutes":60,"note":"ホール担当"}
```

削除:

```json
{"type":"shift","id":"shift-1","action":"delete"}
```

フロア削除は `type: "floor"`、スタッフ削除は `type: "member"`。画面からは他の表示用フィールドも送信される場合があります。

登録・更新の成功（200または201）:

```json
{"ok":true,"id":"shift-1"}
```

削除の成功（200）:

```json
{"ok":true}
```

エラーは適切なHTTPステータスと日本語のメッセージ:

```json
{"error":"このメンバーには同じ時間帯のシフトがあります。"}
```

## サーバー側チェック（試作の挙動）

- 有効な日付、00:00〜23:59の時刻、実在するスタッフ・フロア
- 名前は空白のみ不可、50文字まで。フロア名は重複不可
- 色は #RRGGBB、メモは300文字まで
- 開始と終了が同時刻ならエラー。終了が開始より前なら翌日
- 休憩は0以上の整数、勤務時間より短いこと
- 同じスタッフの重複を禁止（別フロア・夜勤との重複も含む）
- 重複条件: `existing.start_at < new.end_at AND existing.end_at > new.start_at`
- 編集対象自身は重複判定から除外。前の終了と次の開始が一致する場合は可
- シフトが参照するフロア・スタッフは削除不可
- start_at / end_at はサーバーで計算。更新時に送られても信用せず再計算
- 複数の同時リクエストでも重複登録が起きないようトランザクション等で保護
- 認証・認可はSpring Boot側で実施

入力エラー400、重複409、読込不能503などを想定します。
