import { useRef, useState, type PointerEvent } from "react";
import { minutes, statusNames, type Shift } from "../domain/model";
import { dragShift, type DragMode } from "../domain/drag";
export function DragBar({shift, index, from, span, busy, name, onDetail, onMove}: {
  shift: Shift; index: number; from: number; span: number; busy: boolean; name: string;
  onDetail: () => void; onMove: (s: Shift) => Promise<void>;
}) {
  const [preview, setPreview] = useState<Shift | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const gesture = useRef<{x: number; width: number; mode: DragMode; scroll: number; scroller: HTMLElement | null; moved: boolean} | null>(null);
  const suppressClick = useRef(false);
  const shown = preview || shift;
  function begin(e: PointerEvent<HTMLButtonElement>) {
    if (busy || saving || shift.status !== "pending" || e.button !== 0) return;
    const target = e.target as HTMLElement;
    const scroller = e.currentTarget.closest<HTMLElement>(".timeline-scroll");
    gesture.current = {x:e.clientX, width:e.currentTarget.parentElement!.getBoundingClientRect().width,
      mode:(target.dataset.handle as DragMode) || "move", scroll:scroller?.scrollLeft || 0, scroller, moved:false};
    suppressClick.current=false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function position(e: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current;
    if (!g) return null;
    const dx = e.clientX-g.x + ((g.scroller?.scrollLeft || 0)-g.scroll);
    if (Math.abs(dx)>4) g.moved=true;
    return g.moved ? dragShift(shift, dx/g.width*span, g.mode) : null;
  }
  async function end(e: PointerEvent<HTMLButtonElement>) {
    const result = position(e);
    suppressClick.current=!!gesture.current?.moved;
    gesture.current=null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!result || (result.start===shift.start && result.end===shift.end)) {setPreview(null);return;}
    setPreview(result);setSaving(true);setError("");
    try { await onMove(result); }
    catch(e) {setError((e as Error).message);}
    finally {setPreview(null);setSaving(false);}
  }
  return <>
    <button disabled={busy || saving} className={`timeline-bar ${shift.status} ${preview ? "dragging" : ""}`}
      style={{left:`${(minutes(shown.start)-from)/span*100}%`, width:`${(minutes(shown.end)-minutes(shown.start))/span*100}%`, top:index*40+6,
        touchAction:shift.status==="pending" ? "none" : "auto"}}
      onPointerDown={begin} onPointerMove={e=>{const s=position(e);if(s)setPreview(s);}}
      onPointerUp={e=>{void end(e);}}
      onPointerCancel={()=>{gesture.current=null;suppressClick.current=true;setPreview(null);}}
      onLostPointerCapture={()=>{if(gesture.current){gesture.current=null;setPreview(null);suppressClick.current=true;}}}
      onKeyDown={e=>{if(e.key==="Enter" || e.key===" ") suppressClick.current=false;}}
      onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}onDetail();}}
      aria-label={`${name} ${shown.start}〜${shown.end} ${statusNames[shift.status]} 詳細と操作`}
      title={`${shown.start}〜${shown.end} ${shift.status==="pending" ? "ドラッグで移動、両端で時間調整。クリックで詳細" : "調整するには未確定に戻してください"}`}>
      {shift.status==="pending" && <span className="drag-handle start" data-handle="start" aria-hidden="true">⋮</span>}
      <span>{shown.start}–{shown.end} · {saving ? "保存中…" : statusNames[shift.status]}</span>
      {shift.status==="pending" && <span className="drag-handle end" data-handle="end" aria-hidden="true">⋮</span>}
    </button>
    {error && <span role="alert" className="drag-error">{error}</span>}
  </>;
}
