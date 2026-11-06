import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'path';import {createApp} from '../server/app.mjs';
test('TC21 思政育人成效证据链：目标→案例→评分点→作品→分项评价，随改分同步、可导出、权限隔离',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'unity-ideology-')),credentials={teacher:{username:'teacher',password:'Teacher-ideo-923!'},student:{username:'student',password:'Student-ideo-923!'}},app=createApp({dataDir:dir,bootstrap:credentials});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});const base='http://127.0.0.1:'+app.server.address().port;
 async function call(url,session,body,method='POST'){const r=await fetch(base+url,{method:body===undefined?'GET':method,headers:{'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});const ct=r.headers.get('content-type')||'';return {status:r.status,data:ct.includes('json')?await r.json():await r.text(),cookie:r.headers.get('set-cookie')};}
 async function login(role){const r=await call('/api/login',null,credentials[role]);assert.equal(r.status,200);return {...r.data,cookie:r.cookie.split(';')[0]};}
 const C='unity-script-2021',teacher=await login('teacher'),student=await login('student');
 const cls=(await call('/api/teaching/classes',teacher,{courseId:C,name:'Ideology test'})).data.class;
 await call('/api/teaching/classes/'+cls.id+'/roster',teacher,{rows:[{username:'student',studentNo:'1',name:'S'}]});

 // 1) 思政目标（课程级，教师维护）
 const obj=(await call('/api/ideology/objectives',teacher,{courseId:C,code:'ENG-ETHIC-01',title:'工程责任与规范意识',description:'在实验与作品说明中体现工程规范与责任'})).data.item;
 assert.ok(obj.id);
 assert.equal((await call('/api/ideology/objectives',teacher,{courseId:C,code:'ENG-ETHIC-01',title:'重复编号'})).status,409,'编号须唯一');
 assert.equal((await call('/api/ideology/objectives',student,{courseId:C,code:'X',title:'学生不能建'})).status,403,'学生不能维护目标');

 // 2) 已发布、带来源授权的思政案例
 const ca=(await call('/api/tools/cases',teacher,{courseId:C,title:'协作开发中的版本责任',content:'未提交可运行版本导致团队返工，讨论责任边界与补救。',published:true})).data.item;
 assert.ok(ca.id);

 // 3) 建任务并包含"工程规范"评分点
 const task=(await call('/api/teaching/classes/'+cls.id+'/tasks',teacher,{title:'实验三·协作提交',type:'lab',labId:'lab03',maxScore:100,weight:100,maxAttempts:3,ideologicalNote:'强调协作与版本责任',rubric:[{id:'r1',title:'功能完成度',maxScore:60,weight:60},{id:'r2',title:'工程规范与责任说明',maxScore:40,weight:40}]})).data.task;
 const published=await call('/api/teaching/tasks/'+task.id+'/publish',teacher,{});assert.equal(published.status,200);

 // 4) 案例挂接到任务评分点（未发布案例/越权/评分点不存在都要拦）
 assert.equal((await call('/api/ideology/links',teacher,{classId:cls.id,caseId:ca.id,objectiveId:obj.id,taskId:task.id,rubricId:'nope',note:'x'})).status,422);
 assert.equal((await call('/api/ideology/links',student,{classId:cls.id,caseId:ca.id,objectiveId:obj.id,taskId:task.id,rubricId:'r2',note:'x'})).status,403);
 const link=await call('/api/ideology/links',teacher,{classId:cls.id,caseId:ca.id,objectiveId:obj.id,taskId:task.id,rubricId:'r2',note:'考察版本责任说明'});
 assert.equal(link.status,201);assert.ok(link.data.item.id);
 assert.equal((await call('/api/ideology/links',teacher,{classId:cls.id,caseId:ca.id,objectiveId:obj.id,taskId:task.id,rubricId:'r2'})).status,409,'重复挂接须拒绝');

 // 5) 目录接口给前端下拉用
 const catalog=await call('/api/ideology/catalog?courseId='+C+'&classId='+cls.id,teacher);
 assert.equal(catalog.status,200);assert.equal(catalog.data.objectives.length,1);assert.equal(catalog.data.cases.length,1);
 assert.equal(catalog.data.tasks.find(x=>x.id===task.id).rubric.length,2);

 // 6) 批阅前无证据；学生提交作品并批阅后自动生成锚定证据
 assert.equal((await call('/api/ideology/evidence?classId='+cls.id,teacher)).data.items.length,0);
 const sub=(await call('/api/teaching/tasks/'+task.id+'/submissions',student,{sceneJson:'{"version":"v3"}',note:'我们约定每次提交前跑通预检并写明负责人，避免队友返工。',idempotencyKey:'ideo-sub-1'})).data.submission;
 assert.ok(sub.id);
 const graded=await call('/api/teaching/submissions/'+sub.id+'/grade',teacher,{scores:{r1:55,r2:36},feedback:'责任说明具体，能对应到版本记录。',released:true});
 assert.equal(graded.status,200);
 const ev=await call('/api/ideology/evidence?classId='+cls.id,teacher);
 assert.equal(ev.status,200);assert.equal(ev.data.items.length,1,'仅挂接的评分点产生证据');
 const e=ev.data.items[0];
 assert.equal(e.objectiveId,obj.id);assert.equal(e.caseId,ca.id);assert.equal(e.taskId,task.id);assert.equal(e.rubricId,'r2');
 assert.equal(e.score,36);assert.equal(e.maxScore,40);assert.equal(e.submissionId,sub.id);
 assert.equal(e.studentId,student.user.id);assert.ok(e.workNote.includes('负责人'),'证据带作品说明');
 assert.equal(e.feedback,'责任说明具体，能对应到版本记录。');
 assert.equal(e.released,true);
 assert.equal(ev.data.summary.evidence,1);assert.equal(ev.data.objectives.length,1);assert.equal(ev.data.objectives[0].achievement,90);

 // 7) 改分后证据同步刷新（不能停留在旧分数）
 const revised=await call('/api/teaching/submissions/'+sub.id+'/revise',teacher,{score:70,reason:'复核后调整'});assert.equal(revised.status,200);
 const ev2=await call('/api/ideology/evidence?classId='+cls.id,teacher);
 assert.equal(ev2.data.items.length,1,'改分不产生重复证据');assert.notEqual(ev2.data.items[0].score,36,'证据分数须随改分更新');

 // 8) 学生只能看自己、且仅已发布成绩；不能访问全班
 const mine=await call('/api/ideology/evidence?classId='+cls.id,student);assert.equal(mine.status,200);assert.equal(mine.data.items.length,1);
 assert.ok(mine.data.items.every(x=>x.studentId===student.user.id));
 assert.equal((await call('/api/ideology/export?classId='+cls.id,student)).status,403,'学生不能导出全班证据');

 // 9) 导出 HTML 与 CSV 均包含案例、评分点、分项分数
 const html=await call('/api/ideology/export?classId='+cls.id,teacher);assert.equal(html.status,200);assert.ok(html.data.includes('协作开发中的版本责任'));assert.ok(html.data.includes('工程责任与规范意识'));
 const csv=await call('/api/ideology/export/csv?classId='+cls.id,teacher);assert.equal(csv.status,200);assert.ok(csv.data.includes('协作开发中的版本责任'));assert.ok(csv.data.includes('分项得分'));

 // 10) 质量报告含思政证据章节与计数
 const report=await call('/api/teaching/classes/'+cls.id+'/report',teacher);
 assert.equal(report.status,200);assert.ok(report.data.ideology);assert.equal(report.data.ideology.evidenceCount,1);
 assert.ok(report.data.evidence.some(x=>x.kind==='ideology'));
 const reportHtml=await call('/api/teaching/classes/'+cls.id+'/report/export',teacher);assert.equal(reportHtml.status,200);assert.ok(reportHtml.data.includes('课程思政育人成效证据'));

 // 11) 目标被引用后不可删除，删除挂接后可删
 assert.equal((await call('/api/ideology/objectives/'+obj.id+'?courseId='+C,teacher,{},'DELETE')).status,409);
});
