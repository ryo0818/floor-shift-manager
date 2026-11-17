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
const {originalRequestNote}=load('src/domain/timeline.ts');
const original={id:'request-1',date:'2030-04-01',start:'18:00',end:'22:00',floorId:'f1',note:'本人のメモ',fullTime:true};
const changed={...original,start:'19:00',floorId:'f2',fullTime:false,employeeId:'e1',status:'pending',original};
const requestData={period:{start:'2030-04-01',end:'2030-04-15'},floors:[{id:'f1',name:'ホール'},{id:'f2',name:'キッチン'}],employees:[{id:'e1',name:'山田',floorIds:['f1','f2']}],submissions:[{employeeId:'e1',submittedRows:[original]}],shifts:[changed]};
test('調整後も提出時の時間・フロア・フルタイムを保持して表示する',()=>{
 const before=JSON.stringify(requestData);
 assert.equal(originalRequestNote(changed,requestData),'元の希望：2030-04-01（月） ／ ホール ／ 18:00〜22:00（フルタイム）');
 assert.equal(originalRequestNote({...changed,start:'20:00',status:'confirmed'},requestData),originalRequestNote(changed,requestData));
 assert.equal(JSON.stringify(requestData),before);
});
test('元の希望に戻した場合、メモだけの変更、管理者の直接追加には注記しない',()=>{
 assert.equal(originalRequestNote({...changed,...original,note:'管理者のメモ'},requestData),null);
 assert.equal(originalRequestNote(changed,{...requestData,submissions:[]}),null);
});
test('日付・終了・フルタイムのみの変更も注記する',()=>{
 for(const patch of [{date:'2030-04-02'},{end:'23:00'},{fullTime:false}]) {
  assert.ok(originalRequestNote({...changed,...original,...patch},requestData));
 }
});
test('元の希望はホバー不要でチャートの該当バーの下に表示される',()=>{
 const html=renderToStaticMarkup(React.createElement(Timeline,{data:requestData,visible:[changed],date:'2030-04-01',floor:'all',busy:false,canConfirm:true,earliestEditDate:'2030-04-01',onDate(){},onEdit(){},onStatus(){},onMove(){}}));
 assert.match(html,/class="timeline-original-note">元の希望：2030-04-01（月） ／ ホール ／ 18:00〜22:00（フルタイム）<\/div>/);
 assert.match(html,/timeline-shift-row/);
 assert.doesNotMatch(html,/height:52px/);
});

test('翌日・前日は半月境界、月末、年末、うるう日をまたぐ',()=>{
 const {adjacentTimelineDate}=load('src/domain/timeline.ts');
 for(const [date,offset,expected] of [
  ['2030-04-15',1,'2030-04-16'],['2030-04-16',-1,'2030-04-15'],
  ['2030-04-30',1,'2030-05-01'],['2030-05-01',-1,'2030-04-30'],
  ['2030-12-31',1,'2031-01-01'],['2031-01-01',-1,'2030-12-31'],
  ['2028-02-28',1,'2028-02-29'],['2028-02-29',1,'2028-03-01']
 ]) assert.equal(adjacentTimelineDate(date,offset),expected);
});
test('半月末でも翌日を操作でき、保存中は日付操作を無効化',()=>{
 const data={period:{start:'2030-04-01',end:'2030-04-15'},floors:[],employees:[],shifts:[]};
 const props={data,visible:[],date:'2030-04-15',floor:'all',busy:false,canConfirm:true,earliestEditDate:'2030-04-01',onDate(){},onEdit(){},onStatus(){},onMove(){}};
 const html=renderToStaticMarkup(React.createElement(Timeline,props));
 assert.match(html,/<button>翌日 →<\/button>/);assert.doesNotMatch(html,/max="2030-04-15"/);
 const busy=renderToStaticMarkup(React.createElement(Timeline,{...props,busy:true}));
 assert.match(busy,/<button disabled="">翌日 →<\/button>/);assert.match(busy,/type="date"[^>]*disabled=""/);
});
