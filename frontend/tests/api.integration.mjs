// Optional HTTP integration test. Run against a disposable, initialized backend.
// SHIFT_TEST_PASSWORD must be the password of admin and employee01 (employee e1).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const password=process.env.SHIFT_TEST_PASSWORD;
if(!password) throw new Error('Set SHIFT_TEST_PASSWORD for the disposable test database.');
const base=process.env.SHIFT_TEST_URL||'http://127.0.0.1:5173';
const originalFetch=globalThis.fetch;
const jar=new Map();
globalThis.fetch=async (url,options={})=>{
  const headers=new Headers(options.headers);
  headers.set('Origin',base);
  if(jar.size) headers.set('Cookie',[...jar].map(([k,v])=>`${k}=${v}`).join('; '));
  const response=await originalFetch(new URL(url,base),{...options,headers});
  for(const cookie of response.headers.getSetCookie()) {
    const first=cookie.split(';')[0], at=first.indexOf('=');
    jar.set(first.slice(0,at),first.slice(at+1));
  }
  return response;
};
const source=fs.readFileSync('src/data/api.ts','utf8').replaceAll('import.meta.env.VITE_DEMO_MODE','"false"');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {api}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const period='2030-01-01';
await Promise.all([api.session(),api.session()]); // StrictMode-style duplicate bootstrap.
assert.equal((await api.login('admin',password)).role,'admin');
await api.load(period);
await api.command(period,{type:'setDeadline',deadline:new Date(Date.now()+86400000).toISOString()});
await api.logout();
assert.equal((await api.login('employee01',password)).employeeId,'e1');
await api.load(period);
await api.command(period,{type:'saveDraft',rows:[{id:'request1',date:'2030-01-03',start:'09:00',end:'12:00',floorId:'f1',note:'API結合確認'}],note:'提出全体'});
await api.command(period,{type:'submit',acknowledgeOverlap:false});
assert.equal((await api.load(period)).shifts.length,0);
await api.logout();
await api.login('admin',password);
let data=await api.load(period);
assert.equal(data.shifts.length,1);
assert.equal(data.shifts[0].note,'API結合確認');
await api.command(period,{type:'setDeadline',deadline:new Date(Date.now()-86400000).toISOString()});
// Real App passes status/original too; adapter must remove these read-only fields.
await api.command(period,{type:'saveShift',shift:{...data.shifts[0],end:'13:00'},acknowledgeOverlap:false});
await api.command(period,{type:'setStatus',ids:[data.shifts[0].id],status:'confirmed'});
data=await api.load(period);
assert.equal(data.shifts[0].status,'confirmed');
assert.equal(data.shifts[0].end,'13:00');
assert.equal(data.shifts[0].original.end,'12:00');
assert.equal((await api.session()).role,'admin');
await api.logout();
assert.equal(await api.session(),null);
console.log('PASS React API adapter → Vite proxy → FastAPI → PostgreSQL: login, CSRF, draft, submit, edit, confirm, session restore, logout.');
