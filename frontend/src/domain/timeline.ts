import { headcount, minutes, type Shift } from "./model";

// Preserve visibility of previously saved early/full-time shifts rather than clipping them.
export function timelineRange(rows: Pick<Shift, "start">[]) {
  return { from: Math.floor(Math.min(600, ...rows.map(r=>minutes(r.start))) / 60) * 60, to: 1440 };
}
export function peakHeadcount(rows: Shift[], from: number, to: number) {
  let peak = 0;
  for (let t=from; t<to; t+=15) peak = Math.max(peak, headcount(rows,t,Math.min(t+15,to)));
  return peak;
}
