const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function load(name){const p=path.resolve(name),out={};const source=ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','exports',source)(n=>{if(!n.startsWith('.')&&!n.startsWith('@/'))return require(n);const base=n.startsWith('@/')?path.resolve('src',n.slice(2)):path.resolve(path.dirname(p),n);return load(['.ts','.tsx'].map(ext=>base+ext).find(f=>fs.existsSync(f)));},out);return out;}
const {PeriodGrid}=load('src/components/period-grid.tsx');
test('半月表はフロアごとに独立した順番と区分で表示する',()=>{
 const data={period:{start:'2030-04-01',end:'2030-04-15'},floors:[{id:'f1',name:'ホール',employeeOrder:['e2','e1']},{id:'f2',name:'テラス',employeeOrder:['e1','e2']}],employees:[{id:'e1',name:'一郎',employmentType:'staff'},{id:'e2',name:'二郎',employmentType:'partTime'}]};
 const visible=data.floors.flatMap(f=>data.employees.map(e=>({id:f.id+e.id,date:'2030-04-01',floorId:f.id,employeeId:e.id,start:'18:00',end:'19:00',status:'confirmed'})));
 const html=renderToStaticMarkup(React.createElement(PeriodGrid,{data,visible,onSelect(){}}));const sections=html.split('</section>');
 assert.ok(sections[0].indexOf('二郎')<sections[0].indexOf('一郎'));assert.ok(sections[1].indexOf('一郎')<sections[1].indexOf('二郎'));assert.match(html,/社員/);assert.match(html,/アルバイト/);assert.equal((html.match(/class="grid-shift confirmed"/g)||[]).length,4);
});
