// 校验教学流程页能被服务端正确分发：静态文件白名单 + 角色守卫 + 新页面可访问。
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.mjs';

const dir=await mkdtemp(path.join(os.tmpdir(),'page-gate-'));
const creds={admin:{username:'admin',password:'Admin-test-923!'},teacher:{username:'teacher',password:'Teacher-test-923!'},student:{username:'student',password:'Student-test-923!'}};
const app=createApp({dataDir:dir,bootstrap:creds});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+app.server.address().port;

const call=async(url,{method='GET',body,session,redirect='manual'}={})=>{
 const headers={};if(body!==undefined)headers['Content-Type']='application/json';
 if(session){headers.Cookie=session.cookie;headers['X-CSRF-Token']=session.csrfToken;}
 const r=await fetch(base+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect});
 return {status:r.status,location:r.headers.get('location'),type:r.headers.get('content-type')};
};
const login=async(role)=>{
 const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(creds[role])});
 const data=await r.json();
 return {cookie:(r.headers.get('set-cookie')||'').split(';')[0],csrfToken:data.csrfToken};
};

const teacher=await login('teacher');
const student=await login('student');
const anon=await login('student');

// 1. 静态资源（脚本与样式）可直接访问
for(const asset of ['/teaching.mjs','/teaching-ui.mjs','/teaching-flow.css','/tasks.mjs']){
 const r=await call(asset);
 assert.equal(r.status,200,`${asset} 应当可访问，实际 ${r.status}`);
}

// 2. 未登录访问教学流程页 → 跳转登录
const anonTeaching=await call('/teaching.html');
assert.equal(anonTeaching.status,303);
assert.match(anonTeaching.location||'',/^\/login\.html/);

// 3. 学生访问教师端页面 → 拒绝
const studentTeaching=await call('/teaching.html',{session:student});
assert.equal(studentTeaching.status,303,'学生不应进入教学流程页');

// 4. 教师访问教学流程页 → 放行
const teacherTeaching=await call('/teaching.html',{session:teacher});
assert.equal(teacherTeaching.status,200,'教师应能进入教学流程页');

// 5. 学生访问学生端任务页 → 放行；教师访问 → 拒绝
assert.equal((await call('/tasks.html',{session:student})).status,200,'学生应能进入任务页');
assert.equal((await call('/tasks.html',{session:teacher})).status,303,'教师不应进入学生任务页');

// 6. 学生任务接口按账号隔离
const mine=await call('/api/teaching/student/tasks',{session:student});
assert.equal(mine.status,200);

// 7. 教师不能调用学生任务接口
const forbidden=await call('/api/teaching/student/tasks',{session:teacher});
assert.equal(forbidden.status,403,'教师不应读取学生任务接口');

await app.close();
await rm(dir,{recursive:true,force:true});
console.log('page-gate checks passed');
