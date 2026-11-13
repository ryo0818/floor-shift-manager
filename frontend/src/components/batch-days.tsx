import { useState } from "react";
import { applyBatchRows, daysOf, shortDate, dayName, today, defaultShiftTimes, floorHours, startTimes, times, timeSelection, type Row, type Floor, type Period, type EmploymentType } from "../domain/model";
export function BatchDays({rows, floors, period, employmentType, disabled, onApply}: {rows:Row[];floors:Floor[];period:Period;employmentType?:EmploymentType;disabled:boolean;onApply:(rows:Row[])=>void}) {
  const [dates,setDates]=useState<string[]>([]), [work,setWork]=useState(true), [fullTime,setFullTime]=useState(false), [floorId,setFloor]=useState(floors.length===1?floors[0].id:""), [hours,setHours]=useState(defaultShiftTimes), [error,setError]=useState("");
  const current=today();
  const available=daysOf(period).filter(d=>d>=current);
  const fullHours=floorHours(floors.find(f=>f.id===floorId),employmentType);
  function apply() {
    try {
      if(disabled)return;
      const template=work?{id:"batch",date:period.start,floorId,...(fullTime?fullHours:hours),note:"",fullTime}:null;
      const next=applyBatchRows(rows,dates,template,period,floors,employmentType);
      if(rows.some(r=>dates.includes(r.date)) && !window.confirm("選んだ日の入力済みの希望・メモを置き換えます。よろしいですか？"))return;
      onApply(next);setDates([]);setError("");
    }catch(e){setError((e as Error).message);}
  }
  return <details className="batch-days"><summary>複数日をまとめて入力</summary><fieldset disabled={disabled}>
    <legend>① 日付を選択</legend><div className="batch-dates">{daysOf(period).map(d=><label key={d}><input type="checkbox" disabled={d<current} checked={dates.includes(d)} onChange={()=>setDates(dates.includes(d)?dates.filter(x=>x!==d):[...dates,d])}/>{shortDate(d)}（{dayName(d)}）</label>)}</div>
    <button type="button" className="text-btn" onClick={()=>setDates(available)}>今日以降を全選択</button><button type="button" className="text-btn" onClick={()=>setDates([])}>選択を解除</button>
    <label>② 希望を選択<select value={work?"work":"rest"} onChange={e=>setWork(e.target.value==="work")}><option value="work">勤務希望</option><option value="rest">休み希望</option></select></label>
    {work && <div className="batch-settings"><label>フロア<select value={floorId} disabled={floors.length===1} onChange={e=>setFloor(e.target.value)}><option value="">選択してください</option>{floors.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <label className="check-label"><input type="checkbox" checked={fullTime} onChange={e=>setFullTime(e.target.checked)}/>フルタイム {fullTime && `（${fullHours.start}〜${fullHours.end}）`}</label>
      {!fullTime && <div className="form-grid"><label>開始<select value={hours.start} onChange={e=>setHours(timeSelection(e.target.value))}>{startTimes.map(t=><option key={t}>{t}</option>)}</select></label><label>終了<select value={hours.end} onChange={e=>setHours({...hours,end:e.target.value})}>{times.map(t=><option key={t}>{t}</option>)}</select></label></div>}
    </div>}
    <p>選んだ日は同じ希望に置き換えます。反映後も日ごとに調整できます。</p>
    <button type="button" className="btn primary" disabled={!dates.length || (work && !floors.length)} onClick={apply}>③ {dates.length}日へ反映</button>
    {error && <p role="alert" className="form-error">{error}</p>}
  </fieldset></details>;
}
