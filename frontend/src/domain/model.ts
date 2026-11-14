export type Role = "admin" | "employee";
export type Session = {
  role: Role;
  name: string;
  employeeId?: string;
  csrfToken?: string;
  mustChangePassword?: boolean;
};
export type EmploymentType = "partTime" | "staff";
export const employmentNames: Record<EmploymentType, string> = {partTime:"アルバイト",staff:"社員"};
export type Floor = { id: string; name: string; color: string; workStart?: string; workEnd?: string; staffWorkStart?: string | null; staffWorkEnd?: string | null; employeeOrder?: string[] };
export type Employee = { id: string; name: string; floorIds: string[]; employmentType?: EmploymentType; active?: boolean };
export type Status = "pending" | "confirmed" | "declined";
export type Row = {
  id: string;
  date: string;
  start: string;
  end: string;
  floorId: string;
  note: string;
  fullTime?: boolean;
};
export type RequestChange = { before: Row | null; after: Row | null; at: string };
export type Shift = Row & { employeeId: string; status: Status; original: Row; requestChange?: RequestChange };
export type Submission = {
  employeeId: string;
  draftRows: Row[];
  draftNote: string;
  submittedRows: Row[];
  submittedNote: string;
  submittedAt: string | null;
  latestChanges?: RequestChange[];
  dirty: boolean;
};
export type Period = {
  id: string;
  start: string;
  end: string;
  deadline: string | null;
};
export type ConfirmedSchedule = Pick<Row, "id" | "date" | "start" | "end" | "floorId" | "fullTime"> & { floorName: string };
export type Workspace = {
  confirmedSchedule?: ConfirmedSchedule[];
  floors: Floor[];
  employees: Employee[];
  period: Period;
  submissions: Submission[];
  shifts: Shift[];
  policy: { allowEarlyConfirm: boolean };
};
export type Command =
  | { type: "setEmployeeActive"; id: string; active: boolean }
  | { type: "saveDraft"; rows: Row[]; note: string }
  | { type: "submit"; acknowledgeOverlap: boolean }
  | {
      type: "saveShift";
      shift: Row & { employeeId: string };
      acknowledgeOverlap: boolean;
    }
  | { type: "deleteShift"; id: string }
  | { type: "setStatus"; ids: string[]; status: Status }
  | { type: "setDeadline"; deadline: string | null }
  | { type: "deleteEmployee"; id: string }
  | { type: "deleteFloor"; id: string }
  | { type: "saveFloor"; floor: Floor }
  | { type: "saveEmployee"; employee: Employee };
export const statusNames: Record<Status, string> = {
  pending: "未確定",
  confirmed: "確定済み",
  declined: "見送り",
};
export const today = (now = Date.now()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(now),
  );
// Calendar month in Japan; clamp to the final day of the previous month.
export function earliestSelectableDate(current = today()): string {
  const [y,m,d] = current.split("-").map(Number);
  const previous = new Date(Date.UTC(y,m-1,0));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth()+1).padStart(2,"0")}-${String(Math.min(d,previous.getUTCDate())).padStart(2,"0")}`;
}
export function periodSelectable(id: string, current = today()): boolean {
  return makePeriod(id).end >= earliestSelectableDate(current);
}
export function periodOf(date: string): string {
  return date.slice(0, 7) + (Number(date.slice(8)) <= 15 ? "-01" : "-16");
}
export function movePeriod(id: string, step: number): string {
  const d = new Date(id + "T12:00:00Z");
  const index =
    d.getUTCFullYear() * 24 +
    d.getUTCMonth() * 2 +
    (d.getUTCDate() === 16 ? 1 : 0) +
    step;
  return `${Math.floor(index / 24)}-${String(Math.floor((index % 24) / 2) + 1).padStart(2, "0")}-${index % 2 ? "16" : "01"}`;
}
export function makePeriod(id: string): Period {
  const [y, m, d] = id.split("-").map(Number);
  const end = d === 1 ? 15 : new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { id, start: id, end: `${id.slice(0, 7)}-${end}`, deadline: null };
}
export function daysOf(p: Period): string[] {
  const result: string[] = [];
  let d = p.start;
  while (d <= p.end) {
    result.push(d);
    const v = new Date(d + "T12:00:00Z");
    v.setUTCDate(v.getUTCDate() + 1);
    d = v.toISOString().slice(0, 10);
  }
  return result;
}
export const shortDate = (d: string) =>
  `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
export const dayName = (d: string) =>
  ["日", "月", "火", "水", "木", "金", "土"][
    new Date(d + "T12:00:00Z").getUTCDay()
  ];
export const periodLabel = (p: Period) =>
  `${Number(p.start.slice(0, 4))}年${Number(p.start.slice(5, 7))}月 ${p.start.endsWith("01") ? "前半" : "後半"}`;
export const minutes = (s: string) =>
  Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
export const duration = (r: Row) => (minutes(r.end) - minutes(r.start)) / 60;
export const expired = (p: Period, now = Date.now()) =>
  p.end < today(now) || (p.deadline !== null && now >= Date.parse(p.deadline));
export const times = Array.from(
  { length: 96 },
  (_, i) =>
    `${String(Math.floor(i / 4)).padStart(2, "0")}:${["00", "15", "30", "45"][i % 4]}`,
);
export const startTimes = times.filter(t => t >= "10:00" && t <= "23:30");
export const defaultShiftTimes = { start: "18:00", end: "18:15" };
export function timeSelection(start: string) {
  const index = times.indexOf(start);
  return { start, end: index >= 0 ? times[index + 1] ?? "" : "" };
}
export function fullTimeNote(note: string, fullTime: boolean) {
  if (!fullTime && !note.split("\n").includes("[フルタイム]")) return note;
  const lines = note.split("\n").filter(line => line !== "[フルタイム]");
  if (fullTime) lines.push("[フルタイム]");
  return lines.join("\n").replace(/^\n+|\n+$/g, "");
}
export function floorHours(floor?: Floor, employmentType: EmploymentType = "partTime") {
  return { start: (employmentType === "staff" ? floor?.staffWorkStart : null) ?? floor?.workStart ?? "09:00", end: (employmentType === "staff" ? floor?.staffWorkEnd : null) ?? floor?.workEnd ?? "17:00" };
}
export function resolveFullTime<T extends Row>(row: T, floors: Floor[], employmentType: EmploymentType = "partTime"): T {
  return { ...row, ...(row.fullTime ? floorHours(floors.find(f => f.id === row.floorId), employmentType) : {}), note: fullTimeNote(row.note, !!row.fullTime) };
}
export function overlaps(a: Row, b: Row) {
  return (
    a.id !== b.id && a.date === b.date && a.start < b.end && a.end > b.start
  );
}
export function conflicts(rows: Row[]) {
  return rows.flatMap((a, i) =>
    rows
      .slice(i + 1)
      .filter((b) => overlaps(a, b))
      .map((b) => ({ a, b })),
  );
}
export function validateRow(r: Row, p: Period, floorIds: string[]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || r.date < p.start || r.date > p.end)
    throw new Error("勤務日は対象の半月内で指定してください。");
  if (!times.includes(r.start) || !times.includes(r.end) || r.start >= r.end)
    throw new Error(
      "時刻は15分単位で、終了を開始より後にしてください。日付またぎは登録できません。",
    );
  if (!floorIds.includes(r.floorId))
    throw new Error("選択できるフロアを確認してください。");
  if (r.note.length > 500)
    throw new Error("メモは500文字以内で入力してください。");
}

export function headcount(rows: Shift[], start?: number, end?: number) {
  return new Set(
    rows
      .filter(
        (s) =>
          start === undefined ||
          (minutes(s.start) < end! && minutes(s.end) > start),
      )
      .map((s) => s.employeeId),
  ).size;
}

export function initialDisplayDate(period: Period, currentDate = today()): string {
  return currentDate >= period.start && currentDate <= period.end ? currentDate : period.start;
}
export function adminListShifts(shifts: Shift[], period: Period, fromToday: boolean, currentDate = today()): Shift[] {
  // Historical half-months remain accessible in full.
  return fromToday && period.end >= currentDate ? shifts.filter(s => s.date >= currentDate) : shifts;
}

export function orderedEmployees(employees: Employee[], floor?: Floor): Employee[] {
  const order = new Map((floor?.employeeOrder ?? []).map((id, index) => [id, index]));
  return [...employees].sort((a,b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

export function applyBatchRows(rows: Row[], dates: string[], template: Row | null, period: Period, floors: Floor[], employmentType: EmploymentType = "partTime", currentDate = today()): Row[] {
  const selected = new Set(dates);
  if (!selected.size) throw new Error("日付を選んでください。");
  if (expired(period) || [...selected].some(d => d < currentDate || !daysOf(period).includes(d))) throw new Error("今日以降の受付中の日付を選び直してください。");
  const next = rows.filter(row => !selected.has(row.date));
  if (template) for (const date of selected) {
    const row = resolveFullTime({...template, date, id: rows.find(r=>r.date===date)?.id ?? crypto.randomUUID()}, floors, employmentType);
    validateRow(row, period, floors.map(f=>f.id));
    next.push(row);
  }
  if (next.length > 500) throw new Error("希望は500件以内にしてください。");
  return next;
}
