import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createApp} from '../server/app.mjs';
test('course tools isolate classes, hide quiz answers and grade immutable snapshots',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'unity-tools-test-')),credentials={teacher:{username:'teacher',password:'Teacher-tools-923!'},student:{username:'student',password:'Student-tools-923!'}},app=createApp({dataDir:dir,bootstrap:credentials});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});const base='http://127.0.0.1:'+app.server.address().port;
 async function call(url,session,body,method='POST'){const r=await fetch(base+url,{method:body===undefined?'GET':method,headers:{'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};}
 async function login(role){const r=await call('/api/login',null,credentials[role]);assert.equal(r.status,200);return {...r.data,cookie:r.cookie.split(';')[0]};}
 const teacher=await login('teacher'),student=await login('student'),cls=(await call('/api/teaching/classes',teacher,{courseId:'unity-script-2021',name:'Tools test'})).data.class;
 await call('/api/teaching/classes/'+cls.id+'/roster',teacher,{rows:[{username:'student',studentNo:'1',name:'S'}]});
 assert.equal((await call('/api/tools/questions',student)).status,403);
 const question=(await call('/api/tools/questions',teacher,{title:'Unity component?',type:'single',options:['Transform','HTML'],answer:[0],explanation:'Transform defines position.'})).data.item;
 const quiz=(await call('/api/tools/quizzes',teacher,{classId:cls.id,title:'Test',questionIds:[question.id]})).data.item;
 const visible=await call('/api/tools/quizzes/'+quiz.id,student);assert.equal(visible.status,200);assert.equal(visible.data.quiz.questions[0].answer,undefined);
 await call('/api/tools/questions/'+question.id,teacher,{answer:[1]},'PUT');
 const body={answers:{[question.id]:[0]},idempotencyKey:'one'};const result=await call('/api/tools/quizzes/'+quiz.id+'/attempts',student,body);assert.equal(result.status,201);assert.equal(result.data.attempt.score,100);
 assert.equal((await call('/api/tools/quizzes/'+quiz.id+'/attempts',student,body)).data.duplicate,true);
 const node=(await call('/api/tools/knowledge',teacher,{title:'Transform',content:'位置组件',published:true})).data.item;assert.equal((await call('/api/tools/knowledge',student)).data.items[0].id,node.id);
 // Resource records retain immutable history and a restore creates a new version.
 const resource=(await call('/api/tools/cases',teacher,{title:'工程责任',content:'初版案例',published:true})).data.item;
 const revisedResource=await call('/api/tools/cases/'+resource.id,teacher,{content:'修订案例'},'PUT');assert.equal(revisedResource.data.item.version,2);
 const resourceHistory=await call('/api/tools/cases/'+resource.id+'/history',teacher);assert.equal(resourceHistory.status,200);assert.equal(resourceHistory.data.items[0].snapshot.content,'初版案例');
 const restoredResource=await call('/api/tools/cases/'+resource.id+'/restore',teacher,{version:1});assert.equal(restoredResource.status,200);assert.equal(restoredResource.data.item.content,'初版案例');assert.equal(restoredResource.data.item.version,3);
 // Profiles are deterministic and reminders are calculated at read time.
 const overdueTask=(await call('/api/teaching/classes/'+cls.id+'/tasks',teacher,{title:'逾期练习',type:'work',maxScore:100,weight:100,dueAt:'2020-01-01T00:00:00.000Z',allowLate:false,maxAttempts:1,rubric:[{id:'r1',title:'完成度',maxScore:100,weight:100}]})).data.task;
 await call('/api/teaching/tasks/'+overdueTask.id+'/publish',teacher,{});
 const profile=await call('/api/tools/profiles?classId='+cls.id,teacher);assert.equal(profile.status,200);assert.equal(profile.data.items[0].band,'intervene');assert.ok(profile.data.items[0].recommendations.length>0);
 const mine=await call('/api/tools/profiles/me?classId='+cls.id,student);assert.equal(mine.status,200);assert.equal(mine.data.item.studentId,student.user.id);
 const reminders=await call('/api/tools/reminders?classId='+cls.id,teacher);assert.equal(reminders.status,200);assert.equal(reminders.data.counts.overdue,1);
 // The quality report derives a quiz bucket from the student's latest attempt without changing stored grades.
 const report=await call('/api/teaching/classes/'+cls.id+'/report',teacher);assert.equal(report.status,200);assert.equal(report.data.quizSummary.attempted,1);assert.equal(report.data.combinedTotals.find(x=>x.studentId===student.user.id).quizScore,100);
 assert.equal((await call('/api/tools/notices',student,{classId:cls.id,title:'No',content:'No'})).status,403);
 assert.equal((await call('/api/tools/notices?classId=foreign',student)).status,404);
 // Version history is teacher-only and immutable quiz snapshots retain the source version.
 const history=await call('/api/tools/questions/'+question.id+'/history',teacher);assert.equal(history.status,200);assert.equal(history.data.items.length,2);assert.equal(history.data.items[0].snapshot.answer[0],0);
 assert.equal((await call('/api/tools/questions/'+question.id+'/history',student)).status,403);
 const upgraded=await call('/api/tools/questions/'+question.id,teacher,{difficulty:'hard',knowledgeIds:[node.id]},'PUT');assert.equal(upgraded.data.item.version,3);assert.equal(upgraded.data.item.difficulty,'hard');
 assert.equal((await call('/api/tools/questions/'+question.id,teacher,{knowledgeIds:['foreign']},'PUT')).status,422);
 assert.equal((await call('/api/tools/knowledge/'+node.id,teacher,{associations:[{type:'lab',id:'lab09'}]},'PUT')).status,200);
 assert.equal((await call('/api/tools/knowledge/'+node.id,teacher,{associations:[{type:'task',id:'foreign'}]},'PUT')).status,422);
 const thread=(await call('/api/tools/threads',student,{classId:cls.id,title:'如何使用Transform',content:'请老师说明',category:'question'})).data.item;
 const reply=await call('/api/tools/threads/'+thread.id+'/replies',teacher,{content:'位置使用position。'});assert.equal(reply.data.item.replies[0].role,'teacher');
 assert.equal((await call('/api/tools/threads/'+thread.id,teacher,{status:'resolved'},'PATCH')).data.item.status,'resolved');
 assert.equal((await call('/api/tools/threads/'+thread.id,student,{status:'resolved'},'PATCH')).status,403);
 const notice=(await call('/api/tools/notices',teacher,{classId:cls.id,title:'任务提醒',content:'请及时学习'})).data.item;
 assert.equal((await call('/api/tools/notices/'+notice.id+'/read',student,{})).status,200);
 assert.equal((await call('/api/tools/notices?classId='+cls.id,student)).data.items[0].read,true);
 const rule=(await call('/api/tools/rules',teacher,{classId:cls.id,title:'未交提醒',type:'missing',threshold:1,windowDays:7})).data.item;
 assert.equal((await call('/api/tools/alerts/decision',teacher,{classId:cls.id,studentId:student.user.id,ruleId:rule.id,status:'dismissed',reason:'学生已申请缓交'})).status,201);
 const intervention=(await call('/api/tools/interventions',teacher,{classId:cls.id,studentId:student.user.id,note:'课后辅导',windowDays:14})).data.item;
 assert.ok(intervention.beforeEvidence);assert.ok(intervention.reviewAt);
 assert.equal((await call('/api/tools/interventions/'+intervention.id,teacher,{status:'closed'},'PATCH')).status,422);
 const closed=await call('/api/tools/interventions/'+intervention.id,teacher,{status:'closed',observation:'已完成补练'},'PATCH');assert.equal(closed.status,200);assert.ok(closed.data.item.afterEvidence);
});
