import {
  Command,
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
  movePeriod,
  periodOf,
  today,
  validateRow,
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
  if (!e) throw new Error("従業員が見つかりません。");
  session = { role: "employee", name: e.name, employeeId: e.id };
  return copy(session);
}
export function demoLogout() {
  session = null;
}
export function readDemo(id: string): Workspace {
  if (!session) throw new Error("ログインしてください。");
  const b = get(id);
  const admin = session.role === "admin";
  const own = employees.filter((e) => e.id === session!.employeeId);
  const ids = own[0]?.floorIds || [];
  return copy({
    floors: admin ? floors : floors.filter((f) => ids.includes(f.id)),
    employees: admin ? employees : own,
    period: b.period,
    submissions: admin
      ? b.submissions.map((s) => ({
          ...s,
          draftRows: [],
          draftNote: "",
          dirty: false,
        }))
      : b.submissions.filter((s) => s.employeeId === session!.employeeId),
    shifts: admin ? b.shifts : [],
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
  if (!session) throw new Error("ログインしてください。");
  const b = get(id);
  if (c.type === "saveDraft" || c.type === "submit") {
    if (session.role !== "employee")
      throw new Error("本人の画面から操作してください。");
    if (expired(b.period))
      throw new Error("受付が終了しています。変更は管理者にご相談ください。");
    const e = employees.find((e) => e.id === session!.employeeId)!;
    const s = ownSubmission(b);
    if (c.type === "saveDraft") {
      c.rows.forEach((r) => validateRow(r, b.period, e.floorIds));
      if (c.note.length > 1000)
        throw new Error("提出全体のメモは1000文字以内で入力してください。");
      if (new Set(c.rows.map((r) => r.id)).size !== c.rows.length)
        throw new Error("シフトIDが重複しています。");
      s.draftRows = copy(c.rows);
      s.draftNote = c.note;
      s.dirty = true;
      return;
    }
    s.draftRows.forEach((r) => validateRow(r, b.period, e.floorIds));
    if (conflicts(s.draftRows).length && !c.acknowledgeOverlap)
      throw new Error("重複する希望があります。確認してから提出してください。");
    if (b.shifts.some((r) => r.employeeId === e.id && r.status !== "pending"))
      throw new Error(
        "管理者が処理済みのシフトがあります。再提出は管理者にご相談ください。",
      );
    s.submittedRows = copy(s.draftRows);
    s.submittedNote = s.draftNote;
    s.submittedAt = new Date().toISOString();
    s.dirty = false;
    b.shifts = b.shifts
      .filter((r) => r.employeeId !== e.id)
      .concat(
        s.draftRows.map((r) => ({
          ...copy(r),
          employeeId: e.id,
          status: "pending",
          original: copy(r),
        })),
      );
    return;
  }
  if (session.role !== "admin") throw new Error("管理者のみ操作できます。");
  if (c.type === "setDeadline") {
    if (!Number.isFinite(Date.parse(c.deadline)))
      throw new Error("有効な締切日時を入力してください。");
    if (
      Date.parse(c.deadline) > Date.now() &&
      b.shifts.some((s) => s.status !== "pending")
    )
      throw new Error(
        "確定・見送り済みがあります。未確定に戻してから受付を再開してください。",
      );
    b.period.deadline = c.deadline;
    return;
  }
  if (c.type === "saveFloor") {
    const f = c.floor;
    if (!f.name.trim() || f.name.length > 50 || !/^#[\da-f]{6}$/i.test(f.color))
      throw new Error("フロア名（50文字以内）と色を確認してください。");
    if (floors.some((x) => x.id !== f.id && x.name.trim() === f.name.trim()))
      throw new Error("同じフロア名があります。");
    floors = floors
      .filter((x) => x.id !== f.id)
      .concat({ ...f, name: f.name.trim() });
    return;
  }
  if (c.type === "saveEmployee") {
    const e = c.employee;
    if (!e.name.trim() || e.name.length > 50)
      throw new Error("氏名を50文字以内で入力してください。");
    if (e.floorIds.some((id) => !floors.some((f) => f.id === id)))
      throw new Error("フロアを確認してください。");
    employees = employees
      .filter((x) => x.id !== e.id)
      .concat({ ...e, name: e.name.trim() });
    return;
  }
  if (c.type === "saveShift") {
    const r = c.shift;
    validateRow(
      r,
      b.period,
      floors.map((f) => f.id),
    );
    if (!employees.some((e) => e.id === r.employeeId))
      throw new Error("従業員を選択してください。");
    const old = b.shifts.find((x) => x.id === r.id);
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
      if (!b.period.deadline || !expired(b.period))
        throw new Error(
          "仮ルール：締切後に確定できます。締切前の確定可否は要件未定です。",
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
      ids.has(x.id) ? { ...x, status: c.status } : x,
    );
    return;
  }
}
