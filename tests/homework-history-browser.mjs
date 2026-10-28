import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const origin='https://omni.top-academy.ru';
const profile=await mkdtemp(resolve(tmpdir(),'omni-history-test-'));
const catalog={groups_spec:{10:{id_tgroups:10,name_tgroups:'Fixture group',data:[{id_spec:null,source:'2',id_base_spec:'14',name_spec:'Fixture subject'}]}}};
const fixture={table_header:Array.from({length:6},(_,i)=>({id_domzad:20+i,dz_theme:`Fixture task ${i}`,date_vizit:'2026-10-01',overdue:i===0})),table_body:{2:Object.fromEntries(Array.from({length:6},(_,i)=>[20+i,{id_stud:null,stud_stud:'2',fio_stud:'Fixture student',theme:null,status:i<5?i:99,mark:i===1?10:null,answer_text:i===1?'Fixture answer':'',id_domzadstud:100+i}]))}};
let context;
try{
 const extension=resolve('dist-extension');
 context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 const page=await context.newPage();page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let historyReads=0,failHistory=false,releaseHistory;
 let heldHistory=null;
 const paths=[];
 await context.route('https://fonts.googleapis.com/**',r=>r.abort());
 await context.route(origin+'/**',async route=>{
  const r=route.request();const path=new URL(r.url()).pathname;
  if(r.isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="csrf-token" content="fixture-csrf"><title>Fixture Omni</title><body><main>Original</main></body>'});
  paths.push(path);
  let data;
  if(path==='/profile/get-profile') data={teach_info:{id_teach:1,fio_teach:'Fixture teacher'}};
  else if(path==='/auth/get-start-info')data={branch:{name:'Fixture branch'}};
  else if(path==='/homework/get-group-spec')data=catalog;
  else if(path==='/homework/get-new-homeworks')data={homework:[{id:101,id_domzad:201,id_stud:2,ospr:0,fio_stud:'Fixture student',theme:'Fixture pending review',stud_date:'2026-10-01',comment:'Original response'}],lab_work:[],requests:[]};
  else if(path==='/homework/get-students')data=[];
  else if(path==='/homework/get-homeworks'){
   historyReads++;
   assert.equal(r.postDataJSON().type,0);assert.equal(r.postDataJSON().transferred,false);
   assert.equal(r.postDataJSON().id_spec,null);assert.equal(r.postDataJSON().source,'2');assert.equal(r.postDataJSON().id_base_spec,'14');
   if(heldHistory)await heldHistory;
   if(failHistory)return route.fulfill({status:500,body:'Fixture unavailable'});
   data=fixture;
  }
  else if(['/auth/get-teach-list','/students/get-groups-list'].includes(path))data=[];
  else if(['/schedule/get-schedule','/presents/get-presents','/presents/get-materials','/presents/get-homework','/presents/get-previous-presents'].includes(path))data={};
  else if(path==='/favicon.ico')return route.fulfill({status:404});
  else throw new Error(`Unexpected fixture endpoint: ${path}`);
  return route.fulfill({json:data});
 });
 await page.goto(origin+'/');
 await page.locator('.connected-badge').waitFor();
 await page.locator('.sidebar').getByRole('button',{name:'Домашние задания',exact:true}).click();
 await page.getByRole('button',{name:'Открыть работу',exact:true}).click();
 const responseDraft=page.getByRole('textbox',{name:/Ответ преподавателя:/});
 await responseDraft.fill('Unsaved fixture response');
 await page.getByRole('button',{name:/Превью работы:/}).click();
 await page.locator('.homework-quick-preview').waitFor();
 await page.getByRole('button',{name:'Журнал заданий',exact:true}).click();
 assert.equal(await page.locator('.homework-quick-preview').count(),0,'hidden queue closes preview portals');
 assert.equal(historyReads,0,'opening history does not silently fetch assignments');
 await page.getByRole('button',{name:'Загрузить историю',exact:true}).click();
 await page.locator('.homework-history tbody tr').first().waitFor();
 assert.equal(historyReads,1);
 const history=page.getByRole('region',{name:'История домашних заданий',exact:true});
 const rows=history.locator('tbody tr');
 assert.equal(await rows.count(),6);
 const statusFilters=history.getByRole('group',{name:'Фильтр статуса',exact:true});
 for(const [name,count] of [['Сдано',2],['Не сдано',1],['Просрочено',1],['Проверено',1],['Новые работы',1],['Пересдача',1],['Статус неизвестен',1],['Все',6]]){
  await statusFilters.getByRole('button',{name,exact:true}).click();
  assert.equal(await rows.count(),count,`${name} filters only exact Omni statuses`);
 }
 await rows.filter({hasText:'Fixture task 1'}).getByRole('button',{name:'Подробнее',exact:true}).click();
 await history.getByText('Fixture answer',{exact:true}).waitFor();
 assert.equal(await history.getByRole('spinbutton').count(),0,'history has no grade editor');
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'tmp/homework-history-mobile.png',animations:'disabled'});
 assert.ok(await history.evaluate(node=>node.scrollWidth<=node.clientWidth),'history fits narrow viewport');
 await page.setViewportSize({width:1440,height:1000});
 heldHistory=new Promise(resolve=>{releaseHistory=resolve});
 await history.getByRole('button',{name:'Загрузить историю',exact:true}).click();
 await history.getByText('Загружаем историю…',{exact:true}).waitFor();
 await history.getByLabel('Месяц').selectOption('1');
 const previousIdentity=page.waitForResponse(response=>new URL(response.url()).pathname==='/profile/get-profile');
 releaseHistory();heldHistory=null;
 await (await previousIdentity).finished();
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await history.locator('table').count(),0,'late previous-context success is discarded');
 // Load only the new context after the old request has settled.
 await history.getByRole('button',{name:'Загрузить историю',exact:true}).click();
 await rows.first().waitFor();
 assert.equal(historyReads,3);
 failHistory=true;
 await history.getByRole('button',{name:'Загрузить историю',exact:true}).click();
 await history.getByRole('alert').waitFor();
 assert.equal(await history.locator('table').count(),0,'failed reload never retains old rows');
 failHistory=false;
 for(let i=6;i<12;i++){
  fixture.table_header.push({id_domzad:20+i,dz_theme:`Fixture task ${i}`});
  fixture.table_body[2][20+i]={status:0};
 }
 await history.getByRole('button',{name:'Загрузить историю',exact:true}).click();
 await rows.first().waitFor();
 assert.equal(await rows.count(),10);
 await history.getByRole('button',{name:'Следующие задания',exact:true}).click();
 assert.equal(await history.locator('table').count(),0,'page context clears prior results');
 await history.getByRole('button',{name:'Загрузить историю',exact:true}).click();
 await rows.first().waitFor();
 assert.equal(await rows.count(),2,'assignment pagination slices complete headers correctly');
 fixture.table_header=[];fixture.table_body={};
 await history.getByRole('button',{name:'Загрузить историю',exact:true}).click();
 await history.getByText('Нет записей по выбранным условиям.',{exact:true}).waitFor();
 assert.equal(await rows.count(),0,'empty history has an explicit empty state');

 await page.getByRole('button',{name:'На проверку',exact:true}).click();
 assert.equal(await page.locator('.homework-history').count(),0);
 assert.equal(await responseDraft.inputValue(),'Unsaved fixture response','queue drafts survive visiting history');

 assert.equal(paths.some(path=>/save|set-mark|set-comment|delete|approve/.test(path)),false,'history makes no academic mutations');
 assert.deepEqual(errors,[]);
 console.log('PASS: extension history status filters/details, mobile layout, reload error, stale context, assignment pagination and queue switch; fictional data, no academic writes.');
}finally{
 await context?.close();
 if(profile.startsWith(resolve(tmpdir())+'\\')&&profile.includes('omni-history-test-'))await rm(profile,{recursive:true,force:true});
}
