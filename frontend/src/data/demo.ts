import {
  Command,
  RequestChange,
  Employee,
  Floor,
  Period,
  Row,
  Session,
  Shift,
  Submission,
  Workspace,
  conflicts,
  expired,
  makePeriod,
  periodSelectable,
  movePeriod,
  periodOf,
  today,
  validateRow,
  resolveFullTime,
  floorHours,
  times,
} from "../domain/model";
const copy = <T>(v: T): T => structuredClone(v);
const colors = ["#236b59", "#3269b0", "#9165b5", "#b97932", "#b75272"];
let floors: Floor[] = Array.from({ length: 5 }, (_, i) => ({
  id: `f${i + 1}`,
  name: `${i + 1}F ${["ホール", "ダイニング", "ラウンジ", "イベント", "テラス"][i]}`,
  color: colors[i],
}));
const surnames = [
  "田中",
  "佐藤",
  "鈴木",
  "高橋",
  "伊藤",
  "渡辺",
  "山本",
  "中村",
  "小林",
  "加藤",
];
let employees: Employee[] = Array.from({ length: 50 }, (_, i) => ({
  id: `e${i + 1}`,
  name: `${surnames[i % 10]} ${["葵", "悠", "陽菜", "蓮", "結衣"][Math.floor(i / 10)]}`,
  floorIds:
    i % 10 === 0
      ? [`f${Math.floor(i / 10) + 1}`, `f${((Math.floor(i / 10) + 1) % 5) + 1}`]
      : [`f${Math.floor(i / 10) + 1}`],
}));
type Bucket = { period: Period; submissions: Submission[]; shifts: Shift[] };
const buckets = new Map<string, Bucket>();
let session: Session | null = null;
const initial = periodOf(today());
function get(id: string) {
  if (!/^\d{4}-\d{2}-(01|16)$/.test(id))
    throw new Error("対象期間が不正です。");
  let b = buckets.get(id);
  if (!b) {
    b = { period: makePeriod(id), submissions: [], shifts: [] };
    buckets.set(id, b);
  }
  return b;
}
function seed(id: string, closed: boolean) {
  if (!periodSelectable(id)) throw new Error("1か月より前の期間は選択できません。");
  const b = get(id);
  b.period.deadline = new Date(
    Date.now() + (closed ? -1 : 5) * 86400000,
  ).toISOString();
  for (let i = 0; i < 50; i++) {
    const rows: Row[] = Array.from({ length: i < 40 ? 3 : 0 }, (_, j) => ({
      id: `${id}-r${i}-${j}`,
      date: `${id.slice(0, 8)}${String(Number(id.slice(8)) + j * 2).padStart(2, "0")}`,
      start: i % 2 ? "12:00" : "09:00",
      end: i % 2 ? "18:00" : "15:00",
      floorId: employees[i].floorIds[0],
      note: j === 0 && i === 0 ? "開始時刻の調整が可能です。" : "",
    }));
    if (i === 0)
      rows.push({
        ...rows[0],
        id: id + "-overlap",
        floorId: "f2",
        start: "12:00",
        end: "17:00",
        note: "どちらのフロアでも勤務できます。",
      });
    const submitted = i < 35;
    b.submissions.push({
      employeeId: employees[i].id,
      draftRows: copy(rows),
      draftNote: i === 0 ? "週3日程度を希望します。" : "",
      submittedRows: submitted ? copy(rows) : [],
      submittedNote: i === 0 ? "週3日程度を希望します。" : "",
      submittedAt: submitted ? new Date().toISOString() : null,
      dirty: !submitted && rows.length > 0,
    });
    if (submitted)
      b.shifts.push(
        ...rows.map((r, j) => ({
          ...r,
          employeeId: employees[i].id,
          status: (closed && i > 0 && i < 15
            ? "confirmed"
            : closed && i === 16
              ? "declined"
              : "pending") as Shift["status"],
          original: copy(r),
        })),
      );
  }
}
seed(initial, true);
seed(movePeriod(initial, 1), false);
export function demoPeople() {
  return copy(employees);
}
export function demoSession() {
  return copy(session);
}
export function demoLogin(id: string, password: string) {
  if (id !== "admin" || password !== "demo1234")
    throw new Error("ログインIDまたはパスワードが違います。");
  session = { role: "admin", name: "管理者" };
  return copy(session);
}
export function demoEmployee(id: string) {
  const e = employees.find((e) => e.id === id);
  if (!e || e.active === false) throw new Error("従業員が見つかりません。");
  session = { role: "employee", name: e.name, employeeId: e.id };
  return copy(session);
}
export function demoLogout() {
  session = null;
}
export function readDemo(id: string): Workspace {
  if (!session || (session.role === "employee" && employees.find(e=>e.id===session!.employeeId)?.active === false)) throw new Error("ログインしてください。");
  if (!periodSelectable(id)) throw new Error("1か月より前の期間は選択できません。");
  const b = get(id);
  const admin = session.role === "admin";
  const own = employees.filter((e) => e.id === session!.employeeId);
  const ids = own[0]?.floorIds || [];
  return copy({
    floors: admin ? floors : floors.filter((f) => ids.includes(f.id)).map(({employeeOrder: _order, ...f})=>f),
    employees: admin ? employees : own,
    period: b.period,
    submissions: admin
      ? b.submissions.map((s) => ({
          ...s,
          draftRows: [],
          draftNote: "",
          dirty: false,
        }))
      : b.submissions.filter((s) => s.employeeId === session!.employeeId).map(({latestChanges:_changes,...s})=>s),
    shifts: admin ? b.shifts : [],
    confirmedSchedule: admin ? [] : b.shifts.filter(s=>s.employeeId===session!.employeeId && s.status==="confirmed").map(s=>({id:s.id,date:s.date,start:s.start,end:s.end,floorId:s.floorId,fullTime:s.fullTime,floorName:floors.find(f=>f.id===s.floorId)?.name ?? "未登録"})),
    policy: { allowEarlyConfirm: false },
  });
}
function ownSubmission(b: Bucket) {
  let s = b.submissions.find((s) => s.employeeId === session!.employeeId);
  if (!s) {
    s = {
      employeeId: session!.employeeId!,
      draftRows: [],
      draftNote: "",
      submittedRows: [],
      submittedNote: "",
      submittedAt: null,
      dirty: false,
    };
    b.submissions.push(s);
  }
  return s;
}
export function commandDemo(id: string, c: Command) {
  c = copy(c);
  if (!session || (session.role === "employee" && employees.find(e=>e.id===session!.employeeId)?.active === false)) throw new Error("ログインしてください。");
  if (!periodSelectable(id)) throw new Error("1か月より前の期間は選択できません。");
  const b = get(id);
  const currentDate = today();
  if (c.type === "saveDraft" || c.type === "submit") {
    if (session.role !== "employee")
      throw new Error("本人の画面から操作してください。");
    if (expired(b.period))
      throw new Error("受付が終了しています。変更は管理者にご相談ください。");
    const e = employees.find((e) => e.id === session!.employeeId)!;
    const s = ownSubmission(b);
    if (c.type === "saveDraft") {
      const past = new Map(s.draftRows.filter(r => r.date < currentDate).map(r => [r.id, r]));
      for (const row of c.rows) {
        if (row.date < currentDate || past.has(row.id)) {
          const original = past.get(row.id);
          if (!original || row.date !== original.date || row.floorId !== original.floorId
            || !!row.fullTime !== !!original.fullTime || row.start !== original.start || row.end !== original.end || row.note !== original.note)
            throw new Error("過去日の希望は入力・変更できません。");
          continue;
        }
        Object.assign(row, resolveFullTime(row, floors, e.employmentType));
        validateRow(row, b.period, e.floorIds);
      }
      if (c.note.length > 1000)
        throw new Error("提出全体のメモは1000文字以内で入力してください。");
      if (new Set(c.rows.map((r) => r.id)).size !== c.rows.length)
        throw new Error("シフトIDが重複しています。");
      s.draftRows = copy([...past.values(), ...c.rows.filter(r => r.date >= currentDate)]);
      s.draftNote = c.note;
      s.dirty = true;
      return;
    }
    const editable = s.draftRows.filter(r => r.date >= currentDate);
    editable.forEach((r) => validateRow(r, b.period, e.floorIds));
    if (conflicts(editable).length && !c.acknowledgeOverlap)
      throw new Error("重複する希望があります。確認してから提出してください。");
    const previousIds = new Set(s.submittedRows.map(r=>r.id));
    const previous = new Map(b.shifts.filter(r=>r.employeeId===e.id && previousIds.has(r.original.id)).map(r=>[r.original.id,r]));
    const keep = b.shifts.filter(r=>r.employeeId!==e.id || r.date<currentDate || !previousIds.has(r.original.id));
    const same = (a:Row,b:Row) => a.id===b.id && a.date===b.date && a.floorId===b.floorId && a.start===b.start && a.end===b.end && a.note===b.note && !!a.fullTime===!!b.fullTime;
    const updated: Shift[] = [];
    const changes: RequestChange[] = [];
    const priorRows = new Map(s.submittedRows.filter(r=>r.date>=currentDate).map(r=>[r.id,r]));
    const snapshot = (r:Row):Row => ({id:r.id,date:r.date,start:r.start,end:r.end,floorId:r.floorId,note:r.note,fullTime:!!r.fullTime});
    for (const [id,prior] of priorRows) {
      const old=previous.get(id);
      if(!editable.some(r=>r.id===id) && !(old && old.date<currentDate))changes.push({before:snapshot(old ?? prior),after:null,at:new Date().toISOString()});
    }
    for (const row of editable) {
      const old = previous.get(row.id);
      if (old && old.date < currentDate) {
        if (!same(row,old.original)) throw new Error("過去日の勤務に対応する希望は変更できません。");
        continue;
      }
      if(old && same(row,old.original)) {updated.push(old);continue;}
      const next:Shift={...copy(row),id:old?.id ?? crypto.randomUUID(),employeeId:e.id,status:"pending",original:copy(row)};
      if(s.submittedAt) {
        const before=old ?? priorRows.get(row.id);
        const change:RequestChange={before:before?snapshot(before):null,after:copy(row),at:new Date().toISOString()};
        changes.push(change);
        next.requestChange={...change,before:old?.requestChange?copy(old.requestChange.before):change.before};
      }
      updated.push(next);
    }
    if(changes.length)s.latestChanges=changes;
    s.submittedRows = copy([...s.submittedRows.filter(r => r.date < currentDate), ...editable]);
    s.submittedNote = s.draftNote;
    s.submittedAt = new Date().toISOString();
    s.dirty = false;
    b.shifts = [...keep,...updated];
    return;
  }
  if (session.role !== "admin") throw new Error("管理者のみ操作できます。");
  if (c.type === "setDeadline") {
    if (c.deadline !== null && !Number.isFinite(Date.parse(c.deadline)))
      throw new Error("有効な締切日時を入力してください。");
    b.period.deadline = c.deadline;
    return;
  }
  if (c.type === "deleteEmployee") {
    if (!employees.some(e=>e.id===c.id)) throw new Error("従業員は削除済みです。再読み込みしてください。");
    for (const bucket of buckets.values()) {
      if ([...bucket.shifts,...bucket.submissions].some(r=>r.employeeId===c.id))
        throw new Error("この従業員にはシフト・提出履歴・保存済み下書きがあるため削除できません（全期間）。");
    }
    employees = employees.filter(e=>e.id!==c.id);
    floors = floors.map(f=>(f.employeeOrder ? {...f,employeeOrder:f.employeeOrder.filter(id=>id!==c.id)} : f));
    return;
  }
  if (c.type === "deleteFloor") {
    if (!floors.some(f=>f.id===c.id)) throw new Error("フロアは削除済みです。再読み込みしてください。");
    for (const bucket of buckets.values()) {
      const rows = [...bucket.shifts, ...bucket.shifts.map(s=>s.original),
        ...bucket.submissions.flatMap(s=>[...s.draftRows,...s.submittedRows])];
      if (rows.some(r=>r.floorId===c.id)) throw new Error("このフロアは希望・下書き・シフト・元の希望で使用中のため削除できません（全期間）。");
    }
    floors = floors.filter(f=>f.id!==c.id);
    employees = employees.map(e=>({...e,floorIds:e.floorIds.filter(f=>f!==c.id)}));
    return;
  }
  if (c.type === "saveFloor") {
    const f = c.floor;
    const order = f.employeeOrder ?? [];
    if (new Set(order).size !== order.length || order.some(id=>!employees.some(e=>e.id===id && e.floorIds.includes(f.id)))) throw new Error("並び順の従業員を確認してください。");
    const staffHours = floorHours(f, "staff");
    if (!times.includes(staffHours.start) || !times.includes(staffHours.end) || staffHours.start >= staffHours.end) throw new Error("社員のフルタイムの時間を確認してください。");
    const hours = floorHours(f);
    if (!times.includes(hours.start) || !times.includes(hours.end) || hours.start >= hours.end) throw new Error("フルタイムの終了は開始より後にしてください。");
    if (!f.name.trim() || f.name.length > 50 || !/^#[\da-f]{6}$/i.test(f.color))
      throw new Error("フロア名（50文字以内）と色を確認してください。");
    if (floors.some((x) => x.id !== f.id && x.name.trim() === f.name.trim()))
      throw new Error("同じフロア名があります。");
    floors = floors
      .filter((x) => x.id !== f.id)
      .concat({ ...f, name: f.name.trim() });
    return;
  }
  if (c.type === "setEmployeeActive") {
    const e = employees.find(e=>e.id===c.id);
    if (!e) throw new Error("従業員が見つかりません。");
    e.active = c.active;
    return;
  }
  if (c.type === "saveEmployee") {
    const e = {...c.employee, active: employees.find(x=>x.id===c.employee.id)?.active ?? true};
    if (e.employmentType && !["partTime", "staff"].includes(e.employmentType)) throw new Error("従業員区分を確認してください。");
    if (!e.name.trim() || e.name.length > 50)
      throw new Error("氏名を50文字以内で入力してください。");
    if (e.floorIds.some((id) => !floors.some((f) => f.id === id)))
      throw new Error("フロアを確認してください。");
    floors = floors.map(f => e.floorIds.includes(f.id) || !f.employeeOrder ? f : {...f, employeeOrder:f.employeeOrder.filter(id=>id!==e.id)});
    employees = employees
      .filter((x) => x.id !== e.id)
      .concat({ ...e, name: e.name.trim() });
    return;
  }
  if (c.type === "saveShift") {
    const r = resolveFullTime(c.shift, floors, employees.find(e=>e.id===c.shift.employeeId)?.employmentType);
    validateRow(
      r,
      b.period,
      floors.map((f) => f.id),
    );
    if (!employees.some((e) => e.id === r.employeeId))
      throw new Error("従業員を選択してください。");
    const old = b.shifts.find((x) => x.id === r.id);
    if (employees.find(e=>e.id===r.employeeId)?.active === false && (!old || old.employeeId!==r.employeeId)) throw new Error("退職者へ新しいシフトを追加できません。");
    if (r.date < currentDate || (old && old.date < currentDate))
      throw new Error("過去日のシフトは入力・変更できません。");
    if (old && old.status !== "pending")
      throw new Error("未確定に戻してから変更してください。");
    if (
      conflicts([
        r,
        ...b.shifts.filter(
          (x) =>
            x.id !== r.id &&
            x.employeeId === r.employeeId &&
            x.status !== "declined",
        ),
      ]).some((p) => p.a.id === r.id || p.b.id === r.id) &&
      !c.acknowledgeOverlap
    )
      throw new Error("時間が重複しています。確認してから登録してください。");
    const next = {
      ...copy(r),
      status: "pending" as const,
      ...(old?.requestChange ? {requestChange:copy(old.requestChange)} : {}),
      original: old?.original || copy(r),
    };
    b.shifts = old
      ? b.shifts.map((x) => (x.id === r.id ? next : x))
      : [...b.shifts, next];
    return;
  }
  if (c.type === "deleteShift") {
    const r = b.shifts.find((x) => x.id === c.id);
    if (r?.status !== "pending")
      throw new Error("未確定に戻してから削除してください。");
    b.shifts = b.shifts.filter((x) => x.id !== c.id);
    return;
  }
  if (c.type === "setStatus") {
    if (c.status === "confirmed" && b.shifts.some(s=>c.ids.includes(s.id) && employees.find(e=>e.id===s.employeeId)?.active===false)) throw new Error("退職者のシフトは確定できません。");
    const ids = new Set(c.ids);
    const target = b.shifts.filter((x) => ids.has(x.id));
    if (!ids.size || target.length !== ids.size)
      throw new Error("対象のシフトを選択し直してください。");
    if (
      target.some((x) =>
        c.status === "pending"
          ? x.status === "pending"
          : x.status !== "pending",
      )
    )
      throw new Error("状態が変わっています。再確認してください。");
    if (c.status === "confirmed") {
      if (b.period.deadline && Date.parse(b.period.deadline) > Date.now())
        throw new Error(
          "締切を設定した期間は、締切後に確定できます。",
        );
      const all = b.shifts.filter(
        (x) => x.status === "confirmed" || ids.has(x.id),
      );
      const pairs = conflicts(all).filter(
        ({ a, b }) =>
          (a as Shift).employeeId === (b as Shift).employeeId &&
          (ids.has(a.id) || ids.has(b.id)),
      );
      if (pairs.length) {
        const lines = pairs.map(
          ({ a, b }) =>
            `${employees.find((e) => e.id === (a as Shift).employeeId)?.name} / ${a.date} / ${floors.find((f) => f.id === a.floorId)?.name} ${a.start}–${a.end} と ${floors.find((f) => f.id === b.floorId)?.name} ${b.start}–${b.end}`,
        );
        throw new Error(
          "時間が重複しているため、全件の確定を中止しました。\n" +
            lines.join("\n"),
        );
      }
    }
    b.shifts = b.shifts.map((x) =>
      ids.has(x.id) ? { ...x, status: c.status, ...(c.status!=="pending"?{requestChange:undefined}:{}) } : x,
    );
    return;
  }
}
