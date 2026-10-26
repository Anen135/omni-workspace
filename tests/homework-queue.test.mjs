import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import vm from 'node:vm';
import { chromium } from 'playwright';
import { validateInput, BridgeError } from '../server/bridge-protocol.mjs';
import { validateMessage } from '../extension/policy.mjs';
import { loadHomeworkQueue } from '../server/homework-queue.mjs';
import { dispatch } from '../shared/omni-agent.mjs';
import { createBridge } from '../server/omni-bridge.mjs';
const account = { id: '1', name: 'Fixture teacher' };
const input = { accountId: '1' };
test('homework queue accepts only an explicit bounded account', async () => {
  assert.doesNotThrow(() => validateInput('homework-queue', input));
  assert.doesNotThrow(() => validateMessage({action:'homework-queue',input}));
  for (const value of [null, [], {}, {accountId:1}, {accountId:'0'}, {accountId:'1234567890123'}, {...input,path:'/profile/get-profile'}]) {
    assert.throws(() => validateInput('homework-queue', value), {code:'BAD_INPUT'});
    await assert.rejects(loadHomeworkQueue(value,{identity:()=>assert.fail('no reads for invalid input')}),{code:'BAD_INPUT'});
  }
});
test('queue reads are identity-checked on both sides and preserve section errors', async () => {
  for (const changed of [1,2]) {
    let checks=0, reads=0;
    await assert.rejects(loadHomeworkQueue(input,{identity:async()=>({id:++checks===changed?'2':'1'}),section:async()=>{reads++;return {data:[],error:null}}}),{code:'ACCOUNT_CHANGED'});
    assert.equal(reads,changed-1);
  }
  const result=await loadHomeworkQueue(input,{identity:async()=>account,section:async()=>({data:null,error:'Unavailable'})});
  assert.equal(result.newHomework.error,'Unavailable');
  await assert.rejects(loadHomeworkQueue(input,{identity:async()=>account,section:async()=>{throw new BridgeError('AUTH_REQUIRED','expired')}}),{code:'AUTH_REQUIRED'});
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
    try { await run(input => dispatch('homework-queue', input)); }
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
  try { await bridge.dispatch('connect'); await run(input => bridge.dispatch('homework-queue', input)); }
  finally { await bridge.close(); connection.mock.restore(); }
}


for (const transport of ['extension', 'dev bridge']) {
 test(`${transport}: queue refresh sends exactly profile, queue, profile`, async () => {
  const paths=[];
  await withTransport(transport,async(path,options)=>{paths.push(path);assert.equal(options.method,'POST');assert.equal(options.credentials,'same-origin');
    return Response.json(path==='/profile/get-profile'?{teach_info:{id_teach:1,fio_teach:account.name}}:{homework:[],lab_work:[],requests:[]});
  },async load=>{const result=await load(input);assert.deepEqual(result.newHomework.data,{homework:[],lab_work:[],requests:[]});});
  assert.deepEqual(paths,['/profile/get-profile','/homework/get-new-homeworks','/profile/get-profile']);
 });
 test(`${transport}: stale account never exposes queue data`, async () => {
  for(const mismatch of [1,2]){let checks=0,reads=0;
   await withTransport(transport,async(path)=>{if(path==='/profile/get-profile')return Response.json({teach_info:{id_teach:++checks===mismatch?2:1,fio_teach:account.name}});reads++;return Response.json([])},async load=>{await assert.rejects(load(input),{code:'ACCOUNT_CHANGED'})});
   assert.equal(reads,mismatch-1);
  }
 });
}
