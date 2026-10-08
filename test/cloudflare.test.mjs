import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateEquipment, extractBEO, setupDeadline, suggestAssignments } from '../src/domain.mjs';

function pdfDocument(pages) {
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const ids=[];
  for(const lines of pages){const stream='BT /F1 12 Tf 50 750 Td '+lines.map((text,i)=>`${i?'0 -20 Td ':''}(${text.replace(/[()\\]/g,'\\$&')}) Tj`).join('\n')+' ET';const pageId=objects.length+1,streamId=pageId+1;ids.push(pageId);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`,`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);}
  objects[1]=`<< /Type /Pages /Count ${ids.length} /Kids [${ids.map(id=>`${id} 0 R`).join(' ')}] >>`;
  let doc='%PDF-1.4\n';const offsets=[0];objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(doc));doc+=`${i+1} 0 obj\n${obj}\nendobj\n`;});const start=Buffer.byteLength(doc);doc+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return Buffer.from(doc);
}
const photo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF1cAAAAASUVORK5CYII=','base64');
test('equipment quantities and assignment suggestions respect real rules',()=>{
  const list=calculateEquipment([{id:'chafer',name:'Chafers',eventType:'buffet',basis:'dishes',quantity:1,per:1,unit:'each'},{id:'plate',name:'Plates',eventType:'buffet',basis:'guests',quantity:1,per:1,unit:'each'},{id:'rack',name:'Racks',eventType:'buffet',basis:'guests',quantity:1,per:20,unit:'each'}],{type:'Lunch Buffett',guests:101,dishes:['a','b','c','d','e']});
  assert.deepEqual(list.map(i=>i.required),[5,101,6]);
  assert.equal(setupDeadline({start:'2026-10-07T17:00:00Z'}),'2026-10-07T16:00:00.000Z');
  const event={id:'target',start:'2026-10-08T04:00:00Z',room:'Wilson',zone:'Floor 2'};
  const all=[{id:'earlier',start:'2026-10-07T19:00:00Z',room:'Wilson',assignees:['a'],completion:{}}];
  const suggestion=suggestAssignments(event,[{id:'a',active:1,role:'steward',name:'Alex'},{id:'b',active:1,role:'steward',name:'Blair'}],all);
  assert.equal(suggestion[0].user.id,'a');assert.equal(suggestion[0].sameRoom,1);
  assert.equal(extractBEO('BEO #: 00123\nREVISED\nRoom: Wilson\nGuests: 100\nLunch Buffet').beo,'00123');
  assert.equal(extractBEO('BEO #: 00123\nBEO #: 00124').multipleBEOs,true);
});

test('shared banquet workflow, permissions, multi-page PDF, revisions and durable audit',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'banquet-test-'));
  const base='https://banquet.test';
  const mf=new Miniflare(convertV4MiniflareOptions({modules:['index.mjs','backend-app.mjs','domain.mjs'].map(name=>({type:'ESModule',path:new URL('../src/'+name,import.meta.url).pathname,contents:readFileSync(new URL('../src/'+name,import.meta.url),'utf8')})),modulesRoot:new URL('../src/',import.meta.url).pathname,compatibilityDate:'2026-10-07',compatibilityFlags:['nodejs_compat'],durableObjects:{BANQUET:{className:'BanquetVenue',useSQLite:true}},durableObjectsPersist:directory,bindings:{BOOTSTRAP_TOKEN:'test-bootstrap-secret',MAX_STORAGE_BYTES:'419430400'}}));
  t.after(async()=>{await mf.dispose();rmSync(directory,{recursive:true,force:true});});
  const admin={},alice={},bob={},unassigned={};let event;
  async function call(path,actor=admin,method='GET',body=null,expected=200,extra={}) {
    const headers={...extra};if(actor.cookie)headers.Cookie=actor.cookie;if(method!=='GET'&&actor.csrf)headers['X-CSRF-Token']=actor.csrf;
    if(body&&!(body instanceof FormData)){headers['Content-Type']='application/json';body=JSON.stringify(body);}
    if(body instanceof FormData){const encoded=new Request(base+path,{method,body});headers['Content-Type']=encoded.headers.get('content-type');body=await encoded.arrayBuffer();}
    const response=await mf.dispatchFetch(base+path,{method,headers,body});let result;const type=response.headers.get('content-type')||'';if(type.includes('application/json'))result=await response.json();else result=await response.arrayBuffer();assert.equal(response.status,expected,JSON.stringify(result));
    const cookie=response.headers.get('set-cookie');if(cookie)actor.cookie=cookie.split(';')[0];if(result.csrf)actor.csrf=result.csrf;return result;
  }
  await t.test('first admin, per-person accounts and authorization',async()=>{
    await call('/api/state',{},'GET',null,401);
    await call('/api/setup',{},'POST',{name:'Supervisor',email:'admin@example.test',password:'test-admin-password',token:'wrong'},403);
    const initialized=await call('/api/setup',admin,'POST',{name:'Supervisor',email:'admin@example.test',password:'test-admin-password',token:'test-bootstrap-secret'});assert.equal(initialized.user.role,'supervisor');
    await call('/api/setup',admin,'POST',{},409);
    for(const [actor,name,email]of [[alice,'Alice','alice@example.test'],[bob,'Bob','bob@example.test'],[unassigned,'Casey','casey@example.test']]){const created=await call('/api/users',admin,'POST',{name,email,role:'steward',password:'test-steward-password'},201);actor.id=created.user.id;await call('/api/login',actor,'POST',{email,password:'test-steward-password'});}
    await call('/api/rules',alice,'PUT',{rules:[]},403);
    await call('/api/import/pdf',alice,'POST',new FormData(),403);
    await call('/api/events',alice,'POST',{},403);
    const csrf=admin.csrf;delete admin.csrf;await call('/api/users',admin,'POST',{},403);admin.csrf=csrf;
  });
  await t.test('all PDF pages are read; event checklist uses guest and dish rules',async()=>{
    const upload=new FormData();upload.set('file',new Blob([pdfDocument([['BEO #: 00123','Event Name: Conference Lunch','Room: Wilson Room','Guests: 100','Lunch Buffet'],['BEO #: 00123','REVISED','Second page: Five hot buffet dishes','Setup: 100 plates and service equipment']])],{type:'application/pdf'}),'multi-page-beo.pdf');upload.set('text','BEO #: 00123\nEvent Name: Conference Lunch\nRoom: Wilson Room\nGuests: 100\nLunch Buffet\n--- Page 2 ---\nREVISED\nSecond page: five buffet dishes');upload.set('pages','2');upload.set('ocr','false');
    const extracted=await call('/api/import/pdf',admin,'POST',upload);assert.equal(extracted.pages,2);assert.match(extracted.text,/Second page/);assert.equal(extracted.fields.beo,'00123');assert.equal(extracted.fields.revision,true);
    const result=await call('/api/events',admin,'POST',{beo:'00123',name:'Conference Lunch',room:'Wilson Room',zone:'Floor 2',type:'Lunch buffet',guests:100,start:'2026-10-07T17:00:00Z',dishes:['Chicken','Beef','Fish','Potatoes','Vegetables'],assignees:[alice.id,bob.id],fileId:extracted.fileId},201);event=result.event;assert.equal(event.equipment.find(i=>i.name==='Chafers').required,5);assert.equal(event.equipment.find(i=>i.name==='Dinner plates').required,100);
    assert.equal((await call('/api/state',alice)).events.length,1);assert.equal((await call('/api/state',unassigned)).events.length,0);
    await call(`/api/events/${event.id}`,unassigned,'GET',null,403);
    await call(`/api/files/${event.sourceFile}`,unassigned,'GET',null,403);await call(`/api/files/${event.sourceFile}`,alice);
    await call('/api/events',admin,'POST',{...event},409);
  });
  await t.test('reviewed multi-page OCR metadata is retained',async()=>{
    const upload=new FormData();upload.set('file',new Blob([pdfDocument([['BEO #: 00222'],['REVISED']])],{type:'application/pdf'}),'scanned.pdf');upload.set('text','BEO #: 00222\nREVISED\nSecond page: hot buffet dishes');upload.set('pages','2');upload.set('ocr','true');
    const extracted=await call('/api/import/pdf',admin,'POST',upload);assert.equal(extracted.ocr,true);assert.equal(extracted.pages,2);assert.equal(extracted.fields.beo,'00222');assert.equal(extracted.fields.revision,true);assert.match(extracted.text,/Second page/);
  });
  await t.test('two stewards see shared progress, stale edits cannot overwrite, photo required',async()=>{
    const item=event.equipment[0];const staleVersion=event.version;
    event=(await call(`/api/events/${event.id}/checklist`,alice,'PATCH',{version:event.version,itemId:item.id,ready:item.required})).event;
    const bobsState=await call('/api/state',bob);assert.equal(bobsState.events[0].equipment[0].ready,item.required);
    await call(`/api/events/${event.id}/checklist`,bob,'PATCH',{version:staleVersion,itemId:event.equipment[1].id,ready:100},409);
    const missing=new FormData();missing.set('version',event.version);await call(`/api/events/${event.id}/complete`,alice,'POST',missing,400);
    for(const required of event.equipment.slice(1))event=(await call(`/api/events/${event.id}/checklist`,bob,'PATCH',{version:event.version,itemId:required.id,ready:required.required})).event;
    missing.set('version',event.version);await call(`/api/events/${event.id}/complete`,alice,'POST',missing,400);
    const complete=new FormData();complete.set('version',event.version);complete.set('photo',new Blob([photo],{type:'image/png'}),'setup.png');event=(await call(`/api/events/${event.id}/complete`,alice,'POST',complete)).event;
    assert.equal(event.completion.userId,alice.id);assert.ok(event.completion.time);await call(`/api/files/${event.completion.photoId}`,bob);
    await call(`/api/events/${event.id}/checklist`,bob,'PATCH',{version:event.version,itemId:event.equipment[0].id,ready:0},409);
  });
  await t.test('last-minute adjustment reopens setup, alerts both stewards and preserves prior photo audit',async()=>{
    const prior=event.completion.photoId;
    const equipment=event.equipment.map(i=>({...i,required:i.name==='Chafers'?i.required+1:i.required}));event=(await call(`/api/events/${event.id}/equipment`,admin,'PUT',{version:event.version,equipment,reason:'One extra buffet station'})).event;
    assert.equal(event.completion,null);assert.equal(event.equipment[0].required,6);assert.equal(event.equipment[0].ready,5);
    for(const actor of[alice,bob])assert.ok((await call('/api/state',actor)).notifications.some(n=>n.message.includes('Equipment changed')));
    const audit=(await call('/api/state',admin)).audit;assert.ok(audit.some(a=>a.action==='Setup completed'&&a.detail.completion.photoId===prior));await call(`/api/files/${prior}`,admin);
  });
  await t.test('BEO revision retains history, explicitly recalculates and updates suggestions',async()=>{
    const revisionUpload=new FormData();revisionUpload.set('file',new Blob([pdfDocument([['BEO #: 00123','REVISED','Guests: 120','Room: Wilson Room'],['BEO #: 00123','Revised hot buffet menu']])],{type:'application/pdf'}),'revised-beo.pdf');revisionUpload.set('text','BEO #: 00123\nREVISED\nGuests: 120');revisionUpload.set('pages','2');revisionUpload.set('ocr','false');const imported=await call('/api/import/pdf',admin,'POST',revisionUpload);assert.equal(imported.existing.id,event.id);
    event=(await call(`/api/events/${event.id}/revision`,admin,'PUT',{...event,version:event.version,guests:120,dishes:[...event.dishes,'Pasta'],fileId:imported.fileId,recalculate:true})).event;
    assert.equal(event.revision,1);assert.equal(event.beo,'00123');assert.equal(event.equipment.find(i=>i.name==='Dinner plates').required,120);assert.equal(event.equipment.find(i=>i.name==='Dinner plates').ready,100);assert.equal(event.completion,null);
    const state=await call('/api/state',admin);assert.ok(state.audit.some(a=>a.action==='BEO revision applied'&&a.detail.before.guests===100&&a.detail.after.guests===120));
    assert.equal((await call(`/api/events/${event.id}/suggestions`,admin)).suggestions.length,3);
    await call(`/api/events/${event.id}/revision`,alice,'PUT',event,403);
    const notifs=(await call('/api/state',alice)).notifications;const rev=notifs.find(n=>n.message.includes('revised'));assert.ok(rev);await call('/api/notifications/read',alice,'POST',{id:rev.id});assert.equal((await call('/api/state',alice)).notifications.find(n=>n.id===rev.id).read,1);
  });
  await t.test('deactivated accounts lose access',async()=>{
    await call(`/api/users/${bob.id}`,admin,'PATCH',{active:false});await call('/api/state',bob,'GET',null,401);
    await call('/api/login',bob,'POST',{email:'bob@example.test',password:'test-steward-password'},401);
  });
});
