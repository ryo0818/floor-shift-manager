import { useCallback, useEffect, useState } from 'react';
import { Layers3, CalendarDays, Users, Plus, ChevronLeft, ChevronRight, Clock3, Settings2, Pencil, Trash2, Check, Building2, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster, toast } from 'sonner';
type Floor = {
    id: string;
    name: string;
    color: string;
};
type Member = {
    id: string;
    name: string;
};
type Shift = {
    id: string;
    member_id: string;
    floor_id: string;
    date: string;
    start: string;
    end: string;
    start_at: number;
    end_at: number;
    break_minutes: number;
    note: string;
};
type Data = {
    floors: Floor[];
    members: Member[];
    shifts: Shift[];
};
type Edit = {
    type: 'floor' | 'member' | 'shift';
    id?: string;
    name?: string;
    color?: string;
    member_id?: string;
    floor_id?: string;
    date?: string;
    start?: string;
    end?: string;
    break_minutes?: number;
    note?: string;
};
const colors = ['#236b59', '#2563eb', '#9863cb', '#bd641e', '#c04869', '#497688'];
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const monday = (s: string) => addDays(s, -((new Date(s + 'T12:00:00Z').getUTCDay() + 6) % 7));
const shortDate = (s: string) => new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'UTC' }).format(new Date(s + 'T12:00:00Z'));
const dow = (s: string) => ['日', '月', '火', '水', '木', '金', '土'][new Date(s + 'T12:00:00Z').getUTCDay()];
const hours = (s: Shift) => Math.round((s.end_at - s.start_at - s.break_minutes) / 60 * 10) / 10;
const timeLabel = (s: {
    start: string;
    end: string;
}) => `${s.start}–${s.end <= s.start ? '翌 ' : ''}${s.end}`;
function Picker({ value, onChange, items, label }: {
    value: string;
    onChange: (v: string) => void;
    items: {
        id: string;
        name: string;
    }[];
    label: string;
}) { return <Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="picker"><SelectValue placeholder={label}/></SelectTrigger><SelectContent>{items.map(x => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select>; }
export default function App() {
    const [date, setDate] = useState(today);
    const [view, setView] = useState('day');
    const [floor, setFloor] = useState('all');
    const [data, setData] = useState<Data>({ floors: [], members: [], shifts: [] });
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [edit, setEdit] = useState<Edit | null>(null);
    const [settings, setSettings] = useState(false);
    const [settingTab, setSettingTab] = useState('floor');
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [remove, setRemove] = useState<Edit | null>(null);
    const first = monday(date), last = addDays(first, 6), days = Array.from({ length: 7 }, (_, i) => addDays(first, i));
    const load = useCallback(async (signal?: AbortSignal) => { setLoadError(''); try {
        const r = await fetch(`/api/shifts?from=${addDays(first, -1)}&to=${last}`, { signal });
        const d = await r.json() as Data & {
            error?: string;
        };
        if (!r.ok)
            throw new Error(d.error);
        setData(d);
        return d as Data;
    }
    catch (e) {
        if ((e as Error).name !== 'AbortError')
            setLoadError((e as Error).message);
        throw e;
    }
    finally {
        if (!signal?.aborted)
            setLoading(false);
    } }, [first, last]);
    useEffect(() => { setLoading(true); const c = new AbortController(); load(c.signal).catch(() => { }); return () => c.abort(); }, [load]);
    const open = (e: Edit) => { setFormError(''); setEdit(e); };
    const newShift = (f?: string, d?: string, m?: string) => open({ type: 'shift', date: d || date, floor_id: f || (floor !== 'all' ? floor : data.floors[0]?.id) || '', member_id: m || data.members[0]?.id || '', start: '09:00', end: '17:00', break_minutes: 60, note: '' });
    async function save(e: React.FormEvent) { e.preventDefault(); if (!edit)
        return; setSaving(true); setFormError(''); try {
        const r = await fetch('/api/shifts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(edit) });
        const d = await r.json() as {
            error?: string;
        };
        if (!r.ok)
            throw new Error(d.error);
        if (edit.type === 'shift' && edit.date)
            setDate(edit.date);
        setEdit(null);
        toast.success('保存しました');
        if (edit.type !== 'shift' || !edit.date || monday(edit.date) === first)
            await load();
    }
    catch (e) {
        setFormError((e as Error).message);
    }
    finally {
        setSaving(false);
    } }
    async function deleteItem() { if (!remove)
        return; setSaving(true); try {
        const r = await fetch('/api/shifts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...remove, action: 'delete' }) });
        const d = await r.json() as {
            error?: string;
        };
        if (!r.ok)
            throw new Error(d.error);
        if (remove.type === 'floor' && floor === remove.id)
            setFloor('all');
        setRemove(null);
        setEdit(null);
        toast.success('削除しました');
        await load();
    }
    catch (e) {
        toast.error((e as Error).message);
        setRemove(null);
    }
    finally {
        setSaving(false);
    } }
    const shownFloors = data.floors.filter(f => floor === 'all' || f.id === floor);
    // Daily view includes the part of overnight shifts that falls on the selected date.
    const dayStart = Date.parse(date + 'T00:00:00+09:00') / 60000;
    const selected = data.shifts.filter(s => (floor === 'all' || s.floor_id === floor) && (view === 'day' ? s.start_at < dayStart + 1440 && s.end_at > dayStart : s.date >= first && s.date <= last));
    const shiftReady = data.floors.length > 0 && data.members.length > 0;
    const memberName = (id: string) => data.members.find(m => m.id === id)?.name || '未登録';
    const totalHours = selected.reduce((a, s) => a + (view === 'day' ? (Math.min(s.end_at, dayStart + 1440) - Math.max(s.start_at, dayStart)) / 60 : hours(s)), 0);
    const initial = !data.floors.length || !data.members.length;
    return <div className="app"><Toaster position="top-center" richColors/><header className="header"><a href="/" className="brand"><span className="brand-mark"><Layers3 size={23}/></span><span>フロアシフト<small>SHIFT MANAGEMENT</small></span></a><div className="header-right"><span className="private-label">シフト管理</span><button className="btn secondary" onClick={() => setSettings(true)}><Settings2 size={17}/><span>フロア・メンバー</span></button></div></header>
 <main><div className="page-heading"><div><div className="eyebrow">SCHEDULE</div><h1>シフトボード</h1><p>誰が、いつ、どのフロアに。</p></div><button className="btn primary" onClick={() => shiftReady ? newShift() : setSettings(true)} disabled={loading || !!loadError}><Plus size={20}/>シフトを追加</button></div>
 <div className="summary"><div><span className="summary-icon"><Users size={20}/></span><div><span className="metric-label">{view === 'day' ? 'この日の出勤' : 'この週の出勤'}</span><strong>{new Set(selected.map(s => s.member_id)).size}<small>人</small></strong></div></div><div><span className="summary-icon"><Clock3 size={20}/></span><div><span className="metric-label">{view === 'day' ? '配置時間（休憩含む）' : '勤務時間（休憩除く）'}</span><strong>{Math.round(totalHours * 10) / 10}<small>時間</small></strong></div></div><div><span className="summary-icon"><Building2 size={20}/></span><div><span className="metric-label">配置のあるフロア</span><strong>{new Set(selected.map(s => s.floor_id)).size}<small>/ {shownFloors.length} フロア</small></strong></div></div></div>
 <section className="board"><div className="toolbar"><div className="date-tools"><div className="arrows"><button aria-label="前の期間" onClick={() => setDate(addDays(date, view === 'day' ? -1 : -7))}><ChevronLeft size={19}/></button><button aria-label="次の期間" onClick={() => setDate(addDays(date, view === 'day' ? 1 : 7))}><ChevronRight size={19}/></button></div><label className="date-picker"><CalendarDays size={18}/><input type="date" aria-label="表示する日付" value={date} onChange={e => { if (e.target.value)
        setDate(e.target.value); }}/></label><button className="btn today" onClick={() => setDate(today())}>今日</button></div><Tabs value={view} onValueChange={setView}><TabsList className="view-tabs"><TabsTrigger value="day">日別</TabsTrigger><TabsTrigger value="week">週別</TabsTrigger></TabsList></Tabs></div>
 <div className="floor-bar"><div className="floor-buttons" role="group" aria-label="フロアで絞り込み"><button className={floor === 'all' ? 'active' : ''} onClick={() => setFloor('all')}><Layers3 size={16}/>すべてのフロア</button>{data.floors.map(f => <button key={f.id} className={floor === f.id ? 'active' : ''} onClick={() => setFloor(f.id)}><span className="floor-dot" style={{ background: f.color }}/>{f.name}</button>)}</div><button className="icon-btn refresh" aria-label="シフトを再読み込み" onClick={() => { setLoading(true); load().catch(() => { }); }}><RefreshCw size={16}/></button></div>
 <div className="board-title"><h2>{view === 'day' ? `${shortDate(date)}（${dow(date)}）` : `${shortDate(first)} — ${shortDate(last)}`}</h2><span>{view === 'day' ? 'フロア別の勤務予定' : '月曜日〜日曜日の勤務予定'}</span></div>
 {loading ? <div className="loading" aria-label="読み込み中"><Skeleton className="h-12 w-full"/><Skeleton className="h-24 w-full"/><Skeleton className="h-24 w-full"/></div> : loadError ? <Empty><EmptyTitle>シフトを読み込めませんでした</EmptyTitle><EmptyDescription>{loadError}</EmptyDescription><button className="btn secondary" onClick={() => { setLoading(true); load().catch(() => { }); }}>再読み込み</button></Empty> : initial ? <div className="onboarding"><Empty><EmptyHeader><EmptyMedia><span className="empty-icon"><CalendarDays size={32}/></span></EmptyMedia><EmptyTitle>最初のシフトをつくりましょう</EmptyTitle><EmptyDescription>フロアとメンバーを登録すると、<br />ここに勤務予定がフロア別に表示されます。</EmptyDescription></EmptyHeader><div className="setup-steps"><button onClick={() => { setSettingTab('floor'); setSettings(true); }}><span className={data.floors.length ? 'done' : ''}>{data.floors.length ? <Check size={15}/> : 1}</span>フロアを登録<small>{data.floors.length ? `${data.floors.length}件登録済み` : '1F・2F・受付など'}</small></button><button onClick={() => { setSettingTab('member'); setSettings(true); }}><span className={data.members.length ? 'done' : ''}>{data.members.length ? <Check size={15}/> : 2}</span>メンバーを登録<small>{data.members.length ? `${data.members.length}人登録済み` : '一緒に働くスタッフ'}</small></button><button disabled={!shiftReady} onClick={() => newShift()}><span>3</span>シフトを入力<small>日付・フロア・勤務時間</small></button></div><button className="btn primary" onClick={() => { setSettingTab(!data.floors.length ? 'floor' : 'member'); setSettings(true); }}><Plus size={18}/>{!data.floors.length ? 'フロアを登録する' : 'メンバーを登録する'}</button></Empty></div> : <div className="floors">{shownFloors.map(f => { const shifts = selected.filter(s => s.floor_id === f.id); return <section className="floor-section" key={f.id}><div className="floor-heading"><div><span className="floor-badge" style={{ background: f.color + '14', color: f.color }}><Building2 size={18}/></span><h3>{f.name}</h3><span className="count">{new Set(shifts.map(s => s.member_id)).size}人</span></div><button className="text-btn" onClick={() => newShift(f.id)}><Plus size={16}/>追加</button></div>{view === 'day' ? (shifts.length ? <div className="shift-list">{shifts.sort((a, b) => a.start_at - b.start_at).map(s => <button className="shift-card" style={{ borderLeftColor: f.color }} key={s.id} onClick={() => open({ type: 'shift', ...s })}><div className="person"><span className="avatar" style={{ color: f.color, background: f.color + '12' }}>{memberName(s.member_id).slice(0, 1)}</span><strong>{memberName(s.member_id)}</strong></div><div className="shift-time"><Clock3 size={15}/><strong>{s.date !== date ? '前日 ' : ''}{timeLabel(s)}</strong></div><div className="shift-meta">実働 {hours(s)}h<span>休憩 {s.break_minutes}分</span></div><div className="timeline" aria-hidden="true"><div style={{ left: `${Math.max(0, s.start_at - dayStart) / 1440 * 100}%`, width: `${(Math.min(s.end_at, dayStart + 1440) - Math.max(s.start_at, dayStart)) / 1440 * 100}%`, background: f.color }}/></div><Pencil size={15} className="edit-icon"/>{s.note && <p className="shift-note">{s.note}</p>}</button>)}<div className="time-key"><span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div></div> : <div className="floor-empty"><span>この日のシフトはまだありません</span><button className="text-btn" onClick={() => newShift(f.id)}>シフトを追加</button></div>) : <Table className="week-table"><TableHeader><TableRow><TableHead>メンバー</TableHead>{days.map(d => <TableHead key={d} className={d === today() ? 'is-today' : ''}><span>{shortDate(d)}</span><small className={dow(d) === '日' ? 'sunday' : dow(d) === '土' ? 'saturday' : ''}>{dow(d)}</small></TableHead>)}</TableRow></TableHeader><TableBody>{data.members.map(m => <TableRow key={m.id}><TableCell className="member-cell">{m.name}</TableCell>{days.map(d => <TableCell key={d} className={d === today() ? 'is-today' : ''}>{shifts.filter(s => s.member_id === m.id && s.date === d).map(s => <button key={s.id} className="week-shift" style={{ background: f.color + '13', color: f.color, borderLeftColor: f.color }} onClick={() => open({ type: 'shift', ...s })}>{s.start}<span>{s.end <= s.start ? '翌 ' : ''}{s.end}</span><small>{hours(s)}h</small></button>)}<button className="cell-add" aria-label={`${m.name} ${shortDate(d)} ${f.name}に追加`} onClick={() => newShift(f.id, d, m.id)}><Plus size={14}/></button></TableCell>)}</TableRow>)}</TableBody></Table>}</section>; })}</div>}
 <div className="board-footer"><span><Clock3 size={14}/>日本時間（JST）</span><span>{view === 'day' ? '勤務予定をタップして編集' : '夜勤は開始日の日付に表示'} · 変更は保存ボタンで反映</span></div></section><footer className="page-footer"><span>FLOOR SHIFT</span><span>フロアごとの予定を、ひとつの場所に。</span></footer></main>
 <Dialog open={settings} onOpenChange={setSettings}><DialogContent className="settings-dialog"><DialogHeader><DialogTitle>フロア・メンバー管理</DialogTitle><DialogDescription>シフトに使用するフロアとメンバーを登録します。</DialogDescription></DialogHeader><Tabs value={settingTab} onValueChange={setSettingTab}><TabsList><TabsTrigger value="floor">フロア {data.floors.length}</TabsTrigger><TabsTrigger value="member">メンバー {data.members.length}</TabsTrigger></TabsList></Tabs><div className="management-list">{(settingTab === 'floor' ? data.floors : data.members).map(x => <div className="management-row" key={x.id}><span>{'color' in x && <span className="floor-dot" style={{ background: String(x.color) }}/>}{x.name}</span><div><button className="icon-btn" aria-label={`${x.name}を編集`} onClick={() => open({ type: settingTab as 'floor' | 'member', ...x })}><Pencil size={16}/></button><button className="icon-btn" aria-label={`${x.name}を削除`} onClick={() => setRemove({ type: settingTab as 'floor' | 'member', ...x })}><Trash2 size={16}/></button></div></div>)}{!(settingTab === 'floor' ? data.floors : data.members).length && <p className="management-empty">まだ登録されていません。</p>}</div><button className="btn primary" onClick={() => open({ type: settingTab as 'floor' | 'member', name: '', color: colors[data.floors.length % colors.length] })}><Plus size={18}/>{settingTab === 'floor' ? 'フロア' : 'メンバー'}を追加</button></DialogContent></Dialog>
 <Dialog open={!!edit} onOpenChange={v => { if (!v && !saving)
        setEdit(null); }}><DialogContent className="edit-dialog"><DialogHeader><DialogTitle>{edit?.type === 'shift' ? 'シフト' : edit?.type === 'floor' ? 'フロア' : 'メンバー'}を{edit?.id ? '編集' : '追加'}</DialogTitle><DialogDescription>{edit?.type === 'shift' ? '勤務するメンバー・フロア・時間を入力してください。' : '表示する名前を入力してください。'}</DialogDescription></DialogHeader>{edit && <form onSubmit={save} className="edit-form">{edit.type === 'shift' ? <><label>メンバー<Picker label="メンバー" value={edit.member_id || ''} items={data.members} onChange={v => setEdit({ ...edit, member_id: v })}/></label><label>フロア<Picker label="フロア" value={edit.floor_id || ''} items={data.floors} onChange={v => setEdit({ ...edit, floor_id: v })}/></label><label>勤務日<input type="date" required value={edit.date} onChange={e => setEdit({ ...edit, date: e.target.value })}/></label><div className="form-grid"><label>開始時刻<input type="time" required value={edit.start} onChange={e => setEdit({ ...edit, start: e.target.value })}/></label><label>終了時刻<input type="time" required value={edit.end} onChange={e => setEdit({ ...edit, end: e.target.value })}/></label></div>{edit.end! < edit.start! && <p className="overnight">終了は翌日の {edit.end} です。</p>}<label>休憩時間（分）<input type="number" min="0" max="1439" required value={edit.break_minutes} onChange={e => setEdit({ ...edit, break_minutes: e.target.value === '' ? undefined : Number(e.target.value) })}/></label><label>メモ <span className="optional">任意</span><textarea maxLength={300} rows={2} placeholder="担当業務や引き継ぎなど" value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })}/></label></> : <><label>{edit.type === 'floor' ? 'フロア名' : 'メンバー名'}<input autoFocus required maxLength={50} value={edit.name} placeholder={edit.type === 'floor' ? '例：1F ホール' : '例：山田 太郎'} onChange={e => setEdit({ ...edit, name: e.target.value })}/></label>{edit.type === 'floor' && <fieldset><legend>フロアの色</legend><div className="colors">{colors.map((c, i) => <button type="button" key={c} aria-label={['グリーン', 'ブルー', 'パープル', 'オレンジ', 'ピンク', 'ブルーグレー'][i]} aria-pressed={edit.color === c} style={{ background: c }} onClick={() => setEdit({ ...edit, color: c })}>{edit.color === c && <Check size={18}/>}</button>)}</div></fieldset>}</>}{formError && <p className="form-error" role="alert">{formError}</p>}<div className="form-actions">{edit.id && <button className="icon-btn danger" type="button" aria-label="削除" disabled={saving} onClick={() => setRemove(edit)}><Trash2 size={18}/></button>}<button type="button" className="btn secondary" disabled={saving} onClick={() => setEdit(null)}>キャンセル</button><button className="btn primary" disabled={saving}>{saving ? '保存中…' : '保存する'}</button></div></form>}</DialogContent></Dialog>
 <AlertDialog open={!!remove} onOpenChange={v => { if (!v && !saving)
        setRemove(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>削除しますか？</AlertDialogTitle><AlertDialogDescription>{remove?.type === 'shift' ? `${memberName(remove.member_id || '')}さんの ${remove.date} のシフト` : remove?.name}を削除します。この操作は取り消せません。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>キャンセル</AlertDialogCancel><AlertDialogAction className="delete-confirm" disabled={saving} onClick={e => { e.preventDefault(); deleteItem(); }}>{saving ? '削除中…' : '削除する'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>;
}
