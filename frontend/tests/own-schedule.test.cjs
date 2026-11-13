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
const {OwnSchedule}=load('src/components/own-schedule.tsx');
const base={period:{id:'2030-04-01',start:'2030-04-01',end:'2030-04-15'},floors:[{id:'f1',name:'1F'}],submissions:[],confirmedSchedule:[]};
test('確定なしは休み確定と区別し未提出を表示する',()=>{
 const html=renderToStaticMarkup(React.createElement(OwnSchedule,{data:base}));
 assert.match(html,/未提出/);assert.match(html,/確定シフトなし/);assert.match(html,/休みが確定したという意味ではありません/);
});
test('保存した下書きではなく提出希望と確定勤務を並べる',()=>{
 const request={id:'r',date:'2030-04-01',start:'18:00',end:'20:00',floorId:'f1'};
 const data={...base,submissions:[{submittedAt:'2030-03-31',submittedRows:[request],draftRows:[{...request,start:'11:00'}]}],confirmedSchedule:[{...request,start:'19:00',floorName:'2F',fullTime:true}]};
 const html=renderToStaticMarkup(React.createElement(OwnSchedule,{data}));
 assert.match(html,/1F 18:00〜20:00/);assert.match(html,/2F 19:00〜20:00（フルタイム）/);assert.doesNotMatch(html,/11:00/);assert.match(html,/休み希望/);
});
