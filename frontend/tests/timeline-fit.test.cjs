const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function load(name){const p=path.resolve(name),out={};const source=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','exports',source)(n=>{if(!n.startsWith('.')&&!n.startsWith('@/'))return require(n);const base=n.startsWith('@/')?path.resolve('src',n.slice(2)):path.resolve(path.dirname(p),n);return load(['.ts','.tsx'].map(ext=>base+ext).find(f=>fs.existsSync(f)));},out);return out;}
const {Timeline}=load('src/components/timeline.tsx');
const {timelineRange,peakHeadcount}=load('src/domain/timeline.ts');
const {endTimes,startTimes}=load('src/domain/model.ts');
const {dragShift}=load('src/domain/drag.ts');
test('時間候補は10時以降で24時を含まず15分刻み',()=>{
 assert.equal(startTimes[0],'10:00');assert.equal(endTimes[0],'10:00');assert.equal(endTimes.at(-1),'23:45');
 assert.equal(endTimes.length,56);assert.ok(endTimes.every(t=>t>='10:00'&&t<'24:00'));
});
test('通常軸は10時から、既存の早朝勤務は切り捨てない',()=>{
 assert.deepEqual(timelineRange([]),{from:600,to:1440});
 assert.equal(timelineRange([{start:'08:30'}]).from,480);
 assert.equal(timelineRange([{start:'18:00'}]).from,600);
});
test('時間内最大人数は交代勤務を合計せず15分ごとの同時人数を使う',()=>{
 const rows=[{employeeId:'a',start:'10:00',end:'10:30'},{employeeId:'b',start:'10:30',end:'11:00'}];
 assert.equal(peakHeadcount(rows,600,660),1);
 assert.equal(peakHeadcount([...rows,{employeeId:'c',start:'10:15',end:'10:45'}],600,660),2);
});
test('画面幅に収めたタイムラインが初期表示で固定の横幅を設定しない',()=>{
 const data={period:{start:'2030-04-01',end:'2030-04-15'},floors:[{id:'f1',name:'ホール'}],employees:[],shifts:[]};
 const html=renderToStaticMarkup(React.createElement(Timeline,{data,visible:[],date:'2030-04-01',floor:'all',busy:false,canConfirm:true,earliestEditDate:'2030-04-01',onDate(){},onEdit(){},onStatus(){},onMove(){}}));
 assert.match(html,/timeline-fit/);assert.match(html,/min-width:0/);assert.doesNotMatch(html,/min-width:2560/);assert.match(html,/時間内最大/);assert.match(html,/type="checkbox" checked=""/);
});
test('画面幅でドラッグしても10時を下回らず、移動時に長さを保つ',()=>{
 const shift={start:'18:00',end:'21:00',note:'',fullTime:false};
 const r=dragShift(shift,-9999,'move',600);assert.equal(r.start,'10:00');assert.equal(r.end,'13:00');
 assert.equal(dragShift(shift,-9999,'start',600).start,'10:00');
});
