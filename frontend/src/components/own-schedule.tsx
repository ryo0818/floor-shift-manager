import { daysOf, shortDate, dayName, type Workspace } from "../domain/model";

export function OwnSchedule({ data }: { data: Workspace }) {
  const confirmed = data.confirmedSchedule ?? [];
  const submission = data.submissions[0];
  const describe = (r: {start: string; end: string; fullTime?: boolean}, floor: string) =>
    `${floor} ${r.start}〜${r.end}${r.fullTime ? "（フルタイム）" : ""}`;
  return <details className="own-schedule" open>
    <summary>自分の確定シフト・提出した希望（確定 {confirmed.length}件）</summary>
    <p>管理者が確定した勤務予定です。下書きや入力途中の変更は、提出した希望には含まれません。</p>
    <p>確定シフトがない日は、休みが確定したという意味ではありません。変更後は再読み込みして最新の予定を確認してください。</p>
    <div className="schedule-scroll"><table>
      <thead><tr><th>日付</th><th>提出した希望</th><th>確定した勤務</th></tr></thead>
      <tbody>{daysOf(data.period).map(date=>{
        const requests = submission?.submittedRows.filter(r=>r.date===date) ?? [];
        const shifts = confirmed.filter(r=>r.date===date).sort((a,b)=>a.start.localeCompare(b.start));
        return <tr key={date}><th>{shortDate(date)}（{dayName(date)}）</th>
          <td>{!submission?.submittedAt ? "未提出" : requests.length ? requests.map(r=><div key={r.id}>{describe(r,data.floors.find(f=>f.id===r.floorId)?.name ?? "割り当て外のフロア")}</div>) : "休み希望"}</td>
          <td>{shifts.length ? shifts.map(s=><div className="confirmed-work" key={s.id}><strong>確定済み</strong> {describe(s,s.floorName)}</div>) : "確定シフトなし"}</td></tr>;
      })}</tbody>
    </table></div>
  </details>;
}
