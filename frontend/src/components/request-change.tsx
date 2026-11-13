import { shortDate, type Floor, type RequestChange } from "../domain/model";
export function RequestChangeView({change,floors}: {change:RequestChange;floors:Floor[]}) {
  const describe=(row:RequestChange["before"])=>row?`${shortDate(row.date)} ${row.start}〜${row.end} / ${floors.find(f=>f.id===row.floorId)?.name ?? "削除済みフロア"}${row.fullTime?" / フルタイム":""}${row.note?` / ${row.note}`:""}`:"休み希望（シフトなし）";
  return <div className="request-change"><strong>変更あり</strong><p>変更前：{describe(change.before)}</p><p>変更後：{describe(change.after)}</p></div>;
}
