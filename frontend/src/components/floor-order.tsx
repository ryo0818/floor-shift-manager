import { useState } from "react";
import { employmentNames, orderedEmployees, type Employee, type Floor } from "../domain/model";
import { Modal } from "./controls";
export function FloorOrder({floor, employees, busy, onSave, onClose}: {floor:Floor; employees:Employee[]; busy:boolean; onSave:(floor:Floor)=>Promise<void>; onClose:()=>void}) {
  const [ids,setIds]=useState(()=>orderedEmployees(employees.filter(e=>e.floorIds.includes(floor.id)),floor).map(e=>e.id));
  const [drag,setDrag]=useState<string|null>(null), [error,setError]=useState("");
  function move(id:string, index:number) { setIds(current=>{const next=current.filter(x=>x!==id);next.splice(Math.max(0,Math.min(index,next.length)),0,id);return next;}); }
  return <Modal title={`${floor.name}の表示順`} description="ドラッグ、または上下ボタンで並べ替えできます。保存すると半月表・タイムライン・PDFに反映します。" close={()=>!busy && onClose()}>
    <ol className="floor-order-list">{ids.map((id,index)=>{const person=employees.find(e=>e.id===id)!;return <li key={id} draggable={!busy} onDragStart={e=>{setDrag(id);e.dataTransfer.setData("text/plain",id);}} onDragEnd={()=>setDrag(null)} onDragOver={e=>{if(!busy && drag)e.preventDefault();}} onDrop={e=>{e.preventDefault();if(!busy && drag && ids.includes(drag))move(drag,index);setDrag(null);}}>
      <span>{index+1}. {person.name} <small>{employmentNames[person.employmentType ?? "partTime"]}</small></span><div>
      <button type="button" className="btn secondary" disabled={busy || index===0} aria-label={`${person.name}を上へ`} onClick={()=>move(id,index-1)}>↑</button>
      <button type="button" className="btn secondary" disabled={busy || index===ids.length-1} aria-label={`${person.name}を下へ`} onClick={()=>move(id,index+1)}>↓</button></div>
    </li>})}</ol>
    {!ids.length && <p>このフロアに従業員が割り当てられていません。</p>}
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="form-actions"><button className="btn secondary" disabled={busy} onClick={onClose}>キャンセル</button><button className="btn primary" disabled={busy} onClick={async()=>{try{await onSave({...floor,employeeOrder:ids});onClose();}catch(e){setError((e as Error).message);}}}>順番を保存</button></div>
  </Modal>;
}
