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
test('未入力の日にもフロア・開始終了の選択欄を表示し、1フロアは固定',()=>{
 const html=render({});assert.match(html,/未入力：休み希望/);
 assert.equal((html.match(/<select /g)||[]).length,3);
 assert.match(html,/<select[^>]*disabled=""[^>]*>/);
 assert.match(html,/<option value="f1" selected="">ホール/);
 assert.doesNotMatch(html,/時間帯を追加/);
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
test('時間指定の開始候補は10:00から15分刻み、未入力では希望を作成しない',()=>{
 const html=render({});
 const start=html.match(/<select[^>]*希望1 開始[^>]*>(.*?)<\/select>/)[1];
 assert.doesNotMatch(start,/value="09:/);
 assert.match(start,/value="10:00"/); assert.match(start,/value="10:15"/);
 assert.match(html,/フルタイム/); assert.match(html,/未入力：休み希望/);
});
test('フルタイムでは開始・終了を無効化し、過去日のロックも維持',()=>{
 const row={id:'a',date:base.date,start:'09:00',end:'17:00',floorId:'f1',note:'',fullTime:true};
 const html=render({rows:[row]});
 assert.match(html,/type="checkbox" checked=""/);
 assert.match(html,/<select[^>]*希望1 開始[^>]*disabled=""/);
 assert.match(html,/<select[^>]*希望1 終了[^>]*disabled=""/);
 assert.match(render({rows:[row],past:true}),/<fieldset[^>]*disabled=""/);
});
test('未操作の日は18:00〜18:15を表示し、休み希望のまま明示入力可能',()=>{
 const html=render({});
 assert.match(html,/<option value="18:00" selected="">/);
 assert.match(html,/<option value="18:15" selected="">/);
 assert.match(html,/未入力：休み希望/);assert.match(html,/この時間で希望を入力/);
});
const {DragBar}=load('src/components/drag-bar.tsx');
test('ガントバーにホバー不要のフルタイム表示を含める',()=>{
 const props={shift:{id:'x',date:base.date,start:'09:00',end:'17:00',floorId:'f1',employeeId:'e1',status:'pending',note:'',fullTime:true},index:0,from:0,span:1440,busy:false,name:'従業員',onDetail(){},onMove(){}};
 const html=renderToStaticMarkup(React.createElement(DragBar,props));
 assert.match(html,/<strong class="full-time-badge">フルタイム/);
 assert.match(html,/aria-label="従業員 フルタイム/);
});
