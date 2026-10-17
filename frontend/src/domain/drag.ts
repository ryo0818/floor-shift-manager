import { minutes, type Shift } from "./model";
export type DragMode = "move" | "start" | "end";
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const time = (v: number) => `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
export function dragShift(shift: Shift, deltaMinutes: number, mode: DragMode): Shift {
  const delta = Math.round(deltaMinutes / 15) * 15;
  let start = minutes(shift.start), end = minutes(shift.end);
  if (mode === "move") {
    const offset = clamp(delta, -start, 1425 - end);
    start += offset; end += offset;
  } else if (mode === "start") start = clamp(start + delta, 0, end - 15);
  else end = clamp(end + delta, start + 15, 1425);
  return { ...shift, start: time(start), end: time(end) };
}
