import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import vm from 'node:vm';
import { chromium } from 'playwright';
import { validateInput, BridgeError } from '../server/bridge-protocol.mjs';
import { validateMessage } from '../extension/policy.mjs';
import { loadHomeworkHistory } from '../server/homework-history.mjs';
import { dispatch } from '../shared/omni-agent.mjs';
import { createBridge } from '../server/omni-bridge.mjs';
const account = { id: '1', name: 'Fixture teacher' };
const subject = { id_spec: 3, source: 'fixture', id_base_spec: 4, name_spec: 'Fixture subject' };
const catalog = { groups_spec: { 10: { id_tgroups: 10, name_tgroups: 'Fixture group', data: [subject] } } };
const input = { accountId: '1', groupId: '10', specKey: JSON.stringify(['3', 'fixture', 4]), year: '', month: '', limit: 10, offset: 0 };
const envelope = data => ({ data, error: null });

test('history rejects unbounded or unknown inputs before any reads', async () => {
 assert.doesNotThrow(()=>validateInput('homework-history',input));
 assert.doesNotThrow(()=>validateMessage({action:'homework-history',input}));
 for(const bad of [null,[],{}, {...input,accountId:1}, {...input,groupId:'0'}, {...input,path:'/auth/logout'}, {...input,limit:51}, {...input,offset:-1}, {...input,offset:1.1}, {...input,month:'13'}, {...input,year:'bad'}, {...input,specKey:'x'.repeat(513)}]) {
  await assert.rejects(loadHomeworkHistory(bad,{identity:()=>assert.fail('invalid input read')}),{code:'BAD_INPUT'});
 }
});
test('history isolates account, stale catalog, upstream and expired sessions',async()=>{
 for(const mismatch of [1,2]){
  let checks=0,reads=0;
  await assert.rejects(loadHomeworkHistory(input,{identity:async()=>({id:++checks===mismatch?'2':'1'}),section:async(path)=>{reads++;return envelope(path.endsWith('get-group-spec')?catalog:[]);}}),{code:'ACCOUNT_CHANGED'});
  assert.equal(reads,mismatch===1?0:3);
 }
 let paths=[];
 await assert.rejects(loadHomeworkHistory({...input,specKey:'stale'}, {identity:async()=>account,section:async path=>{paths.push(path);return envelope(catalog);}}),{code:'HOMEWORK_CHANGED'});
 assert.deepEqual(paths,['/homework/get-group-spec']);
 await assert.rejects(loadHomeworkHistory(input,{identity:async()=>account,section:async()=>{throw new BridgeError('AUTH_REQUIRED','expired')}}),{code:'AUTH_REQUIRED'});
 const result=await loadHomeworkHistory(input,{identity:async()=>account,section:async path=>path.endsWith('get-group-spec')?envelope(catalog):{data:null,error:'Unavailable'}});
 assert.equal(result.homeworks.error,'Unavailable');assert.equal(result.students.error,'Unavailable');
});
async function withTransport(transport, fetch, run) {
  const browserGlobals = {
    location: { origin: 'https://omni.top-academy.ru', pathname: '/' },
    document: { title: '', body: { innerText: '' }, querySelector: selector => selector.startsWith('meta') ? { content: 'fixture-csrf', getAttribute: () => 'fixture-csrf' } : null },
    sessionStorage: { getItem: () => 'fixture-hash' },
    AbortSignal, fetch,
  };
  if (transport === 'extension') {
    const names = Object.keys(browserGlobals);
    const saved = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
    Object.assign(globalThis, browserGlobals);
    try { await run(input => dispatch('homework-history', input)); }
    finally { names.forEach((name, index) => saved[index] ? Object.defineProperty(globalThis, name, saved[index]) : delete globalThis[name]); }
    return;
  }
  const context = vm.createContext(browserGlobals);
  const page = {
    isClosed: () => false, url: () => 'https://omni.top-academy.ru/', goto: async () => {}, bringToFront: async () => {},
    evaluate: async (fn, argument) => JSON.parse(JSON.stringify(await vm.runInContext(`(${fn.toString()})(${JSON.stringify(argument)})`, context))),
  };
  const connection = mock.method(chromium, 'connectOverCDP', async () => ({ contexts: () => [{ pages: () => [page] }], close: async () => {} }));
  const bridge = createBridge();
  try { await bridge.dispatch('connect'); await run(input => bridge.dispatch('homework-history', input)); }
  finally { await bridge.close(); connection.mock.restore(); }
}


for(const transport of ['extension','dev bridge']){
 test(`${transport}: readonly history uses exact original endpoints and guarded bodies`,async()=>{
  const calls=[];
  await withTransport(transport,async(path,options)=>{
   calls.push([path,JSON.parse(options.body)]);
   assert.equal(options.method,'POST');assert.equal(options.credentials,'same-origin');
   return Response.json(path==='/profile/get-profile'?{teach_info:{id_teach:1,fio_teach:account.name}}:path==='/homework/get-group-spec'?catalog:path==='/homework/get-students'?[{id_stud:2,fio_stud:'Fixture student'}]:{table_header:[],table_body:{}});
  },async load=>{const result=await load(input);assert.equal(result.account.id,'1');assert.deepEqual(result.homeworks.data,{table_header:[],table_body:{}})});
  assert.deepEqual(calls,[['/profile/get-profile',{}],['/homework/get-group-spec',{type:0}],['/homework/get-students',{id_tgroups:'10',source:'fixture',id_base_spec:4,transferred:false,spec:3}],['/homework/get-homeworks',{id_tgroups:'10',source:'fixture',id_base_spec:4,transferred:false,id_spec:3,limit:10,offset:0,type:0,year:'',month:''}],['/profile/get-profile',{}]]);
 });
}

for (const transport of ['extension', 'dev bridge']) {
 test(`${transport}: catalog subject without local id keeps explicit null in official request`, async () => {
  const nullableSubject = { id_spec: null, source: '2', id_base_spec: '14', name_spec: 'Fixture base subject' };
  const nullableCatalog = { groups_spec: { 10: { id_tgroups: 10, data: [nullableSubject] } } };
  const calls = [];
  await withTransport(transport, async (path, options) => {
   const body = JSON.parse(options.body);
   calls.push([path, body]);
   return Response.json(path === '/profile/get-profile' ? { teach_info: { id_teach: 1, fio_teach: account.name } }
    : path === '/homework/get-group-spec' ? nullableCatalog
    : path === '/homework/get-students' ? [] : { table_body: {}, table_header: [] });
  }, async load => { await load({ ...input, specKey: JSON.stringify([null, '2', '14']) }); });
  assert.deepEqual(calls.find(([path]) => path === '/homework/get-students')[1], { id_tgroups: '10', source: '2', id_base_spec: '14', transferred: false, spec: null });
  assert.deepEqual(calls.find(([path]) => path === '/homework/get-homeworks')[1], { id_tgroups: '10', source: '2', id_base_spec: '14', transferred: false, id_spec: null, limit: 10, offset: 0, type: 0, year: '', month: '' });
 });
}
