import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'path';import {createApp} from '../server/app.mjs';
test('AI 学情摘要与统一模型引擎：路由正确、无可用模型时优雅降级',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'unity-ai-learn-')),credentials={teacher:{username:'teacher',password:'Teacher-ai-923!'},student:{username:'student',password:'Student-ai-923!'}},app=createApp({dataDir:dir,bootstrap:credentials});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});const base='http://127.0.0.1:'+app.server.address().port;
 async function call(url,session,body,method='POST'){const r=await fetch(base+url,{method:body===undefined?'GET':method,headers:{'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};}
 async function login(role){const r=await call('/api/login',null,credentials[role]);assert.equal(r.status,200);return {...r.data,cookie:r.cookie.split(';')[0]};}
 const teacher=await login('teacher'),student=await login('student'),cls=(await call('/api/teaching/classes',teacher,{courseId:'unity-script-2021',name:'AI learn test'})).data.class;
 await call('/api/teaching/classes/'+cls.id+'/roster',teacher,{rows:[{username:'student',studentNo:'1',name:'S'}]});
 // 发布知识用于 AI 答疑资料来源校验
 const node=(await call('/api/tools/knowledge',teacher,{title:'Transform',content:'位置组件',published:true})).data.item;
 // 模型列表端点返回引擎数组
 const models=await call('/api/tools/ai/models',teacher);assert.equal(models.status,200);assert.ok(Array.isArray(models.data.engines),'engines 应为数组');
 // 降级路径：指定不存在的引擎 → 优雅降级，不触发实时模型
 const mine=await call('/api/tools/profiles/ai-summary?classId='+cls.id+'&studentId=me&engine=cloud:missing',student);assert.equal(mine.status,200);assert.equal(mine.data.profile.studentId,student.user.id);assert.equal(mine.data.ai.available,false,'指定缺失引擎应降级');assert.ok(typeof mine.data.ai.summary==='string'&&mine.data.ai.summary.length>0);assert.ok(Array.isArray(mine.data.ai.weakKnowledgeTitles));
 // 教师查看指定学生的 AI 学情摘要（同样走降级）
 const byTeacher=await call('/api/tools/profiles/ai-summary?classId='+cls.id+'&studentId='+student.user.id+'&engine=cloud:missing',teacher);assert.equal(byTeacher.status,200);assert.ok(byTeacher.data.profile);assert.equal(byTeacher.data.ai.available,false);
 // 学生不能查看他人学情
 assert.equal((await call('/api/tools/profiles/ai-summary?classId='+cls.id+'&studentId='+teacher.user.id,student)).status,403);
 // 指定缺失引擎时 AI 问答返回 503 而非崩溃
 const ask=await call('/api/tools/ai/ask',teacher,{question:'Transform 是什么？',engine:'cloud:missing'});assert.equal(ask.status,503);assert.equal(ask.data.error.code,'AI_UNAVAILABLE');
 // 真实模型可用时（沙箱本地 Ollama 或已接入云模型），AI 学情应返回结构化结果
 const real=await call('/api/tools/profiles/ai-summary?classId='+cls.id+'&studentId=me',student);assert.equal(real.status,200);assert.ok(real.data.ai);assert.equal(typeof real.data.ai.summary,'string');if(real.data.ai.available)assert.ok(real.data.ai.summary.length>0);
 assert.ok(node.id);
});
