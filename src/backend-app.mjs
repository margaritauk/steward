// Persistent SQLite Durable Object backend. Generated from the reviewed standalone app.
import { randomBytes, randomUUID, pbkdf2Sync, timingSafeEqual, createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { calculateEquipment, extractBEO, isReady, normalizeType, publicUser, setupDeadline, suggestAssignments } from './domain.mjs';
export function createApi(db, context, env) {
db.exec(`
 CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL, active INTEGER NOT NULL, hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, beo TEXT NOT NULL UNIQUE, version INTEGER NOT NULL, body TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS rules (id TEXT PRIMARY KEY, body TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, owner TEXT NOT NULL, event_id TEXT, created TEXT NOT NULL, size INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS file_chunks (file_id TEXT NOT NULL, part INTEGER NOT NULL, body BLOB NOT NULL, PRIMARY KEY(file_id,part));
 CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, event_id TEXT, actor TEXT NOT NULL, actor_name TEXT NOT NULL, time TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, event_id TEXT NOT NULL, time TEXT NOT NULL, message TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
const streams = new Set();
const attempts = new Map();

const now = () => new Date().toISOString();
const rows = () => db.prepare('SELECT body FROM events').all().map(r => JSON.parse(r.body));
const rules = () => db.prepare('SELECT body FROM rules').all().map(r => JSON.parse(r.body));
const users = () => db.prepare('SELECT * FROM users ORDER BY name').all();
const settings = () => Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r=>[r.key,r.value]));
if (!db.prepare('SELECT key FROM settings WHERE key=?').get('timezone')) db.prepare('INSERT INTO settings VALUES (?,?)').run('timezone','America/Chicago');
if (!db.prepare('SELECT key FROM settings WHERE key=?').get('rules_initialized')) {
  for (const rule of [
    {name:'Chafers', eventType:'buffet', basis:'dishes', quantity:1, per:1, unit:'each', note:'Starting assumption: 1 per hot dish. Supervisor must confirm.'},
    {name:'Dinner plates', eventType:'buffet', basis:'guests', quantity:1, per:1, unit:'each', note:'Example rule; confirm your venue requirements.'},
    {name:'Serving utensils', eventType:'buffet', basis:'dishes', quantity:1, per:1, unit:'each', note:'Example rule; confirm your venue requirements.'}
  ]) { rule.id=randomUUID(); db.prepare('INSERT INTO rules VALUES (?,?)').run(rule.id, JSON.stringify(rule)); }
  db.prepare('INSERT INTO settings VALUES (?,?)').run('rules_initialized','1');
}
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
function assert(ok, message, status=400) { if (!ok) throw new ApiError(status,message); }
function transaction(fn) { return context.storage.transactionSync(fn); }
function log(user, eventId, action, detail={}) { db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?,?)').run(randomUUID(),eventId || null,user.id,user.name,now(),action,JSON.stringify(detail)); }
function refresh() { for (const response of streams) { try { response.write('event: refresh\ndata: {}\n\n'); } catch { streams.delete(response); } } }
function notify(event, message) { for (const id of event.assignees) db.prepare('INSERT INTO notifications (id,user_id,event_id,time,message) VALUES (?,?,?,?,?)').run(randomUUID(),id,event.id,now(),message); }
function eventById(id) { const row=db.prepare('SELECT body FROM events WHERE id=?').get(id); assert(row,'Event not found.',404); return JSON.parse(row.body); }
function canSee(user,event) { return user.role === 'supervisor' || event.assignees.includes(user.id); }
function writeEvent(event) { db.prepare('UPDATE events SET beo=?,version=?,body=? WHERE id=?').run(event.beo,event.version,JSON.stringify(event),event.id); }
function checkVersion(event, body) { assert(Number(body.version) === event.version,'This event changed on another phone. Refresh and review the latest version before saving.',409); }
function passwordHash(password) { const salt=randomBytes(16).toString('hex'); return `${salt}:${pbkdf2Sync(password,salt,600000,64,'sha256').toString('hex')}`; }
function validPassword(password) { assert(typeof password === 'string' && password.length >= 12 && password.length <= 128,'Use a password of 12–128 characters.'); }
function verify(password, hash) { const [salt,key]=hash.split(':'); const actual=pbkdf2Sync(password,salt,600000,64,'sha256'); return timingSafeEqual(actual,Buffer.from(key,'hex')); }
function validateUser(body) {
  assert(typeof body.name === 'string' && body.name.trim().length >= 2 && body.name.length <= 100,'Enter a name.');
  assert(typeof body.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) && body.email.length <= 200,'Enter a valid email.');
  assert(['steward','supervisor'].includes(body.role),'Choose a valid role.');
}
function getIdentity(req) {
  const token=req.headers.cookie?.match(/(?:^|;\s*)banquet_session=([a-f0-9]+)/)?.[1];
  if (!token) return null;
  const session=db.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').get(createHash('sha256').update(token).digest('hex'),Date.now());
  if (!session) return null;
  const user=db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(session.user_id);
  return user ? {user,session} : null;
}
function supervisor(user) { assert(user.role === 'supervisor','Supervisor access is required.',403); }
async function requestBody(req, max=1024*1024) {
  assert(!req.headers['content-length'] || Number(req.headers['content-length'])<=max,'File is too large.',413);
  const chunks=[]; let size=0;
  for await(const chunk of req) { size+=chunk.length; assert(size<=max,'File is too large.',413); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function jsonBody(req) { assert(req.headers['content-type']?.includes('application/json'),'Send JSON.',415); try{return JSON.parse((await requestBody(req)).toString());}catch(e){if(e instanceof ApiError)throw e;throw new ApiError(400,'Invalid JSON.');} }
async function formBody(req,max) { const bytes=await requestBody(req,max); try{return await new Request('http://localhost/',{method:'POST',headers:{'content-type':req.headers['content-type']||''},body:bytes}).formData();}catch{throw new ApiError(400,'Invalid file upload.');} }
function send(res,status,body,headers={}) { res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers}); res.end(JSON.stringify(body)); }
function authCookie(req, token, age) { const secure=!!req.socket.encrypted || false; return `banquet_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure ? '; Secure' : ''}`; }
function issueSession(req,res,user) { const token=randomBytes(32).toString('hex'); const csrf=randomBytes(24).toString('hex'); db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),user.id,csrf,Date.now()+12*3600000); send(res,200,{user:publicUser(user),csrf},{'Set-Cookie':authCookie(req,token,12*3600)}); }
function validateEvent(body) {
  for (const key of ['beo','name','room','type']) assert(typeof body[key] === 'string' && body[key].trim().length>0 && body[key].length<=180,`Enter a valid ${key === 'beo' ? 'BEO number' : key}.`);
  assert(Number.isInteger(body.guests) && body.guests>0 && body.guests<=100000,'Enter a guest count between 1 and 100,000.');
  assert(typeof body.start === 'string' && /^\d{4}-\d\d-\d\dT/.test(body.start) && Number.isFinite(Date.parse(body.start)),'Enter a valid event date and start time.');
  assert(Array.isArray(body.dishes) && body.dishes.length<=200 && body.dishes.every(d=>typeof d==='string' && d.trim().length && d.length<=150),'Enter valid hot buffet dish names.');
  if(normalizeType(body.type).includes('buffet')) assert(body.dishes.length>0,'List the hot buffet dishes so chafer quantities can be calculated.');
  const all=users(); assert(Array.isArray(body.assignees) && body.assignees.every(id=>all.some(u=>u.id===id && u.active)),'Select active team members.');
  if(body.zone!==undefined) assert(typeof body.zone==='string' && body.zone.length<=120,'Location zone is too long.');
}
function validateEquipment(list) {
  assert(Array.isArray(list) && list.length>0 && list.length<=200,'Add at least one equipment requirement.');
  for(const item of list) {
    assert(typeof item.name==='string' && item.name.trim() && item.name.length<=120,'Each equipment item needs a name.');
    assert(Number.isInteger(item.required) && item.required>0 && item.required<=100000,'Equipment quantities must be positive whole numbers.');
    assert(!item.unit || (typeof item.unit==='string' && item.unit.length<=30),'Equipment unit is too long.');
  }
}
function validateRule(rule) {
  assert(typeof rule.name==='string' && rule.name.trim().length && rule.name.length<=120,'Equipment name is required.');
  assert(typeof rule.eventType==='string' && rule.eventType.trim().length && rule.eventType.length<=100,'Event type is required.');
  assert(['fixed','guests','dishes'].includes(rule.basis),'Rule basis must be fixed, guests or dishes.');
  assert(Number.isInteger(rule.quantity) && rule.quantity>0 && rule.quantity<=10000,'Rule quantity must be a positive whole number.');
  assert(Number.isInteger(rule.per) && rule.per>0 && rule.per<=100000,'Guests per unit must be a positive whole number.');
  assert(!rule.note || (typeof rule.note==='string' && rule.note.length<=500),'Rule note is too long.');
  assert(typeof rule.unit==='string' && rule.unit.length<=30,'Enter a valid unit.');
}
function uploadFile(bytes,name,type,user,eventId=null) {
  const used=db.prepare('SELECT COALESCE(SUM(size),0) AS bytes FROM files').get().bytes;
  assert(used+bytes.length<=Number(env.MAX_STORAGE_BYTES||419430400),'The pilot storage limit has been reached. Ask your supervisor to export/archive records before adding files.',507);
  const id=randomUUID();
  db.prepare('INSERT INTO files VALUES (?,?,?,?,?,?,?)').run(id,name,type,user.id,eventId,now(),bytes.length);
  for(let offset=0,part=0;offset<bytes.length;offset+=512000,part++)db.prepare('INSERT INTO file_chunks VALUES (?,?,?)').run(id,part,bytes.subarray(offset,offset+512000));
  return id;
}
function removeFile(id) { transaction(()=>{db.prepare('DELETE FROM file_chunks WHERE file_id=?').run(id);db.prepare('DELETE FROM files WHERE id=?').run(id);}); }
function fileBytes(id) {return Buffer.concat(db.prepare('SELECT body FROM file_chunks WHERE file_id=? ORDER BY part').all(id).map(row=>Buffer.from(row.body)));}
function imageType(bytes) {
  if(bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg';
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if(bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP') return 'image/webp';
  throw new ApiError(400,'Use a JPEG, PNG or WebP photo.');
}
function readPDF(form) {
  const text=String(form.get('text')||''), pages=Number(form.get('pages'));
  assert(Number.isInteger(pages)&&pages>0&&pages<=40,'BEO PDFs must contain 1–40 pages.');
  assert(text.length>0&&text.length<=2000000,'Read every PDF page in the browser before submitting.');
  return {text,pages,ocr:form.get('ocr')==='true'};
}
let lastCleanup=0;
function cleanup(){if(Date.now()-lastCleanup<3600000)return;lastCleanup=Date.now();db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());for(const file of db.prepare('SELECT id FROM files WHERE event_id IS NULL AND created<?').all(new Date(Date.now()-86400000).toISOString()))removeFile(file.id);for(const [key,value]of attempts)if(value.until<Date.now())attempts.delete(key);}
async function api(req,res,url) {
  cleanup(); const path=url.pathname, method=req.method;
  const identity=getIdentity(req);
  if(method!=='GET') {
    if(req.headers.origin) assert(new URL(req.headers.origin).host===req.headers.host,'Cross-origin requests are not allowed.',403);
    assert(req.headers['sec-fetch-site']!=='cross-site','Cross-origin requests are not allowed.',403);
  }
  if(path==='/api/session' && method==='GET') return send(res,200,{user:identity?publicUser(identity.user):null,csrf:identity?.session.csrf||null,setupRequired:!users().length,timezone:settings().timezone});
  if(path==='/api/setup' && method==='POST') {
    assert(!users().length,'An administrator already exists.',409);
    const body=await jsonBody(req);
    const isLocal=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const token=env.BOOTSTRAP_TOKEN;
    assert(token && typeof body.token==='string' && body.token.length===token.length && timingSafeEqual(Buffer.from(body.token),Buffer.from(token)),'Initial setup requires the server bootstrap token.',403);
    body.role='supervisor'; validateUser(body); validPassword(body.password);
    const user={id:randomUUID(),name:body.name.trim(),email:body.email.trim().toLowerCase(),role:'supervisor',active:1,hash:passwordHash(body.password)};
    transaction(()=>{assert(!users().length,'An administrator already exists.',409);db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(user.id,user.name,user.email,user.role,1,user.hash);log(user,null,'Administrator account created');});
    return issueSession(req,res,user);
  }
  if(path==='/api/login' && method==='POST') {
    const body=await jsonBody(req);
    const key=req.socket.remoteAddress; const limit=attempts.get(key)||{count:0,until:Date.now()+15*60000};
    if(limit.until<Date.now()) {limit.count=0;limit.until=Date.now()+15*60000;}
    assert(limit.count<20,'Too many sign-in attempts. Try again in 15 minutes.',429);
    assert(typeof body.email==='string' && typeof body.password==='string' && body.password.length<=128,'Email or password is incorrect.',401);
    limit.count++;attempts.set(key,limit);
    const user=db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(body.email.toLowerCase().trim());
    const dummy='00000000000000000000000000000000:'+Buffer.alloc(64).toString('hex');
    assert(verify(body.password,user?.hash||dummy)&&user,'Email or password is incorrect.',401);
    attempts.delete(key); return issueSession(req,res,user);
  }
  assert(identity,'Sign in to continue.',401);
  const {user,session}=identity;
  if(method!=='GET') assert(req.headers['x-csrf-token']===session.csrf,'Session verification failed. Sign in again.',403);
  if(path==='/api/logout' && method==='POST') {db.prepare('DELETE FROM sessions WHERE token=?').run(session.token);return send(res,200,{ok:true},{'Set-Cookie':authCookie(req,'',0)});}
  if(path==='/api/stream' && method==='GET') {
    res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'}); res.write('event: connected\ndata: {}\n\n');streams.add(res);
    const interval=setInterval(()=>{if(!getIdentity(req)){res.end();return;}res.write(': heartbeat\n\n');},20000);
    res.on('close',()=>{clearInterval(interval);streams.delete(res);}); return;
  }
  if(path==='/api/state' && method==='GET') {
    const allEvents=rows();const visible=allEvents.filter(e=>canSee(user,e)).map(e=>({...e,deadline:setupDeadline(e)}));
    const team=user.role==='supervisor'?users().map(publicUser):users().filter(u=>u.id===user.id||visible.some(e=>e.assignees.includes(u.id))).map(publicUser);
    const audit=user.role==='supervisor'?db.prepare('SELECT * FROM audit ORDER BY time DESC LIMIT 500').all().map(a=>({...a,detail:JSON.parse(a.detail)})):[];
    return send(res,200,{events:visible,users:team,rules:user.role==='supervisor'?rules():[],notifications:db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY time DESC LIMIT 100').all(user.id),audit,settings:settings(),user:publicUser(user)});
  }
  if(path==='/api/notifications/read' && method==='POST') {const body=await jsonBody(req);db.prepare('UPDATE notifications SET read=1 WHERE user_id=? AND id=?').run(user.id,body.id);return send(res,200,{ok:true});}
  if(path==='/api/users' && method==='POST') {
    supervisor(user); const body=await jsonBody(req);validateUser(body);validPassword(body.password);
    assert(!db.prepare('SELECT id FROM users WHERE email=?').get(body.email.toLowerCase().trim()),'An account with that email already exists.',409);
    const record={id:randomUUID(),name:body.name.trim(),email:body.email.toLowerCase().trim(),role:body.role,active:1};
    transaction(()=>{db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(record.id,record.name,record.email,record.role,1,passwordHash(body.password));log(user,null,'Team member created',{user:publicUser(record)});});refresh();return send(res,201,{user:publicUser(record)});
  }
  if(/^\/api\/users\/[^/]+$/.test(path) && method==='PATCH') {
    supervisor(user); const id=path.split('/').at(-1),body=await jsonBody(req);const record=db.prepare('SELECT * FROM users WHERE id=?').get(id);assert(record,'User not found.',404);
    assert(id!==user.id,'Use another supervisor account to change your role or deactivate your account.');
    const updated={...record,name:body.name??record.name,email:record.email,role:body.role??record.role,active:body.active===undefined?record.active:body.active?1:0};validateUser(updated);
    if(body.password) validPassword(body.password);
    transaction(()=>{db.prepare('UPDATE users SET name=?,role=?,active=?,hash=? WHERE id=?').run(updated.name,updated.role,updated.active,body.password?passwordHash(body.password):record.hash,id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);log(user,null,'Team account updated',{before:publicUser(record),after:publicUser(updated),passwordReset:!!body.password});});refresh();return send(res,200,{user:publicUser(updated)});
  }
  if(path==='/api/settings' && method==='PUT') {supervisor(user);const body=await jsonBody(req);try{new Intl.DateTimeFormat('en',{timeZone:body.timezone}).format();}catch{throw new ApiError(400,'Enter a valid timezone, such as America/Chicago.');}transaction(()=>{db.prepare('UPDATE settings SET value=? WHERE key=?').run(body.timezone,'timezone');log(user,null,'Venue timezone changed',{timezone:body.timezone});});refresh();return send(res,200,{ok:true});}
  if(path==='/api/rules' && method==='PUT') {
    supervisor(user);const body=await jsonBody(req);assert(Array.isArray(body.rules)&&body.rules.length<=200,'Import at most 200 equipment rules.');const next=body.rules.map(r=>{validateRule(r);return {id:typeof r.id==='string'?r.id:randomUUID(),name:r.name.trim(),eventType:r.eventType.trim(),basis:r.basis,quantity:r.quantity,per:r.per,unit:r.unit,note:r.note||''};});assert(new Set(next.map(r=>r.id)).size===next.length,'Rule IDs must be unique.');
    transaction(()=>{const before=rules();db.prepare('DELETE FROM rules').run();for(const r of next)db.prepare('INSERT INTO rules VALUES (?,?)').run(r.id,JSON.stringify(r));log(user,null,'Equipment rules updated',{before,after:next});});refresh();return send(res,200,{rules:next});
  }
  if(path==='/api/import/pdf' && method==='POST') {
    supervisor(user);const form=await formBody(req,13*1024*1024);const file=form.get('file');assert(file && typeof file.arrayBuffer==='function','Choose a PDF.');const bytes=Buffer.from(await file.arrayBuffer());assert(bytes.length<=10*1024*1024 && bytes.subarray(0,5).toString()==='%PDF-','Choose a valid PDF up to 10 MB.');
    const id=transaction(()=>uploadFile(bytes,String(file.name).slice(0,200),'application/pdf',user));
    try {const extracted=readPDF(form);const fields=extractBEO(extracted.text);return send(res,200,{fileId:id,...extracted,fields,existing:fields.beo?rows().find(e=>e.beo===fields.beo)||null:null});}catch(e){removeFile(id);if(e instanceof ApiError)throw e;if(e.code==='ENOENT')throw new ApiError(503,'PDF processing is not installed on this server. Enter the event manually.');throw new ApiError(422,'This PDF could not be read. Try a clearer or unlocked PDF, or enter the event manually.');}
  }
  if(path==='/api/events' && method==='POST') {
    supervisor(user);const body=await jsonBody(req);validateEvent(body);assert(!rows().some(e=>e.beo===body.beo.trim()),'This BEO already exists. Open it and import as a revision.',409);
    const event={id:randomUUID(),beo:body.beo.trim(),name:body.name.trim(),room:body.room.trim(),zone:body.zone||'',type:body.type.trim(),guests:body.guests,start:new Date(body.start).toISOString(),dishes:body.dishes.map(x=>x.trim()),assignees:[...new Set(body.assignees)],version:1,revision:body.revision?1:0,completion:null,sourceFile:body.fileId||null,notes:typeof body.notes==='string'?body.notes.slice(0,2000):'',createdAt:now()};
    event.equipment=calculateEquipment(rules(),event);assert(event.equipment.length>0,'No equipment rules match this event type. Add a rule first or choose a matching type.');
    if(event.sourceFile){const file=db.prepare('SELECT * FROM files WHERE id=? AND type=?').get(event.sourceFile,'application/pdf');assert(file && file.owner===user.id && !file.event_id,'Source PDF is unavailable.');}
    transaction(()=>{db.prepare('INSERT INTO events VALUES (?,?,?,?)').run(event.id,event.beo,event.version,JSON.stringify(event));if(event.sourceFile)db.prepare('UPDATE files SET event_id=? WHERE id=?').run(event.id,event.sourceFile);log(user,event.id,'Event created',{event});notify(event,`Assigned to BEO ${event.beo} · ${event.room}.`);});refresh();return send(res,201,{event});
  }
  const match=path.match(/^\/api\/events\/([^/]+)(?:\/(checklist|complete|suggestions|revision|equipment))?$/);
  if(match) {
    const [,id,action]=match;let event=eventById(id);assert(canSee(user,event),'This event is not assigned to you.',403);
    if(method==='GET' && action==='suggestions'){supervisor(user);return send(res,200,{suggestions:suggestAssignments(event,users(),rows(),settings().timezone)});}
    if(method==='GET' && !action)return send(res,200,{event});
    if(method==='POST' && action==='complete') {
      const form=await formBody(req,13*1024*1024);checkVersion(event,{version:form.get('version')});assert(!event.completion,'This setup is already complete.',409);assert(isReady(event),'Complete every equipment requirement before finishing.');const file=form.get('photo');assert(file && typeof file.arrayBuffer==='function','A completion photo is required.');const bytes=Buffer.from(await file.arrayBuffer());assert(bytes.length>0 && bytes.length<=12*1024*1024,'Choose a photo up to 12 MB.');const type=imageType(bytes);
      let photoId;
      try {transaction(()=>{event=eventById(id);checkVersion(event,{version:form.get('version')});assert(canSee(user,event),'Assignment changed. Refresh your events.',403);assert(isReady(event)&&!event.completion,'Review the updated checklist before completing.',409);photoId=uploadFile(bytes,'setup-photo',type,user,event.id);event.version++;event.completion={userId:user.id,userName:user.name,time:now(),photoId,revision:event.revision};writeEvent(event);log(user,event.id,'Setup completed',{completion:event.completion,beo:event.beo,equipment:event.equipment});});}catch(e){if(photoId){removeFile(photoId);}throw e;}refresh();return send(res,200,{event});
    }
    if(method==='PATCH' && action==='checklist') {
      const body=await jsonBody(req);event=eventById(id);checkVersion(event,body);assert(!event.completion,'This setup is complete. A supervisor must reopen it before changes.',409);const item=event.equipment.find(i=>i.id===body.itemId);assert(item,'Equipment item not found.',404);assert(Number.isInteger(body.ready) && body.ready>=0 && body.ready<=item.required,'Ready quantity must be between zero and the required quantity.');
      transaction(()=>{const before=item.ready;item.ready=body.ready;item.updatedBy={id:user.id,name:user.name,time:now()};event.version++;writeEvent(event);log(user,event.id,'Equipment progress updated',{item:item.name,before,after:item.ready,required:item.required});});refresh();return send(res,200,{event});
    }
    if(method==='PUT' && action==='equipment') {
      supervisor(user);const body=await jsonBody(req);event=eventById(id);checkVersion(event,body);validateEquipment(body.equipment);const before=event.equipment;
      const next=body.equipment.map(item=>{const old=before.find(i=>i.id===item.id);return {id:old?.id||randomUUID(),ruleId:old?.ruleId||null,name:item.name.trim(),unit:item.unit||'each',required:item.required,ready:Math.min(old?.ready||0,item.required),updatedBy:old?.updatedBy||null,basis:old?.basis||'manual'};});assert(new Set(next.map(i=>i.id)).size===next.length,'Equipment items must be unique.');
      const changes=next.filter(i=>{const old=before.find(o=>o.id===i.id);return !old || old.required!==i.required || old.name!==i.name;}).map(i=>{const old=before.find(o=>o.id===i.id);return `${i.name}: ${old?.required||0} → ${i.required}`;});
      for(const removed of before.filter(i=>!next.some(n=>n.id===i.id)))changes.push(`${removed.name}: removed`);
      transaction(()=>{event.equipment=next;event.version++;event.completion=null;writeEvent(event);log(user,event.id,'Equipment requirements changed',{before,after:next,reason:typeof body.reason==='string'?body.reason.slice(0,1000):''});notify(event,`Equipment changed on BEO ${event.beo}. ${changes.slice(0,8).join('; ') || 'Requirements reviewed'}. Review your updated checklist.`);});refresh();return send(res,200,{event});
    }
    if(method==='PUT' && (!action || action==='revision')) {
      supervisor(user);const body=await jsonBody(req);event=eventById(id);checkVersion(event,body);validateEvent(body);assert(body.beo.trim()===event.beo,'A revision must keep the same BEO number.');
      const before=structuredClone(event);const newFile=body.fileId||null;
      if(newFile){const f=db.prepare('SELECT * FROM files WHERE id=? AND type=?').get(newFile,'application/pdf');assert(f && f.owner===user.id && (!f.event_id||f.event_id===event.id),'Source PDF is unavailable.');}
      const updated={...event,name:body.name.trim(),room:body.room.trim(),zone:body.zone||'',type:body.type.trim(),guests:body.guests,start:new Date(body.start).toISOString(),dishes:body.dishes.map(d=>d.trim()),assignees:[...new Set(body.assignees)],notes:typeof body.notes==='string'?body.notes.slice(0,2000):event.notes,sourceFile:newFile||event.sourceFile};
      const affectsSetup=['name','room','type','guests','start','dishes','notes'].some(k=>JSON.stringify(before[k])!==JSON.stringify(updated[k]));
      if(body.recalculate) {updated.equipment=calculateEquipment(rules(),updated,event.equipment);assert(updated.equipment.length>0,'No rules match. Add rules before recalculating.');}
      updated.version++;if(action==='revision')updated.revision++;if(affectsSetup||body.recalculate||body.reopen)updated.completion=null;
      const changes=[];if(before.guests!==updated.guests)changes.push(`Guests: ${before.guests} → ${updated.guests}`);if(before.room!==updated.room)changes.push(`Room: ${before.room} → ${updated.room}`);if(before.start!==updated.start)changes.push('Event time changed');if(JSON.stringify(before.dishes)!==JSON.stringify(updated.dishes))changes.push('Hot buffet dishes changed');if(body.recalculate)changes.push('Equipment recalculated');if(JSON.stringify(before.assignees)!==JSON.stringify(updated.assignees))changes.push('Team assignment changed');
      transaction(()=>{writeEvent(updated);if(newFile)db.prepare('UPDATE files SET event_id=? WHERE id=?').run(updated.id,newFile);log(user,event.id,action==='revision'?'BEO revision applied':'Event updated',{before,after:updated});notify(updated,`BEO ${updated.beo} ${action==='revision'?'revised':'updated'}. ${changes.join('; ')}${changes.length?'. ':''}Review the latest details${updated.completion?'': ' and checklist'}.`);for(const removed of before.assignees.filter(id=>!updated.assignees.includes(id)))db.prepare('INSERT INTO notifications (id,user_id,event_id,time,message) VALUES (?,?,?,?,?)').run(randomUUID(),removed,event.id,now(),`Your assignment to BEO ${event.beo} was removed by ${user.name}.`);});refresh();return send(res,200,{event:updated});
    }
  }
  if(/^\/api\/files\/[^/]+$/.test(path) && method==='GET') {
    const file=db.prepare('SELECT * FROM files WHERE id=?').get(path.split('/').at(-1));assert(file,'File not found.',404);assert(file.event_id?canSee(user,eventById(file.event_id)):user.role==='supervisor'&&file.owner===user.id,'File access denied.',403);
    const content=fileBytes(file.id);res.writeHead(200,{'Content-Type':file.type,'Content-Disposition':`inline; filename="${file.type==='application/pdf'?'beo.pdf':'setup-photo'}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(content);return;
  }
  throw new ApiError(404,'Endpoint not found.');
}

return api;
}
