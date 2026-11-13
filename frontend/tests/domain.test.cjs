const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
function setup(){const cache=new Map();function load(name){const p=path.resolve(name);if(cache.has(p))return cache.get(p);const out={};cache.set(p,out);const source=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',source)(n=>n.startsWith('.')?load(path.resolve(path.dirname(p),n+'.ts')):require(n),out);return out}return {m:load('src/domain/model.ts'),d:load('src/data/demo.ts'),drag:load('src/domain/drag.ts')}}
test('一括確定の重複エラーでは全件未変更、問題のない選択はまとめて確定',()=>{const {m,d}=setup();d.demoLogin('admin','demo1234');const id=m.periodOf(m.today());const w=d.readDemo(id),target=w.shifts.filter(s=>s.employeeId==='e1');assert.throws(()=>d.commandDemo(id,{type:'setStatus',ids:target.map(s=>s.id),status:'confirmed'}),/全件の確定を中止/);assert.deepEqual(d.readDemo(id).shifts,w.shifts);const ids=target.slice(0,3).map(s=>s.id);d.commandDemo(id,{type:'setStatus',ids,status:'confirmed'});assert.equal(d.readDemo(id).shifts.filter(s=>ids.includes(s.id)&&s.status==='confirmed').length,3);assert.throws(()=>d.commandDemo(id,{type:'setStatus',ids:[target[3].id],status:'confirmed'}),/全件の確定を中止/)});
test('確定済みは直接編集不可、未確定へ戻して修正。見送りからも戻せる',()=>{const {m,d}=setup();d.demoLogin('admin','demo1234');const id=m.movePeriod(m.periodOf(m.today()),1);d.commandDemo(id,{type:'setDeadline',deadline:null});const next=d.readDemo(id).shifts.find(s=>s.employeeId==='e2');d.commandDemo(id,{type:'setStatus',ids:[next.id],status:'confirmed'});const s=d.readDemo(id).shifts.find(s=>s.id===next.id);assert.throws(()=>d.commandDemo(id,{type:'saveShift',shift:s,acknowledgeOverlap:true}),/未確定に戻して/);d.commandDemo(id,{type:'setStatus',ids:[s.id],status:'pending'});d.commandDemo(id,{type:'saveShift',shift:{...s,note:'調整'},acknowledgeOverlap:true});d.commandDemo(id,{type:'setStatus',ids:[s.id],status:'declined'});d.commandDemo(id,{type:'setStatus',ids:[s.id],status:'pending'});assert.equal(d.readDemo(id).shifts.find(r=>r.id===s.id).note,'調整');assert.notEqual(d.readDemo(id).shifts.find(r=>r.id===s.id).original.note,'調整')});
test('下書きと提出を分離し、空欄全日を休みとして再提出できる',()=>{const {m,d}=setup();const id=m.movePeriod(m.periodOf(m.today()),1);d.demoEmployee('e1');const old=d.readDemo(id).submissions[0];d.commandDemo(id,{type:'saveDraft',rows:[],note:'全日休み希望'});d.demoLogin('admin','demo1234');let w=d.readDemo(id);assert.equal(w.shifts.filter(s=>s.employeeId==='e1').length,old.submittedRows.length);assert.equal(w.submissions[0].draftRows.length,0);d.demoEmployee('e1');d.commandDemo(id,{type:'submit',acknowledgeOverlap:true});assert.ok(d.readDemo(id).submissions[0].submittedAt);assert.equal(d.readDemo(id).submissions[0].submittedRows.length,0);d.demoLogin('admin','demo1234');assert.equal(d.readDemo(id).shifts.filter(s=>s.employeeId==='e1').length,0)});
test('締切後の従業員変更禁止、本人以外の閲覧と管理者操作を禁止',()=>{const {m,d}=setup();const id=m.periodOf(m.today());d.demoEmployee('e1');const w=d.readDemo(id);assert.equal(w.shifts.length,0);assert.equal(w.employees.length,1);assert.ok(w.submissions.every(s=>s.employeeId==='e1'));assert.throws(()=>d.commandDemo(id,{type:'saveDraft',rows:[],note:''}),/受付が終了/);assert.throws(()=>d.commandDemo(id,{type:'setStatus',ids:['x'],status:'confirmed'}),/管理者のみ/)});
test('15分単位・日付またぎ・割り当て範囲の入力制約、境界の接続は重複なし',()=>{const {m}=setup();const p=m.makePeriod('2026-10-01'),r={id:'a',date:'2026-10-03',start:'09:00',end:'12:00',floorId:'f1',note:''};assert.doesNotThrow(()=>m.validateRow(r,p,['f1']));assert.throws(()=>m.validateRow({...r,start:'09:10'},p,['f1']));assert.throws(()=>m.validateRow({...r,start:'22:00',end:'05:00'},p,['f1']));assert.throws(()=>m.validateRow({...r,end:'09:00'},p,['f1']));assert.throws(()=>m.validateRow({...r,floorId:'f2'},p,['f1']));assert.equal(m.overlaps(r,{...r,id:'b',start:'12:00',end:'17:00'}),false);assert.equal(m.daysOf(m.makePeriod('2028-02-16')).length,14)});
test('重複希望は確認前には提出不可、確認後は可能。締切前の確定は仮仕様として禁止',()=>{const {m,d}=setup();const id=m.movePeriod(m.periodOf(m.today()),1);d.demoEmployee('e1');assert.throws(()=>d.commandDemo(id,{type:'submit',acknowledgeOverlap:false}),/重複/);d.commandDemo(id,{type:'submit',acknowledgeOverlap:true});d.demoLogin('admin','demo1234');assert.throws(()=>d.commandDemo(id,{type:'setStatus',ids:[d.readDemo(id).shifts[0].id],status:'confirmed'}),/締切後に確定/)});
test('タイムライン人数：複数シフトの同一人物を重複除外し、終了時刻は人数から外す',()=>{const {m}=setup();const rows=[{employeeId:'a',start:'09:00',end:'12:00'},{employeeId:'a',start:'10:00',end:'13:00'},{employeeId:'b',start:'12:00',end:'15:00'}];assert.equal(m.headcount(rows),2);assert.equal(m.headcount(rows,600,615),1);assert.equal(m.headcount(rows,720,735),2);assert.equal(m.headcount(rows,780,795),1);assert.equal(m.headcount(rows,900,915),0);assert.equal(m.headcount(rows.map(s=>s.employeeId==='b'?{...s,start:'13:00'}:s),720,735),1);assert.equal(m.headcount([]),0)});

test('ドラッグ：15分丸め・移動時間保持・日境界・最短15分',()=>{
 const {drag}=setup();const s={id:'a',start:'09:00',end:'12:00',date:'2030-04-01',floorId:'f1',employeeId:'e1',status:'pending',note:'',original:{}};
 assert.equal(drag.dragShift(s,22,'move').start,'09:15');
 assert.equal(drag.dragShift(s,23,'move').end,'12:30');
 assert.equal(drag.dragShift(s,-9999,'move').start,'00:00');
 assert.equal(drag.dragShift(s,-9999,'move').end,'03:00');
 assert.equal(drag.dragShift(s,9999,'move').end,'23:45');
 assert.equal(drag.dragShift(s,9999,'start').start,'11:45');
 assert.equal(drag.dragShift(s,-9999,'end').end,'09:15');
 assert.equal(drag.dragShift(s,9999,'end').end,'23:45');
 assert.equal(s.start,'09:00');
});

test('フロア削除：確認後の操作で割り当て解除、他期間の使用は拒否、従業員は不可',()=>{
 const {m,d}=setup();d.demoLogin('admin','demo1234');const id=m.periodOf(m.today());
 d.commandDemo(id,{type:'saveFloor',floor:{id:'unused',name:'削除用',color:'#123456'}});
 d.commandDemo(id,{type:'saveEmployee',employee:{id:'new',name:'新人',floorIds:['unused']}});
 d.commandDemo(id,{type:'deleteFloor',id:'unused'});
 assert.ok(!d.readDemo(id).floors.some(f=>f.id==='unused'));
 assert.deepEqual(d.readDemo(id).employees.find(e=>e.id==='new').floorIds,[]);
 assert.throws(()=>d.commandDemo(id,{type:'deleteFloor',id:'unused'}),/削除済み/);
 const other=m.movePeriod(id,4);const before=d.readDemo(other);
 assert.throws(()=>d.commandDemo(other,{type:'deleteFloor',id:'f1'}),/使用中/);
 assert.deepEqual(d.readDemo(other),before);
 d.demoEmployee('e1');assert.throws(()=>d.commandDemo(id,{type:'deleteFloor',id:'f5'}),/管理者のみ/);
});

test('従業員削除：未使用のみ削除、他期間の履歴と従業員の操作を拒否',()=>{
 const {m,d}=setup();d.demoLogin('admin','demo1234');const id=m.periodOf(m.today());
 d.commandDemo(id,{type:'saveEmployee',employee:{id:'new',name:'新人',floorIds:['f1']}});
 const floors=d.readDemo(id).floors;
 d.commandDemo(id,{type:'deleteEmployee',id:'new'});
 assert.ok(!d.readDemo(id).employees.some(e=>e.id==='new'));
 assert.deepEqual(d.readDemo(id).floors,floors);
 assert.throws(()=>d.commandDemo(id,{type:'deleteEmployee',id:'new'}),/削除済み/);
 const other=m.movePeriod(id,4);const before=d.readDemo(other);
 assert.throws(()=>d.commandDemo(other,{type:'deleteEmployee',id:'e1'}),/削除できません/);
 assert.deepEqual(d.readDemo(other),before);
 d.demoEmployee('e1');assert.throws(()=>d.commandDemo(id,{type:'deleteEmployee',id:'e2'}),/管理者のみ/);
});
test('フルタイムはフロアの時間で保存・提出し、ドラッグすると時間指定に戻る',()=>{
 const {m,d,drag}=setup();const id=m.movePeriod(m.periodOf(m.today()),2);
 d.demoLogin('admin','demo1234');
 d.commandDemo(id,{type:'saveFloor',floor:{id:'f1',name:'ホール',color:'#123456',workStart:'08:30',workEnd:'19:00'}});
 d.demoEmployee('e1');
 const row={id:'full',date:id,start:'10:00',end:'17:00',floorId:'f1',note:'',fullTime:true};
 d.commandDemo(id,{type:'saveDraft',rows:[row],note:''});
 d.commandDemo(id,{type:'submit',acknowledgeOverlap:false});
 assert.equal(d.readDemo(id).submissions[0].submittedRows[0].start,'08:30');
 d.demoLogin('admin','demo1234');const shift=d.readDemo(id).shifts[0];
 assert.equal(shift.end,'19:00');assert.equal(drag.dragShift(shift,15,'end').fullTime,false);
 assert.equal(drag.dragShift(shift,0,'end').fullTime,true);
 assert.equal(m.resolveFullTime({...row,fullTime:false},[]).start,'10:00');
});
test('時間指定は18:00初期値、開始選択で15分後を設定し日をまたがない',()=>{
 const {m}=setup();
 assert.deepEqual(m.defaultShiftTimes,{start:'18:00',end:'18:15'});
 assert.deepEqual(m.timeSelection('18:45'),{start:'18:45',end:'19:00'});
 assert.deepEqual(m.timeSelection('23:30'),{start:'23:30',end:'23:45'});
 assert.ok(!m.startTimes.includes('23:45'));
});
test('フルタイムのメモは重複せず解除・ドラッグで自動表示だけを削除',()=>{
 const {m,drag}=setup();const row={id:'x',date:'2030-04-01',start:'18:00',end:'18:15',floorId:'f1',note:'相談あり',fullTime:true};
 const full=m.resolveFullTime(row,[]);
 assert.equal(full.note,'相談あり\n[フルタイム]');
 assert.equal(m.resolveFullTime(full,[]).note,full.note);
 assert.equal(m.resolveFullTime({...full,fullTime:false},[]).note,'相談あり');
 assert.equal(drag.dragShift(full,15,'end').note,'相談あり');
});
test('フロア別の順番は独立し、社員とアルバイトでフルタイムが異なる',()=>{
 const {m,d}=setup();const floor={id:'f1',name:'区分テスト',color:'#123456',workStart:'18:00',workEnd:'22:00',staffWorkStart:'09:00',staffWorkEnd:'18:00',employeeOrder:['e2','e1']};
 const people=[{id:'e1'},{id:'e2'},{id:'e3'}];assert.deepEqual(m.orderedEmployees(people,floor).map(e=>e.id),['e2','e1','e3']);
 assert.deepEqual(m.orderedEmployees(people,{...floor,employeeOrder:['e1','e2']}).map(e=>e.id),['e1','e2','e3']);
 const row={id:'r',date:'2030-04-01',start:'10:00',end:'17:00',floorId:'f1',note:'',fullTime:true};
 assert.equal(m.resolveFullTime(row,[floor],'staff').start,'09:00');assert.equal(m.resolveFullTime(row,[floor],'partTime').start,'18:00');
 const id=m.movePeriod(m.periodOf(m.today()),3);d.demoLogin('admin','demo1234');d.commandDemo(id,{type:'saveFloor',floor});
 const employee=d.readDemo(id).employees.find(e=>e.id==='e1');d.commandDemo(id,{type:'saveEmployee',employee:{...employee,employmentType:'staff'}});
 d.demoEmployee('e1');d.commandDemo(id,{type:'saveDraft',rows:[{...row,date:id}],note:''});assert.equal(d.readDemo(id).submissions[0].draftRows[0].start,'09:00');
});
test('確定後の再提出は変更した希望だけ未確定に戻す',()=>{
 const {m,d}=setup();const id=m.movePeriod(m.periodOf(m.today()),3);
 const a={id:'a',date:id,start:'18:00',end:'19:00',floorId:'f1',note:''},b={...a,id:'b',date:id.slice(0,8)+String(Number(id.slice(8))+1).padStart(2,'0')};
 d.demoEmployee('e1');d.commandDemo(id,{type:'saveDraft',rows:[a,b],note:''});d.commandDemo(id,{type:'submit',acknowledgeOverlap:false});
 d.demoLogin('admin','demo1234');const before=d.readDemo(id).shifts;d.commandDemo(id,{type:'setStatus',ids:before.map(s=>s.id),status:'confirmed'});
 d.demoEmployee('e1');d.commandDemo(id,{type:'saveDraft',rows:[{...a,end:'20:00'},b],note:''});d.commandDemo(id,{type:'submit',acknowledgeOverlap:false});
 d.demoLogin('admin','demo1234');const after=d.readDemo(id).shifts;assert.equal(after.find(s=>s.original.id==='a').status,'pending');assert.equal(after.find(s=>s.original.id==='b').status,'confirmed');assert.deepEqual(after.map(s=>s.id),before.map(s=>s.id));
});
test('一括入力は選択日だけを置換し、元のID・過去日・未選択日は保持する',()=>{
 const {m}=setup();const p=m.makePeriod('2030-04-01');const a={id:'keep',date:'2030-04-02',start:'18:00',end:'19:00',floorId:'f1',note:''};const b={...a,id:'other',date:'2030-04-03'};
 const floors=[{id:'f1',workStart:'18:00',workEnd:'22:00',staffWorkStart:'09:00',staffWorkEnd:'17:00'}];
 const next=m.applyBatchRows([a,b],['2030-04-02','2030-04-04'],{...a,fullTime:true},p,floors,'staff','2030-04-02');
 assert.equal(next.find(r=>r.date===a.date).id,'keep');assert.equal(next.find(r=>r.date===a.date).start,'09:00');assert.deepEqual(next.find(r=>r.id==='other'),b);assert.equal(next.length,3);
 assert.deepEqual(m.applyBatchRows([a,b],[a.date],null,p,floors,'staff','2030-04-02'),[b]);
 assert.throws(()=>m.applyBatchRows([a,b],['2030-04-01'],a,p,floors,'staff','2030-04-02'),/今日以降/);
 assert.throws(()=>m.applyBatchRows([a],[],a,p,floors),/日付を選んで/);
 assert.throws(()=>m.applyBatchRows([a],['2030-04-02'],{...a,floorId:'other'},p,floors),/フロア/);
});
test('変更前後は再提出で記録され、同じ内容の再提出で消えず確定でマークが消える',()=>{
 const {m,d}=setup(),id=m.movePeriod(m.periodOf(m.today()),3);const row={id:'a',date:id,start:'18:00',end:'19:00',floorId:'f1',note:''};
 d.demoEmployee('e1');d.commandDemo(id,{type:'saveDraft',rows:[row],note:''});d.commandDemo(id,{type:'submit',acknowledgeOverlap:false});d.commandDemo(id,{type:'saveDraft',rows:[{...row,end:'20:00'}],note:''});d.commandDemo(id,{type:'submit',acknowledgeOverlap:false});d.commandDemo(id,{type:'submit',acknowledgeOverlap:false});
 d.demoLogin('admin','demo1234');const w=d.readDemo(id),shift=w.shifts[0];assert.equal(shift.requestChange.before.end,'19:00');assert.equal(shift.requestChange.after.end,'20:00');assert.equal(w.submissions[0].latestChanges.length,1);
 d.commandDemo(id,{type:'setStatus',ids:[shift.id],status:'confirmed'});assert.equal(d.readDemo(id).shifts[0].requestChange,undefined);
});

test('退職は履歴を残してログイン・新規勤務・確定を停止し復帰できる',()=>{
 const {m,d}=setup();const id=m.movePeriod(m.periodOf(m.today()),1);
 d.demoLogin('admin','demo1234');d.commandDemo(id,{type:'setDeadline',deadline:null});
 const before=d.readDemo(id);const pending=before.shifts.find(s=>s.employeeId==='e1'&&s.status==='pending');
 d.commandDemo(id,{type:'setEmployeeActive',id:'e1',active:false});
 assert.deepEqual(d.readDemo(id).shifts,before.shifts);
 assert.throws(()=>d.demoEmployee('e1'));
 assert.throws(()=>d.commandDemo(id,{type:'setStatus',ids:[pending.id],status:'confirmed'}),/退職者/);
 assert.throws(()=>d.commandDemo(id,{type:'saveShift',shift:{...pending,id:'new'},acknowledgeOverlap:true}),/退職者/);
 const employee=d.readDemo(id).employees.find(e=>e.id==='e1');
 d.commandDemo(id,{type:'saveEmployee',employee:{...employee,active:true}});
 assert.equal(d.readDemo(id).employees.find(e=>e.id==='e1').active,false);
 d.commandDemo(id,{type:'setEmployeeActive',id:'e1',active:true});
 d.demoEmployee('e1');assert.equal(d.readDemo(id).employees[0].active,true);
});
test('従業員への確定予定は本人の確定分だけでメモや他人の情報を含まない',()=>{
 const {m,d}=setup();const id=m.movePeriod(m.periodOf(m.today()),1);
 d.demoLogin('admin','demo1234');d.commandDemo(id,{type:'setDeadline',deadline:null});
 const pending=d.readDemo(id).shifts.find(s=>s.employeeId==='e1'&&s.status==='pending');
 d.commandDemo(id,{type:'setStatus',ids:[pending.id],status:'confirmed'});
 d.demoEmployee('e1');const result=d.readDemo(id);
 assert.ok(result.confirmedSchedule.some(s=>s.id===pending.id));assert.equal(result.shifts.length,0);
 for(const row of result.confirmedSchedule){assert.equal('note' in row,false);assert.equal('original' in row,false);assert.equal('employeeId' in row,false);}
});
