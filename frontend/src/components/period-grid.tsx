import { daysOf, shortDate, dayName, statusNames, orderedEmployees, employmentNames, type Workspace, type Shift } from "../domain/model";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./ui/table";
export function PeriodGrid({data, visible, onSelect}: {data:Workspace;visible:Shift[];onSelect:(employeeId:string,floorId:string)=>void}) {
  return <>{data.floors.filter(f=>visible.some(s=>s.floorId===f.id)).map(f=>{
    const rows=visible.filter(s=>s.floorId===f.id);
    return <section key={f.id}><h3 className="period-floor-heading">{f.name}</h3><div className="grid-wrap"><Table className="period-table">
      <TableHeader><TableRow><TableHead>従業員</TableHead>{daysOf(data.period).map(d=><TableHead key={d}>{shortDate(d)}<small>{dayName(d)}</small></TableHead>)}</TableRow></TableHeader>
      <TableBody>{orderedEmployees(data.employees,f).filter(e=>rows.some(s=>s.employeeId===e.id)).map(e=><TableRow key={e.id}>
        <TableCell>{e.name}<small className="employee-kind">{employmentNames[e.employmentType ?? "partTime"]}</small></TableCell>
        {daysOf(data.period).map(d=><TableCell key={d}>{rows.filter(s=>s.employeeId===e.id && s.date===d).map(s=><button key={s.id} className={`grid-shift ${s.status}`} onClick={()=>onSelect(e.id,f.id)}><div className="row-time">{s.start}–{s.end}</div><span className={`status ${s.status}`}>{statusNames[s.status]}</span>{s.fullTime && <small>フルタイム</small>}</button>)}</TableCell>)}
      </TableRow>)}</TableBody>
    </Table></div></section>;
  })}</>;
}
