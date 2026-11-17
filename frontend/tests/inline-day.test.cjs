const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function load(file){
 const p=path.resolve(file),out={};
 const source=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports',source)(n=>n.startsWith('.')?load(path.resolve(path.dirname(p),n+'.ts')):require(n),out);return out;
}
const {InlineDay}=load('src/components/inline-day.tsx');
const base={date:'2030-04-01',rows:[],floors:[{id:'f1',name:'ホール',color:'#123456'}],period:{id:'2030-04-01',start:'2030-04-01',end:'2030-04-15',deadline:null},disabled:false,onChange(){},onRemove(){}};
const render=props=>renderToStaticMarkup(React.createElement(InlineDay,{...base,...props}));
test('未入力の日は勤務・休みの選択だけを表示し時間欄を隠す',()=>{
 const html=render({});assert.match(html,/休み希望/);assert.match(html,/勤務希望/);
 assert.doesNotMatch(html,/<select/);assert.doesNotMatch(html,/18:00/);
});
test('既存の複数希望・メモを表示、重複警告と行追加を表示',()=>{
 const row={id:'a',date:base.date,start:'09:00',end:'12:00',floorId:'f1',note:'希望メモ'};
 const html=render({rows:[row,{...row,id:'b',start:'11:00',end:'14:00'}]});
 assert.equal((html.match(/<select /g)||[]).length,6);
 assert.match(html,/希望メモ/);assert.match(html,/重複しています/);assert.match(html,/行を追加/);
});
test('入力途中を明示し、締切後は入力欄と削除を無効化',()=>{
 const html=render({disabled:true,rows:[{id:'a',date:base.date,start:'09:00',end:'',floorId:'f1',note:''}]});
 assert.match(html,/終了を開始より後/);assert.match(html,/<fieldset[^>]*disabled=""/);
 assert.match(html,/<button type="button" disabled="" class="text-btn"/);
});
test('時間指定の開始候補は10:00から30分刻み、未入力では希望を作成しない',()=>{
 const html=render({rows:[{id:'r',date:base.date,start:'18:00',end:'18:30',floorId:'f1',note:''}]});
 const start=html.match(/<select[^>]*希望1 開始[^>]*>(.*?)<\/select>/)[1];
 assert.doesNotMatch(start,/value="09:/);
 assert.match(start,/value="10:00"/); assert.match(start,/value="10:30"/); assert.doesNotMatch(start,/value="10:15"/);
 assert.match(html,/フルタイム/); assert.match(html,/勤務希望/);
});
test('フルタイムでは開始・終了を無効化し、過去日のロックも維持',()=>{
 const row={id:'a',date:base.date,start:'09:00',end:'17:00',floorId:'f1',note:'',fullTime:true};
 const html=render({rows:[row]});
 assert.match(html,/type="checkbox" checked=""/);
 assert.match(html,/<select[^>]*希望1 開始[^>]*disabled=""/);
 assert.match(html,/<select[^>]*希望1 終了[^>]*disabled=""/);
 assert.match(render({rows:[row],past:true}),/<fieldset[^>]*disabled=""/);
});
test('勤務希望を選んだ行にフロアと18:00〜18:30を表示する',()=>{
 const html=render({rows:[{id:'r',date:base.date,start:'18:00',end:'18:30',floorId:'f1',note:''}]});
 assert.match(html,/<option value="18:00" selected="">/);assert.match(html,/<option value="18:30" selected="">/);
 assert.match(html,/<option value="f1" selected="">ホール/);
 assert.match(html,/勤務希望/);assert.doesNotMatch(html,/勤務予定/);
});
const {DragBar}=load('src/components/drag-bar.tsx');
test('ガントバーにホバー不要のフルタイム表示を含める',()=>{
 const props={shift:{id:'x',date:base.date,start:'09:00',end:'17:00',floorId:'f1',employeeId:'e1',status:'pending',note:'',fullTime:true},index:0,from:0,span:1440,busy:false,name:'従業員',onDetail(){},onMove(){}};
 const html=renderToStaticMarkup(React.createElement(DragBar,props));
 assert.match(html,/<strong class="full-time-badge">フルタイム/);
 assert.match(html,/aria-label="従業員 フルタイム/);
});
test('希望入力の表記を勤務希望・休み希望に統一する',()=>{
 assert.match(render({}),/休み希望/);
 assert.match(render({rows:[{id:'r1',date:'2030-04-01',floorId:'f1',start:'18:00',end:'19:00',note:''}]}),/勤務希望/);
});

test('終了の選択欄は10時以降のみ、保存済み早朝値は表示だけ残す',()=>{
 const row={id:'r',date:base.date,start:'18:00',end:'22:00',floorId:'f1',note:''};
 const html=render({rows:[row]});
 const end=html.match(/<select[^>]*希望1 終了[^>]*>(.*?)<\/select>/)[1];
 assert.doesNotMatch(end,/value="0[0-9]:/);assert.doesNotMatch(end,/24:00/);assert.match(end,/23:30/);assert.doesNotMatch(end,/23:45/);
 const legacy=render({rows:[{...row,start:'08:00',end:'09:00'}]});
 assert.match(legacy,/value="09:00" disabled="" selected=""/);
});
test('希望の日付は括弧付き曜日、旧15分値は選択不可の保存済み表示',()=>{
 const html=render({rows:[{id:'r',date:base.date,start:'18:15',end:'21:45',floorId:'f1',note:''}]});
 assert.match(html,/（月）/);assert.match(html,/value="18:15" disabled="" selected="">18:15（保存済み）/);
});
const {requestStartTimes,requestEndTimes,requestTimeSelection,defaultRequestTimes,startTimes,endTimes,timeSelection,validateRequestTimes}=load('src/domain/model.ts');
test('従業員は30分単位と30分後の終了、管理者は15分単位を維持',()=>{
 assert.ok(requestStartTimes.every(t=>/:(00|30)$/.test(t)));assert.equal(requestStartTimes.at(-1),'23:00');assert.equal(requestEndTimes.at(-1),'23:30');
 assert.deepEqual(defaultRequestTimes,{start:'18:00',end:'18:30'});assert.deepEqual(requestTimeSelection('23:00'),{start:'23:00',end:'23:30'});
 assert.ok(startTimes.includes('18:15'));assert.ok(endTimes.includes('21:45'));assert.equal(timeSelection('18:00').end,'18:15');
});
test('新しい15分希望は拒否、既存希望の時刻保持とフルタイムは許可',()=>{
 const row={id:'legacy',date:base.date,start:'18:15',end:'21:45',note:'',floorId:'f1'};
 assert.throws(()=>validateRequestTimes(row),/30分/);
 assert.doesNotThrow(()=>validateRequestTimes({...row,note:'変更'},row));
 assert.throws(()=>validateRequestTimes({...row,date:'2030-04-02'},row),/30分/);
 assert.throws(()=>validateRequestTimes({...row,end:'22:15'},row),/30分/);
 assert.doesNotThrow(()=>validateRequestTimes({...row,end:'22:30'},row));
 assert.doesNotThrow(()=>validateRequestTimes({...row,fullTime:true}));
});
