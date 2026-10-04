export type Role = "admin" | "employee";
export type Session = {
  role: Role;
  name: string;
  employeeId?: string;
  csrfToken?: string;
};
export type Floor = { id: string; name: string; color: string };
export type Employee = { id: string; name: string; floorIds: string[] };
export type Status = "pending" | "confirmed" | "declined";
export type Row = {
  id: string;
  date: string;
  start: string;
  end: string;
  floorId: string;
  note: string;
};
export type Shift = Row & { employeeId: string; status: Status; original: Row };
export type Submission = {
  employeeId: string;
  draftRows: Row[];
  draftNote: string;
  submittedRows: Row[];
  submittedNote: string;
  submittedAt: string | null;
  dirty: boolean;
};
export type Period = {
  id: string;
  start: string;
  end: string;
  deadline: string | null;
};
export type Workspace = {
  floors: Floor[];
  employees: Employee[];
  period: Period;
  submissions: Submission[];
  shifts: Shift[];
  policy: { allowEarlyConfirm: boolean };
};
export type Command =
  | { type: "saveDraft"; rows: Row[]; note: string }
  | { type: "submit"; acknowledgeOverlap: boolean }
  | {
      type: "saveShift";
      shift: Row & { employeeId: string };
      acknowledgeOverlap: boolean;
    }
  | { type: "deleteShift"; id: string }
  | { type: "setStatus"; ids: string[]; status: Status }
  | { type: "setDeadline"; deadline: string }
  | { type: "saveFloor"; floor: Floor }
  | { type: "saveEmployee"; employee: Employee };
export const statusNames: Record<Status, string> = {
  pending: "未確定",
  confirmed: "確定済み",
  declined: "見送り",
};
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
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
  !p.deadline || now >= Date.parse(p.deadline);
export const times = Array.from(
  { length: 96 },
  (_, i) =>
    `${String(Math.floor(i / 4)).padStart(2, "0")}:${["00", "15", "30", "45"][i % 4]}`,
);
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
