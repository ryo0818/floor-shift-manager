import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { defaultShiftTimes, timeSelection, startTimes, resolveFullTime, times, shortDate, dayName, conflicts, validateRow, type Row, type Floor, type Period } from "../domain/model";
export function InlineDay({ date, rows, floors, period, disabled, past = false, onChange, onRemove }: {
  date: string; rows: Row[]; floors: Floor[]; period: Period; disabled: boolean; past?: boolean;
  onChange: (r: Row) => void; onRemove: (r: Row) => void;
}) {
  const [emptyId] = useState(()=>`day-${date}`);
  const placeholder: Row = {id:emptyId, date, ...defaultShiftTimes, floorId:floors.length===1 ? floors[0].id : "", note:""};
  const displayed = rows.length ? rows : past ? [] : [placeholder];
  const locked = disabled || past;
  return <article className="day-card">
    <div className="day-heading"><h2>{shortDate(date)} <span className={dayName(date)==="日" ? "sunday" : ""}>{dayName(date)}</span></h2></div>
    {displayed.map((row, index)=>{
      const real = rows.some(r=>r.id===row.id);
      let error="";
      if(real && !past) {try{validateRow(row,period,floors.map(f=>f.id));}catch(e){error=(e as Error).message;}}
      const overlap = real && !past && conflicts(rows).some(p=>p.a.id===row.id || p.b.id===row.id);
      const change=(patch: Partial<Row>)=>onChange(resolveFullTime({...row,...patch}, floors));
      return <div key={row.id}><fieldset className="inline-shift" disabled={locked || !floors.length}>
        <legend>希望 {index+1}</legend>
        <label>フロア<select aria-label={`${shortDate(date)} 希望${index+1} フロア`} value={row.floorId} disabled={floors.length===1 && row.floorId===floors[0].id} onChange={e=>change({floorId:e.target.value})}>
          <option value="">選択してください</option>
          {row.floorId && !floors.some(f=>f.id===row.floorId) && <option value={row.floorId}>割り当て外（要変更）</option>}
          {floors.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
        </select></label>
        <label className="full-time-choice"><input type="checkbox" checked={!!row.fullTime} onChange={e=>change({fullTime:e.target.checked, ...(!e.target.checked ? defaultShiftTimes : {})})}/>フルタイム</label>
        {row.fullTime && <small>フロア設定の時間：{row.start}〜{row.end}</small>}
        <div className="inline-times">
          <label>開始<select aria-label={`${shortDate(date)} 希望${index+1} 開始`} value={row.start} disabled={!!row.fullTime} onChange={e=>change(timeSelection(e.target.value))}>
            <option value="">未入力</option>{row.start && !startTimes.includes(row.start) && <option value={row.start} disabled>{row.start}（保存済み）</option>}{startTimes.map(t=><option key={t} value={t}>{t}</option>)}
          </select></label>
          <span aria-hidden="true">〜</span>
          <label>終了<select aria-label={`${shortDate(date)} 希望${index+1} 終了`} value={row.end} disabled={!!row.fullTime} onChange={e=>change({end:e.target.value})}>
            <option value="">未入力</option>{times.map(t=><option key={t} value={t}>{t}</option>)}
          </select></label>
        </div>
        <label>メモ（任意）<input aria-label={`${shortDate(date)} 希望${index+1} メモ`} maxLength={500} value={row.note} placeholder="この時間帯についての希望" onChange={e=>change({note:e.target.value})}/></label>
        {error && <p className="form-error" role="status">{error}</p>}
        {overlap && <p className="form-error" role="status">同じ日の希望時間が重複しています。保存・提出時に確認してください。</p>}
      </fieldset>
        {!real && <button type="button" disabled={locked || !row.floorId} className="text-btn" onClick={()=>change({})}>この時間で希望を入力</button>}
        {real && <button type="button" disabled={locked} className="text-btn" onClick={()=>onRemove(row)}><Trash2 size={16}/>この行を削除</button>}
      </div>;
    })}
    {past ? <p className="rest-day">過去日：変更できません</p> : !rows.length && <p className="rest-day">未入力：休み希望</p>}
    {!!rows.length && <button type="button" className="text-btn" disabled={locked || !floors.length} onClick={()=>onChange({...placeholder,id:`row-${Date.now()}-${Math.random().toString(36).slice(2)}`})}><Plus size={16}/>行を追加</button>}
  </article>;
}
