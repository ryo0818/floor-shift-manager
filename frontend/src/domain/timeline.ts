import { headcount, minutes, type Shift, type Workspace } from "./model";

// Preserve visibility of previously saved early/full-time shifts rather than clipping them.
export function timelineRange(rows: Pick<Shift, "start">[]) {
  return { from: Math.floor(Math.min(600, ...rows.map(r=>minutes(r.start))) / 60) * 60, to: 1440 };
}
export function peakHeadcount(rows: Shift[], from: number, to: number) {
  let peak = 0;
  for (let t=from; t<to; t+=15) peak = Math.max(peak, headcount(rows,t,Math.min(t+15,to)));
  return peak;
}

// Compare against the latest submitted request, never against an earlier admin adjustment.
export function originalRequestNote(shift: Shift, data: Pick<Workspace, "submissions" | "floors">): string | null {
  const original = shift.original;
  const submitted = data.submissions.some(s => s.employeeId === shift.employeeId &&
    s.submittedRows.some(row => row.id === original.id));
  if (!submitted) return null;
  const changed = shift.date !== original.date || shift.start !== original.start ||
    shift.end !== original.end || shift.floorId !== original.floorId ||
    Boolean(shift.fullTime) !== Boolean(original.fullTime);
  if (!changed) return null;
  const floor = data.floors.find(f => f.id === original.floorId)?.name ?? original.floorId;
  return `元の希望：${original.date} ／ ${floor} ／ ${original.start}〜${original.end}${original.fullTime ? "（フルタイム）" : ""}`;
}
