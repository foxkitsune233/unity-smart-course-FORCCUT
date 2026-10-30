import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/app.mjs';
import {evaluateChecks,defaultTemplate} from '../server/lab-templates.mjs';

const credentials={admin:{username:'admin',password:'Admin-test-923!'},teacher:{username:'teacher',password:'Teacher-test-923!'},student:{username:'student',password:'Student-test-923!'}};
const rubric=[{id:'r1',title:'场景搭建',maxScore:40,weight:50},{id:'r2',title:'脚本配置',maxScore:40,weight:30},{id:'r3',title:'结果说明',maxScore:20,weight:20}];

async function fixture(t){
 const dir=await mkdtemp(path.join(os.tmpdir(),'unity-teaching-extra-'));
 const app=createApp({dataDir:dir,bootstrap:credentials});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+app.server.address().port;
 t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 const call=async(url,{method='GET',body,session,csrf=true}={})=>{const headers={};if(body!==undefined)headers['Content-Type']='application/json';if(session){headers.Cookie=session.cookie;if(csrf)headers['X-CSRF-Token']=session.csrfToken;}const r=await fetch(base+url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data,text,cookie:r.headers.get('set-cookie')};};
 const login=async role=>{const r=await call('/api/login',{method:'POST',body:credentials[role]});assert.equal(r.status,200);return {...r.data,cookie:r.cookie.split(';')[0]};};
 const makeStudent=async(username,name)=>{const a=await login('admin');const r=await call('/api/admin/users',{method:'POST',session:a,body:{username,name,password:'Student-pass-923!',globalRole:'student'}});assert.equal(r.status,201);const s=await call('/api/login',{method:'POST',body:{username,password:'Student-pass-923!'}});return {...s.data,cookie:s.cookie.split(';')[0]};};
 return {app,call,login,makeStudent};
}

async function scenario(t){
 const f=await fixture(t);
 const teacher=await f.login('teacher');
 const student=await f.makeStudent('extra_student','扩展学生');
 const created=await f.call('/api/teaching/classes',{method:'POST',session:teacher,body:{courseId:'unity-script-2021',name:'扩展班'}});
 const classId=created.data.class.id;
 await f.call(`/api/teaching/classes/${classId}/roster`,{method:'POST',session:teacher,body:{rows:[{studentNo:'E1',name:'扩展学生',username:'extra_student'}]}});
 const made=await f.call(`/api/teaching/classes/${classId}/tasks`,{method:'POST',session:teacher,body:{title:'LAB03 物理实训',type:'lab',lessonId:'lesson-03',labId:'lab03',maxScore:100,weight:100,rubric,maxAttempts:3}});
 const taskId=made.data.task.id;
 await f.call(`/api/teaching/tasks/${taskId}/publish`,{method:'POST',session:teacher,body:{}});
 const submitted=await f.call(`/api/teaching/tasks/${taskId}/submissions`,{method:'POST',session:student,body:{idempotencyKey:'k-1',note:'落地场景',sceneJson:'{"objects":[{"id":"ground"}]}',checkResult:{passed:true,checks:[{key:'grounded',ok:true}]}}});
 const submissionId=submitted.data.submission.id;
 return {f,teacher,student,classId,taskId,submissionId};
}

// ===== 任务控制：延期、补交、重做、撤回、重新发布 =====
test('published task rules can be extended without touching the rubric',async t=>{
 const {f,teacher,student,classId,taskId}=await scenario(t);
 const later=new Date(Date.now()+7*24*3600*1000).toISOString();
 const patched=await f.call(`/api/teaching/tasks/${taskId}/rules`,{method:'PATCH',session:teacher,body:{dueAt:later,allowLate:true,allowResubmit:true,maxAttempts:5,note:'调课顺延一周'}});
 assert.equal(patched.status,200,JSON.stringify(patched.data));
 assert.equal(patched.data.task.maxAttempts,5);
 assert.equal(patched.data.task.allowLate,true);
 assert.equal(patched.data.task.dueAt,later);
 // 量规与满分保持锁定
 assert.equal(patched.data.task.maxScore,100);
 assert.equal(patched.data.task.rubric.length,3);
 // 重做上限不能低于已有提交次数
 const used=await f.call(`/api/teaching/tasks/${taskId}/submissions`,{method:'POST',session:student,body:{idempotencyKey:'k-2',note:'第二版'}});
 assert.equal(used.status,201);
 const tooLow=await f.call(`/api/teaching/tasks/${taskId}/rules`,{method:'PATCH',session:teacher,body:{maxAttempts:1}});
 assert.equal(tooLow.status,409);
 assert.match(JSON.stringify(tooLow.data),/重做上限不能低于/);
});

test('withdrawn task disappears for students but keeps submissions, republish restores it',async t=>{
 const {f,teacher,student,taskId}=await scenario(t);
 const noReason=await f.call(`/api/teaching/tasks/${taskId}/withdraw`,{method:'POST',session:teacher,body:{}});
 assert.equal(noReason.status,422);
 const withdrawn=await f.call(`/api/teaching/tasks/${taskId}/withdraw`,{method:'POST',session:teacher,body:{reason:'素材授权待确认'}});
 assert.equal(withdrawn.status,200);
 assert.equal(withdrawn.data.task.status,'withdrawn');
 const hidden=await f.call('/api/teaching/student/tasks',{session:student});
 assert.equal(hidden.data.tasks.length,0);
 // 提交记录保留
 const kept=await f.call(`/api/teaching/tasks/${taskId}/submissions`,{session:teacher});
 assert.equal(kept.data.submissions.length,1);
 const again=await f.call(`/api/teaching/tasks/${taskId}/publish`,{method:'POST',session:teacher,body:{}});
 assert.equal(again.status,200);
 assert.equal(again.data.task.status,'published');
 const visible=await f.call('/api/teaching/student/tasks',{session:student});
 assert.equal(visible.data.tasks.length,1);
});

// ===== 成绩复核：改分后总分、分项、总评、导出保持一致 =====
test('grade appeal revise keeps total equal to rubric items and flows into export',async t=>{
 const {f,teacher,student,classId,submissionId}=await scenario(t);
 await f.call(`/api/teaching/submissions/${submissionId}/grade`,{method:'POST',session:teacher,body:{scores:{r1:30,r2:20,r3:10},feedback:'初次批阅',released:true}});
 const applied=await f.call(`/api/teaching/submissions/${submissionId}/appeal`,{method:'POST',session:student,body:{reason:'脚本配置项已按要求挂载计分器，认为应得更高分'}});
 assert.equal(applied.status,201,JSON.stringify(applied.data));
 const appealId=applied.data.appeal.id;
 // 同一提交不允许两条待处理申请
 const duplicate=await f.call(`/api/teaching/submissions/${submissionId}/appeal`,{method:'POST',session:student,body:{reason:'重复申请一次试试是否会被拦住'}});
 assert.equal(duplicate.status,409);

 const revised=await f.call(`/api/teaching/appeals/${appealId}/resolve`,{method:'POST',session:teacher,body:{decision:'revise',score:90,note:'复核确认计分器已绑定'}});
 assert.equal(revised.status,200,JSON.stringify(revised.data));
 assert.equal(revised.data.submission.score,90);
 const appeal=revised.data.appeal;
 assert.equal(appeal.status,'revised');
 assert.equal(appeal.afterScore,90);

 // 学生看到的分项之和等于总分
 const mine=await f.call('/api/teaching/student/submissions',{session:student});
 const row=mine.data.submissions.find(s=>s.id===submissionId);
 assert.equal(row.score,90);
 const sum=row.myScores.reduce((total,item)=>total+Number(item.score),0);
 assert.equal(Math.round(sum*100)/100,90);
 assert.ok(row.myScores.every(item=>item.score<=item.maxScore));

 // 导出 CSV 与总评读到同一份分数
 const csv=await f.call(`/api/teaching/classes/${classId}/export/grades`,{session:teacher});
 assert.match(csv.text,/90/);
 const analytics=await f.call(`/api/teaching/classes/${classId}/analytics`,{session:teacher});
 const studentRow=analytics.data.students.find(s=>s.studentNo==='E1');
 assert.equal(studentRow.average,90);
 assert.equal(studentRow.courseTotal,90);

 // 复核结论回到学生端
 const appeals=await f.call('/api/teaching/student/appeals',{session:student});
 assert.equal(appeals.data.appeals[0].status,'revised');
 assert.equal(appeals.data.appeals[0].decisionNote,'复核确认计分器已绑定');
});

test('appeal is refused before the grade is released and by other students',async t=>{
 const {f,teacher,student,submissionId}=await scenario(t);
 await f.call(`/api/teaching/submissions/${submissionId}/grade`,{method:'POST',session:teacher,body:{scores:{r1:30,r2:20,r3:10},feedback:'未发布',released:false}});
 const before=await f.call(`/api/teaching/submissions/${submissionId}/appeal`,{method:'POST',session:student,body:{reason:'成绩还没发布就想申请复核'}});
 assert.equal(before.status,409);
 const other=await f.makeStudent('extra_other','他班学生');
 const stranger=await f.call(`/api/teaching/submissions/${submissionId}/appeal`,{method:'POST',session:other,body:{reason:'不是我的提交也来申请复核'}});
 assert.equal(stranger.status,403);
});

test('upholding an appeal records the decision without changing the score',async t=>{
 const {f,teacher,student,submissionId}=await scenario(t);
 await f.call(`/api/teaching/submissions/${submissionId}/grade`,{method:'POST',session:teacher,body:{scores:{r1:30,r2:20,r3:10},feedback:'初次批阅',released:true}});
 const applied=await f.call(`/api/teaching/submissions/${submissionId}/appeal`,{method:'POST',session:student,body:{reason:'觉得第三条评语太严格了'}});
 const upheld=await f.call(`/api/teaching/appeals/${applied.data.appeal.id}/resolve`,{method:'POST',session:teacher,body:{decision:'uphold',note:'评分与量规一致，维持原判'}});
 assert.equal(upheld.status,200);
 assert.equal(upheld.data.submission.score,60);
 assert.equal(upheld.data.appeal.status,'upheld');
});

// ===== 实验模板与规则求值 =====
test('lab template can be read, customized and versioned',async t=>{
 const f=await fixture(t);
 const teacher=await f.login('teacher');
 const first=await f.call('/api/teaching/labs/lab03/template',{session:teacher});
 assert.equal(first.status,200);
 assert.equal(first.data.source,'default');
 assert.ok(first.data.template.checks.length>=3);
 const saved=await f.call('/api/teaching/labs/lab03/template',{method:'PUT',session:teacher,body:{version:1,title:'CH03 · 物理与落地（本校本）',checks:[{key:'grounded',label:'落地',field:'grounded',op:'===',value:true}],hints:['先调质量，再调摩擦']}});
 assert.equal(saved.status,200,JSON.stringify(saved.data));
 assert.equal(saved.data.template.version,2);
 assert.equal(saved.data.template.customized,true);
 assert.equal(saved.data.template.checks.length,1);
 const again=await f.call('/api/teaching/labs/lab03/template',{session:teacher});
 assert.equal(again.data.source,'customized');
 assert.equal(again.data.template.title,'CH03 · 物理与落地（本校本）');
 // 非法规则被拒
 const invalid=await f.call('/api/teaching/labs/lab03/template',{method:'PUT',session:teacher,body:{version:2,checks:[{key:'bad key',field:'score',op:'>',value:1}]}});
 assert.equal(invalid.status,422);
});

test('lab checks evaluate real experiment fields and ignore optional rules',()=>{
 const template=defaultTemplate('lab03');
 const passed=evaluateChecks(template.checks,{grounded:true,jumps:2,rejectedJumps:1,triggers:1});
 assert.equal(passed.passed,true);
 assert.equal(passed.checks.length,template.checks.length);
 const failed=evaluateChecks(template.checks,{grounded:true,jumps:1,rejectedJumps:0,triggers:1});
 assert.equal(failed.passed,false);
 assert.equal(failed.checks.find(item=>item.key==='rejected').ok,false);
 // 可选规则不参与通过判定
 const withOptional=[{key:'required',label:'必过',field:'score',op:'>=',value:5},{key:'extra',label:'参考',field:'hits',op:'>=',value:99,optional:true}];
 assert.equal(evaluateChecks(withOptional,{score:6,hits:0}).passed,true);
 assert.equal(evaluateChecks(withOptional,{score:4,hits:0}).passed,false);
 // 缺失字段不能当作通过
 assert.equal(evaluateChecks([{key:'missing',label:'缺失',field:'notExists',op:'===',value:true}],{}).passed,false);
});

// ===== 任务—目标关联 =====
test('task outcome links must reference an existing course outcome',async t=>{
 const f=await fixture(t);
 const teacher=await f.login('teacher');
 const created=await f.call('/api/teaching/classes',{method:'POST',session:teacher,body:{courseId:'unity-script-2021',name:'目标关联班'}});
 const classId=created.data.class.id;
 const bad=await f.call(`/api/teaching/classes/${classId}/tasks`,{method:'POST',session:teacher,body:{title:'关联不存在目标',type:'lab',maxScore:100,weight:10,rubric,maxAttempts:3,outcomeLinks:[{outcomeId:'ghost-outcome',contribution:1}]}});
 assert.equal(bad.status,422);
 assert.match(JSON.stringify(bad.data),/INVALID_OUTCOME/);
 const detail=await f.call(`/api/teaching/classes/${classId}`,{session:teacher});
 assert.ok(Array.isArray(detail.data.outcomes),'班级详情要带课程目标，任务弹窗才能勾选');
});

// ===== 课程质量报告 =====
test('quality report aggregates outcomes, evidence and risks from real records',async t=>{
 const {f,teacher,student,classId,submissionId}=await scenario(t);
 await f.call(`/api/teaching/submissions/${submissionId}/grade`,{method:'POST',session:teacher,body:{scores:{r1:15,r2:15,r3:10},feedback:'需要加强',released:true}});
 const report=await f.call(`/api/teaching/classes/${classId}/report`,{session:teacher});
 assert.equal(report.status,200,JSON.stringify(report.data));
 assert.equal(report.data.totals.students,1);
 assert.equal(report.data.totals.tasks,1);
 assert.equal(report.data.totals.weightTotal,100);
 assert.ok(report.data.score.average!=null);
 assert.equal(report.data.evidence.find(item=>item.kind==='graded').count,1);
 assert.equal(report.data.evidence.find(item=>item.kind==='check').count,1);
 assert.equal(report.data.risks.length,1,'低分学生应进入关注名单');
 const html=await f.call(`/api/teaching/classes/${classId}/report/export`,{session:teacher});
 assert.match(html.text,/课程质量报告/);
 assert.match(html.text,/过程证据材料/);
});
