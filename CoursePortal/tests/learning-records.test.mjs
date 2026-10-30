import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/app.mjs';
import {createRecordStore,accountKey,mergeStates,resetSessionToken} from '../learning-records.mjs';

// 浏览器端存储替身：模拟 localStorage，按键隔离。
function fakeStorage(){
 const map=new Map();
 return {getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>{map.set(k,String(v));},removeItem:k=>{map.delete(k);},get size(){return map.size;}};
}
function withBrowser(storage,run){
 const previous={window:globalThis.window,localStorage:globalThis.localStorage,location:globalThis.location};
 globalThis.window=globalThis.window||{};
 globalThis.localStorage=storage;
 globalThis.location=globalThis.location||{search:''};
 try{return run();}finally{
  if(previous.window===undefined)delete globalThis.window;else globalThis.window=previous.window;
  if(previous.localStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous.localStorage;
  if(previous.location===undefined)delete globalThis.location;else globalThis.location=previous.location;
 }
}

test('storage keys are separated by account',()=>{
 const a=accountKey('user-a','unity-script-2021');
 const b=accountKey('user-b','unity-script-2021');
 assert.notEqual(a,b);
 assert.match(a,/user-a/);
 assert.match(b,/user-b/);
 assert.notEqual(accountKey('user-a','course-1'),accountKey('user-a','course-2'));
 assert.notEqual(accountKey('user-a','c',false),accountKey('user-a','c',true),'预览不能与正式记录共用键');
});
test('two accounts in one browser never see each other records',()=>{
 const storage=fakeStorage();
 withBrowser(storage,()=>{
  const lessonIds=['lesson-01','lesson-02'];
  const storeA=createRecordStore({courseId:'c1',lessonIds,userId:'user-a',fetchImpl:null});
  const stateA=storeA.load();
  stateA.lessons['lesson-01']={position:120,duration:300,completed:true,notes:[{id:'n1',text:'甲的笔记',time:10,createdAt:'2026-01-01T00:00:00Z'}],videoUrl:null};
  storeA.save(stateA);
  const storeB=createRecordStore({courseId:'c1',lessonIds,userId:'user-b',fetchImpl:null});
  const stateB=storeB.load();
  assert.equal(stateB.lessons['lesson-01'],undefined,'乙不应看到甲的进度');
  assert.equal(Object.keys(stateB.lessons).length,0);
  // 重新载入甲的账号，记录仍在
  const storeA2=createRecordStore({courseId:'c1',lessonIds,userId:'user-a',fetchImpl:null});
  const reloaded=storeA2.load();
  assert.equal(reloaded.lessons['lesson-01'].completed,true);
  assert.equal(reloaded.lessons['lesson-01'].notes[0].text,'甲的笔记');
 });
});
test('legacy unscoped records are migrated with a source marker and never silently reassigned',()=>{
 const storage=fakeStorage();
 withBrowser(storage,()=>{
  const lessonIds=['lesson-01'];
  storage.setItem('CoursePortal.v1:c1',JSON.stringify({version:1,courseId:'c1',lastLessonId:'lesson-01',lessons:{'lesson-01':{position:60,duration:200,completed:true,notes:[{id:'old',text:'旧记录',time:5,createdAt:'2025-01-01T00:00:00Z'}],videoUrl:null}}}));
  const store=createRecordStore({courseId:'c1',lessonIds,userId:'user-first',fetchImpl:null});
  const state=store.load();
  assert.equal(state.lessons['lesson-01'].completed,true);
  assert.equal(state.migratedFrom,'legacy-unscoped','迁移必须带来源标记');
  // 第二个账号不应继承第一个账号迁移来的记录
  const other=createRecordStore({courseId:'c1',lessonIds,userId:'user-second',fetchImpl:null});
  const otherState=other.load();
  assert.equal(otherState.lessons['lesson-01'],undefined,'旧记录不得静默归给其他账号');
  assert.equal(otherState.migratedFrom,undefined);
 });
});
test('anonymous visitors get an isolated key that no signed-in account reads',()=>{
 const storage=fakeStorage();
 withBrowser(storage,()=>{
  const anon=createRecordStore({courseId:'c1',lessonIds:['lesson-01'],userId:null,fetchImpl:null});
  assert.match(anon.key,/anonymous/);
  const signed=createRecordStore({courseId:'c1',lessonIds:['lesson-01'],userId:'user-a',fetchImpl:null});
  assert.notEqual(anon.key,signed.key);
 });
});
test('merge keeps the fuller record set and de-duplicates notes',()=>{
 const base={version:1,courseId:'c1',lastLessonId:null,lessons:{'lesson-01':{position:10,duration:100,completed:false,notes:[{id:'n1',text:'a',time:1}],videoUrl:null}}};
 const incoming={version:1,courseId:'c1',lastLessonId:'lesson-01',lessons:{'lesson-01':{position:50,duration:100,completed:true,notes:[{id:'n1',text:'a',time:1},{id:'n2',text:'b',time:2}],videoUrl:null}}};
 const merged=mergeStates(base,incoming);
 assert.equal(merged.lessons['lesson-01'].position,50);
 assert.equal(merged.lessons['lesson-01'].completed,true);
 assert.equal(merged.lessons['lesson-01'].notes.length,2,'同一条笔记不应重复');
 assert.equal(merged.lastLessonId,'lesson-01');
});

// ===== 服务端记录同步 =====
const credentials={admin:{username:'admin',password:'Admin-test-923!'},teacher:{username:'teacher',password:'Teacher-test-923!'},student:{username:'student',password:'Student-test-923!'}};
async function fixture(t){
 const dir=await mkdtemp(path.join(os.tmpdir(),'unity-record-test-'));
 const app=createApp({dataDir:dir,bootstrap:credentials});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 const call=async(url,{method='GET',body,session,csrf=true}={})=>{const headers={};if(body!==undefined)headers['Content-Type']='application/json';if(session){headers.Cookie=session.cookie;if(csrf)headers['X-CSRF-Token']=session.csrfToken;}const r=await fetch(base+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data,cookie:r.headers.get('set-cookie')};};
 const login=async(role,extra={})=>{const r=await call('/api/login',{method:'POST',body:{...credentials[role],...extra}});assert.equal(r.status,200);return {...r.data,cookie:(r.cookie||'').split(';')[0]};};
 const makeStudent=async(username,name)=>{const a=await login('admin');await call('/api/admin/users',{method:'POST',session:a,body:{username,name,password:'Student-pass-923!',globalRole:'student'}});const r=await call('/api/login',{method:'POST',body:{username,password:'Student-pass-923!'}});return {...r.data,cookie:r.cookie.split(';')[0]};};
 return {app,call,login,makeStudent,base};
}
test('server stores learning records per account and only returns the owner records',async t=>{
 const f=await fixture(t);
 const alice=await f.makeStudent('alice_rec','记录甲');
 const bob=await f.makeStudent('bob_rec','记录乙');
 const state={version:1,courseId:'c1',lastLessonId:'lesson-01',lessons:{'lesson-01':{position:42,duration:100,completed:true,notes:[{id:'n1',text:'甲的私人笔记',time:3,createdAt:'2026-01-01T00:00:00Z'}],videoUrl:null}}};
 const saved=await f.call('/api/teaching/student/records',{method:'PUT',session:alice,body:{courseId:'c1',state}});
 assert.equal(saved.status,200);
 const mine=await f.call('/api/teaching/student/records?course=c1',{session:alice});
 assert.equal(mine.status,200);
 assert.equal(mine.data.record.state.lessons['lesson-01'].notes[0].text,'甲的私人笔记');
 const theirs=await f.call('/api/teaching/student/records?course=c1',{session:bob});
 assert.equal(theirs.data.record,null,'乙不应读到甲的私人记录');
 // 教师也不能读取学生私人记录
 const teacher=await f.login('teacher');
 assert.equal((await f.call('/api/teaching/student/records?course=c1',{session:teacher})).status,403);
});
test('record sync requires a valid student session',async t=>{
 const f=await fixture(t);
 assert.equal((await f.call('/api/teaching/student/records?course=c1')).status,401);
 assert.equal((await f.call('/api/teaching/student/records',{method:'PUT',body:{courseId:'c1',state:{}}})).status,401);
 const teacher=await f.login('teacher');
 assert.equal((await f.call('/api/teaching/student/records',{method:'PUT',session:teacher,body:{courseId:'c1',state:{}}})).status,403);
});
test('record writes require CSRF like other student writes',async t=>{
 const f=await fixture(t);
 const student=await f.login('student');
 const r=await f.call('/api/teaching/student/records',{method:'PUT',session:student,csrf:false,body:{courseId:'c1',state:{}}});
 assert.equal(r.status,403);
});

// ===== 客户端同步必须带会话校验令牌 =====
async function withBrowserAsync(storage,run){
 const previous={window:globalThis.window,localStorage:globalThis.localStorage,location:globalThis.location};
 globalThis.window=globalThis.window||{};
 globalThis.localStorage=storage;
 globalThis.location=globalThis.location||{search:''};
 try{return await run();}finally{
  if(previous.window===undefined)delete globalThis.window;else globalThis.window=previous.window;
  if(previous.localStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous.localStorage;
  if(previous.location===undefined)delete globalThis.location;else globalThis.location=previous.location;
 }
}
test('云端保存先取会话令牌再写入，不再因缺少校验头返回403',async()=>{
 const storage=fakeStorage(),calls=[];
 const fetchImpl=async(url,options={})=>{
  const method=options.method||'GET';calls.push({url,method,headers:options.headers||{}});
  if(url==='/api/session')return {ok:true,status:200,json:async()=>({user:{id:'u1'},csrfToken:'csrf-1'})};
  if(method==='PUT'&&url==='/api/teaching/student/records'){
   const token=options.headers['X-CSRF-Token'];
   return token==='csrf-1'
    ?{ok:true,status:200,json:async()=>({saved:true,updatedAt:'2026-10-30T00:00:00Z'})}
    :{ok:false,status:403,json:async()=>({error:{code:'CSRF_REJECTED',message:'会话校验失败'}})};
  }
  return {ok:false,status:404,json:async()=>({})};
 };
 await withBrowserAsync(storage,async()=>{
  resetSessionToken();
  const store=createRecordStore({courseId:'c1',lessonIds:['lesson-01'],userId:'u1',fetchImpl});
  const ok=await store.push({version:1,courseId:'c1',lastLessonId:null,lessons:{}});
  assert.equal(ok,true,'带令牌后写入应当成功');
  assert.equal(calls[0].url,'/api/session','写之前先取会话令牌');
  const put=calls.find(c=>c.method==='PUT');
  assert.equal(put.headers['X-CSRF-Token'],'csrf-1');
  assert.equal(store.syncStatus.ok,true);
  assert.equal(store.syncStatus.at,'2026-10-30T00:00:00Z');
 });
});
test('令牌过期时刷新一次并重试，失败会记录可见的错误原因',async()=>{
 const storage=fakeStorage();let sessions=0,puts=0;
 const fetchImpl=async(url,options={})=>{
  const method=options.method||'GET';
  if(url==='/api/session'){sessions++;return {ok:true,status:200,json:async()=>({user:{id:'u1'},csrfToken:'token-v'+sessions})};}
  if(method==='PUT'){
   puts++;
   const token=options.headers['X-CSRF-Token'];
   return token==='token-v2'
    ?{ok:true,status:200,json:async()=>({saved:true,updatedAt:'2026-10-30T01:00:00Z'})}
    :{ok:false,status:403,json:async()=>({error:{code:'CSRF_REJECTED',message:'会话校验失败，请刷新后重试'}})};
  }
  return {ok:false,status:404,json:async()=>({})};
 };
 await withBrowserAsync(storage,async()=>{
  resetSessionToken();
  const store=createRecordStore({courseId:'c1',lessonIds:['lesson-01'],userId:'u1',fetchImpl});
  assert.equal(await store.push({version:1,courseId:'c1',lessons:{}}),true);
  assert.equal(sessions,2,'令牌失效后应重新获取一次');
  assert.equal(puts,2,'应当只重试一次');
  assert.equal(store.syncStatus.error,null);
 });
 // 服务端持续拒绝时，错误原因要能提示给用户
 const rejecting=createRecordStore({courseId:'c1',lessonIds:['lesson-01'],userId:'u1',fetchImpl:async(url,options={})=>{
  if(url==='/api/session')return {ok:true,status:200,json:async()=>({user:{id:'u1'},csrfToken:'t'})};
  return {ok:false,status:500,json:async()=>({error:{code:'SERVER',message:'服务暂时不可用'}})};
 }});
 await withBrowserAsync(storage,async()=>{
  resetSessionToken();
  assert.equal(await rejecting.push({version:1,courseId:'c1',lessons:{}}),false);
  assert.equal(rejecting.syncStatus.ok,false);
  assert.match(rejecting.syncStatus.error,/服务暂时不可用/);
 });
});
