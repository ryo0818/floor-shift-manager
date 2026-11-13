const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
function load(name){const p=path.resolve(name),out={};const source=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',source)(n=>n.startsWith('.')?load(path.resolve(path.dirname(p),n+'.ts')):require(n),out);return out;}
const m=load('src/domain/model.ts'), pdf=load('src/domain/period-print.ts');
const period=m.makePeriod('2026-11-01');
const shifts=[{id:'a',date:'2026-11-11',start:'18:00',end:'20:00',employeeId:'e1',floorId:'f1',status:'confirmed',fullTime:true,note:'非公開メモ'}, {id:'b',date:'2026-11-12',start:'18:00',end:'18:15',employeeId:'e2',floorId:'f2',status:'pending',note:''}];
const data={period,floors:[{id:'f1',name:'ホール <script>alert(1)</script>'},{id:'f2',name:'テラス'}],employees:[{id:'e1',name:'岡田 & 稜'},{id:'e2',name:'従業員2'}],shifts};
test('管理者の初期日付は日本時間の今日、対象外の半月は先頭日',()=>{
 const today=m.today(Date.parse('2026-11-11T15:00:00Z'));
 assert.equal(today,'2026-11-12');assert.equal(m.initialDisplayDate(period,today),today);
 assert.equal(m.initialDisplayDate(m.makePeriod('2026-12-16'),today),'2026-12-16');
 assert.deepEqual(m.adminListShifts(shifts,period,true,today),[shifts[1]]);
 assert.deepEqual(m.adminListShifts(shifts,period,false,today),shifts);
 assert.deepEqual(m.adminListShifts(shifts,period,true,'2026-12-01'),shifts);
});
test('PDFは半月全日・選択フロア・状態・フルタイムを含み、名前はHTMLエスケープする',()=>{
 const html=pdf.periodPrintHtml(data,[shifts[0]],'f1','確定済み');
 assert.match(html,/11\/1<br>/);assert.match(html,/11\/15<br>/);
 assert.match(html,/岡田 &amp; 稜/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
 assert.match(html,/フルタイム/);assert.match(html,/確定済み/);assert.doesNotMatch(html,/テラス|従業員2|非公開メモ/);
 assert.match(html,/A3 landscape/);
});
test('31日の後半・複数希望・空フロアも欠落なく出力',()=>{
 const p=m.makePeriod('2026-12-16');const rows=[{...shifts[0],date:'2026-12-31'},{...shifts[0],id:'c',date:'2026-12-31',start:'21:00',end:'22:00'}];
 const html=pdf.periodPrintHtml({...data,period:p},rows,'all','すべて');
 assert.match(html,/12\/16<br>/);assert.match(html,/12\/31<br>/);assert.match(html,/21:00/);
 assert.equal((html.match(/<section>/g)||[]).length,2);assert.match(html,/表示対象のシフトはありません/);
});
test('ポップアップ拒否はエラー、印刷はフォント読込後に呼ぶ',async()=>{
 global.window={open:()=>null};assert.throws(()=>pdf.printPeriod(data,shifts,'all','すべて'),/ポップアップ/);
 let printed=0,content='';const popup={opener:{},closed:false,focus(){},print(){printed++},document:{write(h){content=h},close(){},getElementById(){return {addEventListener(){}}},fonts:{ready:Promise.resolve()}}};
 global.window={open:()=>popup};pdf.printPeriod(data,shifts,'all','すべて');await Promise.resolve();assert.equal(printed,1);assert.equal(popup.opener,null);assert.match(content,/シフト半月表/);delete global.window;
});
test('PDFの行はフロア固有の従業員順になる',()=>{
 const input={...data,floors:[{id:'f1',name:'ホール',employeeOrder:['e2','e1']}]};
 const html=pdf.periodPrintHtml(input,[shifts[0],{...shifts[1],floorId:'f1'}],'f1','全件');
 assert.ok(html.indexOf('従業員2') < html.indexOf('岡田 &amp; 稜'));
});
