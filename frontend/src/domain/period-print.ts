import { orderedEmployees, daysOf, dayName, periodLabel, shortDate, statusNames, type Workspace, type Shift } from "./model";
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));

/** Export only the admin's loaded workspace and current floor/status/name selection. */
export function periodPrintHtml(data: Workspace, shifts: Shift[], floorId: string, selection: string): string {
  const days = daysOf(data.period);
  const pages = data.floors.filter(f => floorId === "all" || f.id === floorId).map(f => {
    const rows = shifts.filter(s => s.floorId === f.id && days.includes(s.date));
    const people = orderedEmployees(data.employees, f).filter(e => rows.some(s => s.employeeId === e.id));
    const body = people.map(e => `<tr><th scope="row">${escape(e.name)}</th>${days.map(day => {
      const cells = rows.filter(s => s.employeeId === e.id && s.date === day).sort((a,b) => a.start.localeCompare(b.start));
      return `<td>${cells.map(s => `<div class="shift ${s.status}"><b>${escape(s.start)}-${escape(s.end)}</b><span>${escape(statusNames[s.status])}</span>${s.fullTime ? '<strong>フルタイム</strong>' : ''}</div>`).join('') || '<span class="empty">—</span>'}</td>`;
    }).join('')}</tr>`).join('');
    return `<section><header><p>FLOOR SHIFT MANAGER</p><h1>${escape(periodLabel(data.period))} シフト半月表</h1><h2>${escape(f.name)}</h2><p>${escape(data.period.start)} 〜 ${escape(data.period.end)} ｜ ${escape(selection)}</p></header><p class="legend">未確定 / 確定済み / 見送りを文字で表示　・　— は表示対象シフトなし</p><table><thead><tr><th scope="col" class="person">従業員</th>${days.map(day => `<th scope="col">${shortDate(day)}<br>${dayName(day)}</th>`).join('')}</tr></thead><tbody>${body || `<tr><td colspan="${days.length + 1}" class="no-data">表示対象のシフトはありません。</td></tr>`}</tbody></table><footer>フロア別の半月表 ｜ フルタイムは登録済みの勤務時間で表示</footer></section>`;
  }).join('');
  return `<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(data.period.id)}_シフト半月表</title><style>
@page { size: A3 landscape; margin: 12mm; }
* { box-sizing: border-box; } body { margin: 0; color: #20372e; font-family: "Noto Sans CJK JP", "Yu Gothic", "Hiragino Kaku Gothic ProN", sans-serif; font-size: 10pt; }
.tools { position:sticky; top:0; background:#eef5f0; padding:16px; border-bottom:1px solid #cad8cf; } button { padding:8px 16px; cursor:pointer; } .tools p { margin:8px 0 0; }
section { padding:12mm; break-after:page; } section:last-child { break-after:auto; } header p { margin:0 0 6px; color:#526b5d; } h1 { font-size:20pt; margin:0 0 8px; } h2 { font-size:14pt; margin:0 0 8px; } .legend { font-size:9pt; }
table { width:100%; table-layout:fixed; border-collapse:collapse; } th,td { border:1px solid #bacac0; padding:5px 3px; vertical-align:top; text-align:center; overflow-wrap:anywhere; } thead { display:table-header-group; } thead th { background:#eaf2ed; font-size:10pt; } th.person { width:28mm; } tbody th { text-align:left; font-size:10pt; } tr { break-inside:avoid; } .shift { padding:4px 1px; border-bottom:1px dotted #b5c6bc; font-size:9pt; line-height:1.5; } .shift:last-child { border:0; } .shift b { white-space:nowrap; font-size:8.5pt; } .shift span,.shift strong { display:block; font-size:8pt; } .confirmed { background:#edf5ef; } .declined { color:#685f61; } .empty { color:#7a8780; } .no-data { padding:20px; } footer { margin-top:10px; font-size:8pt; color:#526b5d; }
@media print { .tools { display:none; } section { padding:0; } body { print-color-adjust:exact; -webkit-print-color-adjust:exact; } }
</style></head><body><div class="tools"><button id="print">PDFに保存 / 印刷</button><p>印刷画面の送信先で「PDFに保存」を選択してください。A3・横向き推奨。ヘッダーとフッターはオフにすると見やすくなります。</p></div>${pages || '<p>表示対象のフロアはありません。</p>'}</body></html>`;
}

export function printPeriod(data: Workspace, shifts: Shift[], floorId: string, selection: string) {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("PDF出力画面を開けませんでした。このサイトのポップアップを許可してください。");
  popup.opener = null;
  popup.document.write(periodPrintHtml(data, shifts, floorId, selection));
  popup.document.close();
  const print = () => { if (!popup.closed) { popup.focus(); popup.print(); } };
  popup.document.getElementById("print")?.addEventListener("click", print);
  void popup.document.fonts.ready.then(print);
}
