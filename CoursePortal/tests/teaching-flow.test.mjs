import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/app.mjs';
import {normalizeRubric,scoreRubric,courseTotal} from '../server/grading.mjs';

const credentials={admin:{username:'admin',password:'Admin-test-923!'},teacher:{username:'teacher',password:'Teacher-test-923!'},student:{username:'student',password:'Student-test-923!'}};
async function fixture(t){
 const dir=await mkdtemp(path.join(os.tmpdir(),'unity-teaching-test-'));
 const app=createApp({dataDir:dir,bootstrap:credentials});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 t.after(async()=>{await app.close();assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'unity-teaching-test-'));await rm(dir,{recursive:true,force:true});});
 const call=async(url,{method='GET',body,session,csrf=true,origin}={})=>{const headers={};if(body!==undefined)headers['Content-Type']='application/json';if(session){headers.Cookie=session.cookie;if(csrf)headers['X-CSRF-Token']=session.csrfToken;}if(origin)headers.Origin=origin;const r=await fetch(base+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data,cookie:r.headers.get('set-cookie'),headers:r.headers};};
 const login=async(role,extra={})=>{const r=await call('/api/login',{method:'POST',body:{...credentials[role],...extra}});assert.equal(r.status,200,`login ${role} failed: ${JSON.stringify(r.data)}`);return {...r.data,cookie:r.cookie.split(';')[0]};};
 const makeStudent=async(username,name)=>{const a=await login('admin');const r=await call('/api/admin/users',{method:'POST',session:a,body:{username,name,password:'Student-pass-923!',globalRole:'student'}});assert.equal(r.status,201,`create ${username} failed`);const s=await call('/api/login',{method:'POST',body:{username,password:'Student-pass-923!'}});return {...s.data,cookie:s.cookie.split(';')[0]};};
 return {dir,app,call,login,makeStudent,base};
}
const rubric=[{id:'r1',title:'场景搭建',maxScore:40,weight:50},{id:'r2',title:'脚本配置',maxScore:40,weight:30},{id:'r3',title:'结果说明',maxScore:20,weight:20}];

// ===== 量规与权重（两层分离） =====
test('rubric weights must total 100 percent within a task',()=>{
 const bad=normalizeRubric([{id:'r1',title:'A',maxScore:50,weight:60},{id:'r2',title:'B',maxScore:50,weight:30}]);
 assert.ok(bad.errors.length>0);
 assert.match(bad.errors.join(';'),/权重合计须为100%/);
 const good=normalizeRubric(rubric);
 assert.equal(good.errors.length,0);
 assert.equal(good.weightTotal,100);
 assert.equal(good.maxTotal,100);
});
test('dimension scores are validated against each dimension maximum',()=>{
 const r=normalizeRubric(rubric).rubric;
 const over=scoreRubric(r,{r1:41,r2:10,r3:5});
 assert.ok(over.errors.length>0);
 const ok=scoreRubric(r,{r1:40,r2:20,r3:10});
 assert.equal(ok.errors.length,0);
 assert.equal(ok.total,70);
 assert.equal(ok.normalized,70);
});
test('course total uses the separate task weight layer and reports incomplete weights',()=>{
 const full=courseTotal([{normalized:80,weight:60},{normalized:50,weight:40}]);
 assert.equal(full.total,68);
 assert.ok(full.complete);
 const partial=courseTotal([{normalized:80,weight:60}]);
 assert.equal(partial.weightTotal,60);
 assert.equal(partial.complete,false);
});

// ===== 教学班与名单 =====
test('teacher creates a class and imports a roster with duplicate detection',async t=>{
 const f=await fixture(t),teacher=await f.login('teacher');
 const created=await f.call('/api/teaching/classes',{method:'POST',session:teacher,body:{courseId:'unity-script-2021',name:'2026秋 1班',termId:null,publishedRevision:null}});
 assert.equal(created.status,201,JSON.stringify(created.data));
 const classId=created.data.class.id;
 const student=await f.makeStudent('learner_a','学习者甲');
 const other=await f.makeStudent('learner_b','学习者乙');
 const rows={rows:[{studentNo:'S001',name:'学习者甲',username:'learner_a'},{studentNo:'S002',name:'学习者乙',username:'learner_b'},{studentNo:'S001',name:'重复',username:'learner_a'}]};
 const preview=await f.call(`/api/teaching/classes/${classId}/roster/preview`,{method:'POST',session:teacher,body:rows});
 assert.equal(preview.status,200);
 assert.equal(preview.data.accepted.length,2);
 assert.equal(preview.data.duplicated.length,1);
 const imported=await f.call(`/api/teaching/classes/${classId}/roster`,{method:'POST',session:teacher,body:rows});
 assert.equal(imported.status,200);
 assert.equal(imported.data.added.length,2);
 assert.equal(imported.data.skipped.length,1);
 // 重复导入不重复入班
 const again=await f.call(`/api/teaching/classes/${classId}/roster`,{method:'POST',session:teacher,body:rows});
 assert.equal(again.data.added.length,0);
 const detail=await f.call(`/api/teaching/classes/${classId}`,{session:teacher});
 assert.equal(detail.data.members.length,2);
 assert.ok(detail.data.members.every(m=>m.studentNo));
});
test('roster import rejects rows without a resolvable account and lists errors',async t=>{
 const f=await fixture(t),teacher=await f.login('teacher');
 const created=await f.call('/api/teaching/classes',{method:'POST',session:teacher,body:{courseId:'unity-script-2021',name:'2026秋 2班'}});
 const classId=created.data.class.id;
 const preview=await f.call(`/api/teaching/classes/${classId}/roster/preview`,{method:'POST',session:teacher,body:{rows:[{studentNo:'S009',name:'不存在',username:'ghost_user'},{studentNo:'S010',name:'无账号'}]}});
 assert.equal(preview.status,200);
 assert.equal(preview.data.unknown.length,1);
 assert.equal(preview.data.errors.length,1);
 assert.match(preview.data.errors[0].message,/缺少账号/);
});
test('a teacher cannot read or modify a class they are not assigned to',async t=>{
 const f=await fixture(t),teacher=await f.login('teacher');
 const created=await f.call('/api/teaching/classes',{method:'POST',session:teacher,body:{courseId:'unity-script-2021',name:'私有班'}});
 const classId=created.data.class.id;
 const admin=await f.login('admin');
 await f.call('/api/admin/users',{method:'POST',session:admin,body:{username:'other_teacher',name:'其他教师',password:'Other-pass-923!',globalRole:'teacher'}});
 const r=await f.call('/api/login',{method:'POST',body:{username:'other_teacher',password:'Other-pass-923!'}});
 const outsider={...r.data,cookie:r.cookie.split(';')[0]};
 assert.equal((await f.call(`/api/teaching/classes/${classId}`,{session:outsider})).status,403);
 assert.equal((await f.call(`/api/teaching/classes/${classId}/tasks`,{method:'POST',session:outsider,body:{title:'越权任务',type:'lab',maxScore:100,weight:0,rubric,maxAttempts:3}})).status,403);
});

// ===== 任务发布 =====
test('task publication freezes rubric and refuses invalid weight configuration',async t=>{
 const f=await fixture(t),teacher=await f.login('teacher');
 const created=await f.call('/api/teaching/classes',{method:'POST',session:teacher,body:{courseId:'unity-script-2021',name:'任务班'}});
 const classId=created.data.class.id;
 const bad=await f.call(`/api/teaching/classes/${classId}/tasks`,{method:'POST',session:teacher,body:{title:'权重不合法的任务',type:'lab',maxScore:100,weight:10,rubric:[{id:'r1',title:'A',maxScore:100,weight:50}],maxAttempts:3}});
 assert.equal(bad.status,422);
 assert.match(JSON.stringify(bad.data.error.details),/权重合计须为100%/);
 const made=await f.call(`/api/teaching/classes/${classId}/tasks`,{method:'POST',session:teacher,body:{title:'LAB03 场景实训',description:'完成小球落地场景',type:'lab',lessonId:'lesson-03',labId:'lab03',maxScore:100,weight:40,rubric,maxAttempts:3,ideologicalNote:'说明素材授权来源'}});
 assert.equal(made.status,201,JSON.stringify(made.data));
 const taskId=made.data.task.id;
 assert.equal(made.data.task.status,'draft');
 const published=await f.call(`/api/teaching/tasks/${taskId}/publish`,{method:'POST',session:teacher,body:{}});
 assert.equal(published.status,200,JSON.stringify(published.data));
 assert.equal(published.data.task.status,'published');
 assert.ok(published.data.task.courseRevision>0);
 // 已发布任务不可改
 assert.equal((await f.call(`/api/teaching/tasks/${taskId}`,{method:'PUT',session:teacher,body:{title:'改名',type:'lab',maxScore:100,weight:40,rubric,maxAttempts:3}})).status,409);
});

// ===== 完整教学闭环 =====
test('full loop: teacher publishes, student submits, teacher grades and releases, student reads back',async t=>{
 const f=await fixture(t),teacher=await f.login('teacher');
 const student=await f.makeStudent('loop_student','闭环学生');
 const created=await f.call('/api/teaching/classes',{method:'POST',session:teacher,body:{courseId:'unity-script-2021',name:'闭环班'}});
 const classId=created.data.class.id;
 const made=await f.call(`/api/teaching/classes/${classId}/tasks`,{method:'POST',session:teacher,body:{title:'LAB03 实验报告',type:'lab',maxScore:100,weight:50,rubric,maxAttempts:3}});
 const taskId=made.data.task.id;
 await f.call(`/api/teaching/tasks/${taskId}/publish`,{method:'POST',session:teacher,body:{}});

 // 学生尚未入班时看不到任何已下发任务
 const beforeJoin=await f.call('/api/teaching/student/tasks',{session:student});
 assert.equal(beforeJoin.data.tasks.length,0);

 await f.call(`/api/teaching/classes/${classId}/roster`,{method:'POST',session:teacher,body:{rows:[{studentNo:'S100',name:'闭环学生',username:'loop_student'}]}});
 const afterJoin=await f.call('/api/teaching/student/tasks',{session:student});
 assert.equal(afterJoin.data.tasks.length,1);
 assert.equal(afterJoin.data.tasks[0].id,taskId);

 const submitted=await f.call(`/api/teaching/tasks/${taskId}/submissions`,{method:'POST',session:student,body:{idempotencyKey:'submit-key-1',sceneJson:'{"objects":["ground","sphere"]}',note:'已完成落地场景',checkResult:{rulesPassed:2,rulesTotal:2}}});
 assert.equal(submitted.status,201,JSON.stringify(submitted.data));
 const submissionId=submitted.data.submission.id;
 assert.equal(submitted.data.submission.attempt,1);

 // 幂等：同一幂等键重复提交只产生一个有效版本
 const repeat=await f.call(`/api/teaching/tasks/${taskId}/submissions`,{method:'POST',session:student,body:{idempotencyKey:'submit-key-1',sceneJson:'{"objects":["ground","sphere"]}',note:'重复点击'}});
 assert.equal(repeat.status,200);
 assert.equal(repeat.data.duplicate,true);
 assert.equal(repeat.data.submission.id,submissionId);

 // 重做产生新版本，不覆盖原提交
 const redo=await f.call(`/api/teaching/tasks/${taskId}/submissions`,{method:'POST',session:student,body:{idempotencyKey:'submit-key-2',note:'第二版',sceneJson:'{"objects":["ground","sphere","target"]}'}});
 assert.equal(redo.status,201);
 assert.equal(redo.data.submission.attempt,2);
 const list=await f.call(`/api/teaching/tasks/${taskId}/submissions`,{session:teacher});
 assert.equal(list.data.submissions.length,2);

 // 教师量规批阅并发布成绩
 const graded=await f.call(`/api/teaching/submissions/${submissionId}/grade`,{method:'POST',session:teacher,body:{scores:{r1:40,r2:30,r3:15},feedback:'场景完整，参数可再调整',released:true}});
 assert.equal(graded.status,200,JSON.stringify(graded.data));
 assert.equal(graded.data.submission.score,85);
 assert.equal(graded.data.submission.released,true);

 // 学生只能读到本人已发布成绩
 const mine=await f.call('/api/teaching/student/submissions',{session:student});
 assert.equal(mine.data.submissions.length,2);
 const releasedRow=mine.data.submissions.find(s=>s.id===submissionId);
 assert.equal(releasedRow.score,85);
 assert.equal(releasedRow.released,true);
 assert.ok(releasedRow.rubric.length===3);
});
test('student cannot submit to a class they are not enrolled in',async t=>{
 const f=await fixture(t),teacher=await f.login('teacher');
 const student=await f.makeStudent('outsider_student','外部学生');
 const created=await f.call('/api/teaching/classes',{method:'POST',session:teacher,body:{courseId:'unity-script-2021',name:'隔离班'}});
 const classId=created.data.class.id;
 const made=await f.call(`/api/teaching/classes/${classId}/tasks`,{method:'POST',session:teacher,body:{title:'隔离任务',type:'lab',maxScore:100,weight:10,rubric,maxAttempts:3}});
 await f.call(`/api/teaching/tasks/${made.data.task.id}/publish`,{method:'POST',session:teacher,body:{}});
 const r=await f.call(`/api/teaching/tasks/${made.data.task.id}/submissions`,{method:'POST',session:student,body:{idempotencyKey:'k1',note:'越权提交'}});
 assert.equal(r.status,403);
});
test('teacher cannot read submissions of another class',async t=>{
 const f=await fixture(t),teacher=await f.login('teacher');
 const student=await f.makeStudent('class_a_student','A班学生');
 const created=await f.call('/api/teaching/classes',{method:'POST',session:teacher,body:{courseId:'unity-script-2021',name:'A班'}});
 const classId=created.data.class.id;
 await f.call(`/api/teaching/classes/${classId}/roster`,{method:'POST',session:teacher,body:{rows:[{studentNo:'A1',name:'A班学生',username:'class_a_student'}]}});
 const made=await f.call(`/api/teaching/classes/${classId}/tasks`,{method:'POST',session:teacher,body:{title:'A班任务',type:'lab',maxScore:100,weight:10,rubric,maxAttempts:3}});
 const taskId=made.data.task.id;
 await f.call(`/api/teaching/tasks/${taskId}/publish`,{method:'POST',session:teacher,body:{}});
 const sub=await f.call(`/api/teaching/tasks/${taskId}/submissions`,{method:'POST',session:student,body:{idempotencyKey:'k1',note:'A'}});
 const admin=await f.login('admin');
 await f.call('/api/admin/users',{method:'POST',session:admin,body:{username:'other_teacher2',name:'其他教师2',password:'Other2-pass-923!',globalRole:'teacher'}});
 const r=await f.call('/api/login',{method:'POST',body:{username:'other_teacher2',password:'Other2-pass-923!'}});
 const outsider={...r.data,cookie:r.cookie.split(';')[0]};
 assert.equal((await f.call(`/api/teaching/tasks/${taskId}/submissions`,{session:outsider})).status,403);
});

// ===== 改分留痕 =====
test('score revision requires a reason and keeps the full audit trail',async t=>{
 const f=await fixture(t),teacher=await f.login('teacher');
 const student=await f.makeStudent('revise_student','改分学生');
 const created=await f.call('/api/teaching/classes',{method:'POST',session:teacher,body:{courseId:'unity-script-2021',name:'改分班'}});
 const classId=created.data.class.id;
 await f.call(`/api/teaching/classes/${classId}/roster`,{method:'POST',session:teacher,body:{rows:[{studentNo:'R1',name:'改分学生',username:'revise_student'}]}});
 const made=await f.call(`/api/teaching/classes/${classId}/tasks`,{method:'POST',session:teacher,body:{title:'改分任务',type:'lab',maxScore:100,weight:10,rubric,maxAttempts:3}});
 const taskId=made.data.task.id;
 await f.call(`/api/teaching/tasks/${taskId}/publish`,{method:'POST',session:teacher,body:{}});
 const sub=await f.call(`/api/teaching/tasks/${taskId}/submissions`,{method:'POST',session:student,body:{idempotencyKey:'r1',note:'x'}});
 const submissionId=sub.data.submission.id;
 await f.call(`/api/teaching/submissions/${submissionId}/grade`,{method:'POST',session:teacher,body:{scores:{r1:30,r2:20,r3:10},feedback:'初次批阅',released:true}});
 // 无理由改分被拒
 const noReason=await f.call(`/api/teaching/submissions/${submissionId}/revise`,{method:'POST',session:teacher,body:{score:95}});
 assert.equal(noReason.status,422);
 const revised=await f.call(`/api/teaching/submissions/${submissionId}/revise`,{method:'POST',session:teacher,body:{score:95,reason:'复核后确认场景完整'}});
 assert.equal(revised.status,200);
 assert.equal(revised.data.submission.score,95);
 assert.ok(revised.data.submission.revisions.length>=2);
 const trail=revised.data.submission.revisions;
 assert.equal(trail[trail.length-1].beforeScore,60);
 assert.equal(trail[trail.length-1].afterScore,95);
 assert.match(trail[trail.length-1].reason,/复核/);
});

// ===== 学情统计 =====
test('class analytics counts four separate completion calibers and only counts released tasks',async t=>{
 const f=await fixture(t),teacher=await f.login('teacher');
 const student=await f.makeStudent('analytics_student','统计学生');
 const created=await f.call('/api/teaching/classes',{method:'POST',session:teacher,body:{courseId:'unity-script-2021',name:'统计班'}});
 const classId=created.data.class.id;
 await f.call(`/api/teaching/classes/${classId}/roster`,{method:'POST',session:teacher,body:{rows:[{studentNo:'AN1',name:'统计学生',username:'analytics_student'}]}});
 // 一个草稿任务（未下发，不计入分母）与一个已发布任务
 const draft=await f.call(`/api/teaching/classes/${classId}/tasks`,{method:'POST',session:teacher,body:{title:'草稿任务',type:'work',maxScore:100,weight:10,rubric,maxAttempts:3}});
 const made=await f.call(`/api/teaching/classes/${classId}/tasks`,{method:'POST',session:teacher,body:{title:'已下发任务',type:'lab',lessonId:'lesson-03',maxScore:100,weight:60,rubric,maxAttempts:3}});
 const taskId=made.data.task.id;
 await f.call(`/api/teaching/tasks/${taskId}/publish`,{method:'POST',session:teacher,body:{}});

 await f.call('/api/teaching/events',{method:'POST',session:student,body:{events:[{eventId:'11111111-1111-4111-8111-111111111111',idempotencyKey:'ev-self-1',verb:'self_reported',objectType:'task',objectId:taskId,classId,payload:{}}]}});
 await f.call('/api/teaching/events',{method:'POST',session:student,body:{events:[{eventId:'22222222-2222-4222-8222-222222222222',idempotencyKey:'ev-video-1',verb:'ended',objectType:'lesson',objectId:'lesson-03',classId,payload:{}}]}});
 // 重复事件被去重
 const dup=await f.call('/api/teaching/events',{method:'POST',session:student,body:{events:[{eventId:'11111111-1111-4111-8111-111111111111',idempotencyKey:'ev-self-1',verb:'self_reported',objectType:'task',objectId:taskId,classId,payload:{}}]}});
 assert.equal(dup.data.accepted.length,0);
 assert.equal(dup.data.rejected.length,1);

 const analytics=await f.call(`/api/teaching/classes/${classId}/analytics`,{session:teacher});
 assert.equal(analytics.status,200);
 assert.equal(analytics.data.denominator,1,'分母只含已下发任务');
 const row=analytics.data.students.find(s=>s.username==='analytics_student');
 assert.equal(row.tasksTotal,1);
 assert.equal(row.tasks[0].statuses.selfReported,true);
 assert.equal(row.tasks[0].statuses.videoEnded,true);
 assert.equal(row.tasks[0].statuses.teacherConfirmed,false);
 assert.equal(row.confirmedCount,0);

 // 提交并批阅后，四口径逐项变化
 const sub=await f.call(`/api/teaching/tasks/${taskId}/submissions`,{method:'POST',session:student,body:{idempotencyKey:'an-1',note:'提交'}});
 await f.call(`/api/teaching/submissions/${sub.data.submission.id}/grade`,{method:'POST',session:teacher,body:{scores:{r1:40,r2:30,r3:20},feedback:'通过',released:true}});
 const after=await f.call(`/api/teaching/classes/${classId}/analytics`,{session:teacher});
 const afterRow=after.data.students.find(s=>s.username==='analytics_student');
 assert.equal(afterRow.tasks[0].statuses.teacherConfirmed,true);
 assert.equal(afterRow.tasks[0].statuses.experimentPassed,false,'得分大于0不等于实验通过');
 assert.equal(afterRow.tasks[0].statuses.experimentChecked,false,'没有检测结果时应标记为未检测');
 assert.equal(afterRow.confirmedCount,1);
 assert.equal(afterRow.releasedCount,1);
 assert.equal(afterRow.average,90);
 assert.equal(afterRow.weightTotal,60);
 assert.equal(afterRow.weightComplete,false,'占比未配置完整应显式说明');
 // 只有携带实验检测结果且判定通过的提交才计为实验通过
 const checked=await f.call(`/api/teaching/tasks/${taskId}/submissions`,{method:'POST',session:student,body:{idempotencyKey:'an-2',note:'带检测结果',checkResult:{passed:true,checks:[{id:'landing',ok:true}]}}});
 assert.equal(checked.status,201);
 const final=await f.call(`/api/teaching/classes/${classId}/analytics`,{session:teacher});
 const finalRow=final.data.students.find(s=>s.username==='analytics_student');
 assert.equal(finalRow.tasks[0].statuses.experimentChecked,true);
 assert.equal(finalRow.tasks[0].statuses.experimentPassed,true);
});
test('analytics never counts a draft task in the denominator',async t=>{
 const f=await fixture(t),teacher=await f.login('teacher');
 const created=await f.call('/api/teaching/classes',{method:'POST',session:teacher,body:{courseId:'unity-script-2021',name:'空班'}});
 const classId=created.data.class.id;
 await f.call(`/api/teaching/classes/${classId}/tasks`,{method:'POST',session:teacher,body:{title:'仅草稿',type:'work',maxScore:100,weight:100,rubric,maxAttempts:3}});
 const analytics=await f.call(`/api/teaching/classes/${classId}/analytics`,{session:teacher});
 assert.equal(analytics.data.denominator,0);
 assert.equal(analytics.data.weightTotal,0);
});

// ===== 导出 =====
test('grade export contains only real records for the class',async t=>{
 const f=await fixture(t),teacher=await f.login('teacher');
 const student=await f.makeStudent('csv_student','导出学生');
 const created=await f.call('/api/teaching/classes',{method:'POST',session:teacher,body:{courseId:'unity-script-2021',name:'导出班'}});
 const classId=created.data.class.id;
 await f.call(`/api/teaching/classes/${classId}/roster`,{method:'POST',session:teacher,body:{rows:[{studentNo:'C1',name:'导出学生',username:'csv_student'}]}});
 const made=await f.call(`/api/teaching/classes/${classId}/tasks`,{method:'POST',session:teacher,body:{title:'导出任务',type:'lab',maxScore:100,weight:100,rubric,maxAttempts:3}});
 const taskId=made.data.task.id;
 await f.call(`/api/teaching/tasks/${taskId}/publish`,{method:'POST',session:teacher,body:{}});
 const sub=await f.call(`/api/teaching/tasks/${taskId}/submissions`,{method:'POST',session:student,body:{idempotencyKey:'c1',note:'x'}});
 await f.call(`/api/teaching/submissions/${sub.data.submission.id}/grade`,{method:'POST',session:teacher,body:{scores:{r1:40,r2:30,r3:20},feedback:'好',released:true}});
 const res=await fetch(f.base+`/api/teaching/classes/${classId}/export/grades`,{headers:{Cookie:(await f.login('teacher')).cookie}});
 assert.equal(res.status,200);
 assert.match(res.headers.get('content-type'),/text\/csv/);
 const csv=await res.text();
 assert.match(csv,/学号/);
 assert.match(csv,/C1/);
 assert.match(csv,/90/);
 assert.match(csv,/导出学生/);
});

// ===== 权限边界 =====
test('student accounts cannot manage classes or tasks',async t=>{
 const f=await fixture(t),student=await f.login('student');
 assert.equal((await f.call('/api/teaching/classes',{session:student})).status,403);
 assert.equal((await f.call('/api/teaching/classes',{method:'POST',session:student,body:{courseId:'unity-script-2021',name:'学生建班'}})).status,403);
});
test('mutations on teaching endpoints still require CSRF',async t=>{
 const f=await fixture(t),teacher=await f.login('teacher');
 const r=await f.call('/api/teaching/classes',{method:'POST',session:teacher,csrf:false,body:{courseId:'unity-script-2021',name:'无令牌'}});
 assert.equal(r.status,403);
 assert.equal(r.data.error.code,'CSRF_REJECTED');
});
test('cross-origin writes are rejected on teaching endpoints',async t=>{
 const f=await fixture(t),teacher=await f.login('teacher');
 const r=await f.call('/api/teaching/classes',{method:'POST',session:teacher,origin:'https://evil.example',body:{courseId:'unity-script-2021',name:'跨站'}});
 assert.equal(r.status,403);
});

// ===== 未发布成绩不在接口中下发 =====
test('student APIs hide score, rubric scores and feedback until released',async t=>{
 const f=await fixture(t),teacher=await f.login('teacher');
 const student=await f.makeStudent('mask_student','屏蔽学生');
 const created=await f.call('/api/teaching/classes',{method:'POST',session:teacher,body:{courseId:'unity-script-2021',name:'屏蔽班'}});
 const classId=created.data.class.id;
 await f.call(`/api/teaching/classes/${classId}/roster`,{method:'POST',session:teacher,body:{rows:[{studentNo:'M1',name:'屏蔽学生',username:'mask_student'}]}});
 const made=await f.call(`/api/teaching/classes/${classId}/tasks`,{method:'POST',session:teacher,body:{title:'待发布成绩',type:'lab',maxScore:100,weight:100,rubric,maxAttempts:3}});
 const taskId=made.data.task.id;
 await f.call(`/api/teaching/tasks/${taskId}/publish`,{method:'POST',session:teacher,body:{}});
 const sub=await f.call(`/api/teaching/tasks/${taskId}/submissions`,{method:'POST',session:student,body:{idempotencyKey:'m-1',note:'提交'}});
 await f.call(`/api/teaching/submissions/${sub.data.submission.id}/grade`,{method:'POST',session:teacher,body:{scores:{r1:40,r2:30,r3:20},feedback:'内部评语：结构还需补充',released:false}});
 const tasks=await f.call('/api/teaching/student/tasks',{session:student});
 const mine=tasks.data.tasks.find(x=>x.id===taskId).mySubmissions.at(-1);
 assert.equal(mine.status,'graded','学生可以知道已被批阅');
 assert.equal(mine.released,false);
 assert.equal(mine.score,null,'未发布不得下发分数');
 assert.equal(mine.feedback,'','未发布不得下发评语');
 const subs=await f.call('/api/teaching/student/submissions',{session:student});
 const row=subs.data.submissions.find(x=>x.taskId===taskId);
 assert.equal(row.score,null,'未发布不得下发分数');
 assert.equal(row.feedback,'','未发布不得下发评语');
 assert.deepEqual(row.myScores,[]);
 const raw=JSON.stringify(tasks.data)+JSON.stringify(subs.data);
 assert.ok(!raw.includes('内部评语'),'响应中不应出现未发布评语');
 assert.ok(!raw.includes('"score":90'),'响应中不应出现未发布分数');
 // 发布之后才下发分数与评语
 await f.call(`/api/teaching/submissions/${sub.data.submission.id}/grade`,{method:'POST',session:teacher,body:{scores:{r1:40,r2:30,r3:20},feedback:'结构完整',released:true}});
 const released=(await f.call('/api/teaching/student/submissions',{session:student})).data.submissions.find(x=>x.taskId===taskId);
 assert.equal(released.score,90);
 assert.equal(released.feedback,'结构完整');
 assert.equal(released.myScores.length,3);
});

// ===== 学习事件必须能对回真实班级、任务与学习单元 =====
test('student events are rejected when the class, task or lesson does not belong to them',async t=>{
 const f=await fixture(t),teacher=await f.login('teacher');
 const student=await f.makeStudent('event_student','事件学生');
 const created=await f.call('/api/teaching/classes',{method:'POST',session:teacher,body:{courseId:'unity-script-2021',name:'事件班'}});
 const classId=created.data.class.id;
 await f.call(`/api/teaching/classes/${classId}/roster`,{method:'POST',session:teacher,body:{rows:[{studentNo:'E1',name:'事件学生',username:'event_student'}]}});
 const made=await f.call(`/api/teaching/classes/${classId}/tasks`,{method:'POST',session:teacher,body:{title:'事件任务',type:'lab',lessonId:'lesson-03',maxScore:100,weight:100,rubric,maxAttempts:3}});
 const taskId=made.data.task.id;
 await f.call(`/api/teaching/tasks/${taskId}/publish`,{method:'POST',session:teacher,body:{}});
 const send=async events=>(await f.call('/api/teaching/events',{method:'POST',session:student,body:{events}})).data;
 // 学生不能上报"教师确认"这类受信动词
 let out=await send([{idempotencyKey:'e-confirm-1',verb:'confirmed',objectType:'task',objectId:taskId,classId,taskId,payload:{}}]);
 assert.equal(out.accepted.length,0);
 assert.equal(out.rejected[0].reason,'VERB_NOT_ALLOWED');
 // 不存在的班级
 out=await send([{idempotencyKey:'e-class-1',verb:'ended',objectType:'lesson',objectId:'lesson-03',classId:'class-not-exist',payload:{}}]);
 assert.equal(out.rejected[0].reason,'CLASS_NOT_FOUND');
 // 存在但不属于本人的班级
 const other=await f.call('/api/teaching/classes',{method:'POST',session:teacher,body:{courseId:'unity-script-2021',name:'别班'}});
 out=await send([{idempotencyKey:'e-other-1',verb:'ended',objectType:'lesson',objectId:'lesson-03',classId:other.data.class.id,payload:{}}]);
 assert.equal(out.rejected[0].reason,'NOT_IN_CLASS');
 // 不存在的任务
 out=await send([{idempotencyKey:'e-task-1',verb:'self_reported',objectType:'task',objectId:'task-fake',classId,taskId:'task-fake',payload:{}}]);
 assert.equal(out.rejected[0].reason,'TASK_NOT_FOUND');
 // 别的班的任务挂在本班
 const foreign=await f.call(`/api/teaching/classes/${other.data.class.id}/tasks`,{method:'POST',session:teacher,body:{title:'别班任务',type:'lab',maxScore:100,weight:100,rubric,maxAttempts:3}});
 await f.call(`/api/teaching/tasks/${foreign.data.task.id}/publish`,{method:'POST',session:teacher,body:{}});
 out=await send([{idempotencyKey:'e-task-2',verb:'self_reported',objectType:'task',objectId:foreign.data.task.id,classId,taskId:foreign.data.task.id,payload:{}}]);
 assert.equal(out.rejected[0].reason,'TASK_CLASS_MISMATCH');
 // 课程中不存在的学习单元
 out=await send([{idempotencyKey:'e-lesson-1',verb:'ended',objectType:'lesson',objectId:'lesson-99',classId,payload:{}}]);
 assert.equal(out.rejected[0].reason,'LESSON_NOT_FOUND');
 // 合法事件入库，并进入本班视频结束口径
 out=await send([{idempotencyKey:'e-ok-1',verb:'ended',objectType:'lesson',objectId:'lesson-03',classId,payload:{}}]);
 assert.equal(out.accepted.length,1);
 const row=(await f.call(`/api/teaching/classes/${classId}/analytics`,{session:teacher})).data.students.find(s=>s.username==='event_student');
 assert.equal(row.tasks[0].statuses.videoEnded,true);
});
