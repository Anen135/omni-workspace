import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle=await build({stdin:{contents:"export {createRosterCache} from './src/app/roster-cache'; export {omniRequest} from './src/services/omni-client';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env.MODE':'"development"'}});
const {createRosterCache,omniRequest}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
globalThis.window={};
const account={id:'1',name:'Fictional',branch:'A'};
const fixture=()=>({account,students:[{id_stud:10,gpa:0}]});
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('roster results and in-flight reads are shared within one workspace generation',async()=>{
 let calls=0,release;
 globalThis.fetch=async()=>{calls++;await new Promise(resolve=>{release=resolve});return Response.json(fixture())};
 const cache=createRosterCache(account);const first=cache.read('7');const second=cache.read('7');await tick();assert.equal(calls,1);release();
 assert.strictEqual(await first,await second);assert.equal((await cache.read('7')).students[0].gpa,0);assert.equal(calls,1);
 globalThis.fetch=async()=>{calls++;return Response.json(fixture())};await cache.read('7',{},true);assert.equal(calls,2);
 globalThis.fetch=async()=>{calls++;return Response.json({...fixture(),account:{...account,branch:'B'}})};
 await createRosterCache({...account,branch:'B'}).read('7');assert.equal(calls,3);
});
test('wrong account or explicit branch results are rejected and never cached',async()=>{
 for(const changed of [{id:'2'}, {branch:'B'}]){let calls=0;const cache=createRosterCache(account);
 globalThis.fetch=async()=>{calls++;return Response.json({...fixture(),account:{...account,...changed}})};
 await assert.rejects(cache.read('7'),{code:'ACCOUNT_CHANGED'});await assert.rejects(cache.read('7'),{code:'ACCOUNT_CHANGED'});assert.equal(calls,2);
 }
});
test('queued background cancellation permits a new foreground consumer without duplicate dispatch',async()=>{
 let release,groups=0;
 globalThis.fetch=async path=>{if(path.endsWith('/student')){await new Promise(resolve=>{release=resolve});return Response.json({})}groups++;return Response.json(fixture())};
 const active=omniRequest('student',{stud:'10'});await tick();const cache=createRosterCache(account);const controller=new AbortController();
 const background=cache.read('7',{priority:'background',signal:controller.signal});const rejected=assert.rejects(background,{name:'AbortError'});controller.abort();
 const foreground=cache.read('7');release();await active;await rejected;await foreground;assert.equal(groups,1);
});
test('old workspace completion does not populate a new generation',async()=>{
 let release,calls=0;
 globalThis.fetch=async()=>{calls++;if(calls===1)await new Promise(resolve=>{release=resolve});return Response.json(fixture())};
 const old=createRosterCache(account),fresh=createRosterCache(account);const pending=old.read('7');await tick();release();await pending;await fresh.read('7');assert.equal(calls,2);
});
