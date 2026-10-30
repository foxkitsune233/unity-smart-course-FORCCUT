import {randomUUID} from 'node:crypto';
import {HttpError,requireThat} from './validation.mjs';
import {normalizeRubric,scoreRubric,courseTotal,rescaleRubric} from './grading.mjs';
import {validateClass,validateTerm,validateRoster,validateTask,validateSubmission,validateGrading,validateScoreRevision,validateIntervention,validateTaskRules,validateAppeal,validateAppealDecision} from './teaching-validation.mjs';
import {LAB_IDS,defaultTemplate,mergeTemplate,validateLabTemplate} from './lab-templates.mjs';

// 学生只能上报客户端可观测的行为；教师确认、评分、发布等受信动词另列。
const CLIENT_VERBS=new Set(['opened','progressed','ended','changed','started','stopped','saved','checked','hinted','self_reported','answered','noted']);
const STAFF_VERBS=new Set([...CLIENT_VERBS,'submitted','assessed','confirmed','intervened','observed','voided','published','alerted']);

// 教学域接口：教学班、名单、任务、提交、量规批阅、学情统计、成绩导出、学习事件。
// 权限原则：教师只见到自己被授权的教学班；学生只见到自己所在教学班的已下发任务。
export function createTeachingApi({q,all,run,transaction,audit,needUser,membership,bodyOf,json,now=()=>new Date().toISOString()}){
 const stamp=now;

 function classById(id){const row=q('SELECT * FROM classes WHERE id=?',id);requireThat(row,404,'CLASS_NOT_FOUND','教学班不存在');return row;}
 // 教师是否被授权该教学班：主讲教师、班级助教/协同教师、课程负责人。
 function classAccess(user,classId){
  const cls=classById(classId);
  const staff=q('SELECT role FROM class_staff WHERE class_id=? AND user_id=?',classId,user.id);
  const courseMember=q('SELECT role FROM course_members WHERE course_id=? AND user_id=?',cls.course_id,user.id);
  const isCourseOwner=courseMember?.role==='owner';
  const isTeacher=cls.teacher_id===user.id;
  const isStaff=Boolean(staff);
  requireThat(isTeacher||isStaff||isCourseOwner,403,'CLASS_FORBIDDEN','你没有这个教学班的操作权限');
  return {class:cls,role:isTeacher||isCourseOwner?'owner':staff.role,isCourseOwner};
 }
 // 学生是否是该班在册成员（离班后保留历史证据，但不再开放新任务）
 function studentInClass(user,classId){
  const row=q('SELECT * FROM class_members WHERE class_id=? AND student_id=? AND status!=\'archived\'',classId,user.id);
  return row||null;
 }
 function classMembers(classId){
  return all(`SELECT m.student_id AS studentId,m.student_no AS studentNo,m.display_name AS displayName,m.group_name AS groupName,m.status,u.username,u.name
   FROM class_members m JOIN users u ON u.id=m.student_id WHERE m.class_id=? ORDER BY m.student_no,m.display_name`,classId);
 }
 function memberSummary(classId){
  const rows=classMembers(classId);
  const published=all("SELECT id FROM tasks WHERE class_id=? AND status='published'",classId);
  const taskIds=published.map(t=>t.id);
  const counts={};
  for(const t of taskIds){
   const stats=q('SELECT COUNT(DISTINCT student_id) AS n FROM submissions WHERE task_id=? AND status<>\'draft\'',t);
   counts[t.id]=stats?.n||0;
  }
  return rows.map(r=>{
   const submits=taskIds.map(tid=>q('SELECT status,score,released FROM submissions WHERE task_id=? AND student_id=? ORDER BY attempt DESC LIMIT 1',tid,r.studentId)).filter(Boolean);
   const graded=submits.filter(s=>s.status==='graded');
   const released=submits.filter(s=>s.released===1);
   return {...r,tasksTotal:taskIds.length,submitted:submits.length,graded:graded.length,released:released.length,
    average:released.length?Math.round(released.reduce((s,x)=>s+(x.score||0),0)/released.length*100)/100:null};
  });
 }
 function taskPayload(row,{includeRubric=true}={}){
  const rubric=includeRubric?normalizeRubric(safeParse(row.rubric_json,[])).rubric:[];
  return {id:row.id,classId:row.class_id,courseId:row.course_id,courseRevision:row.course_revision,
   title:row.title,description:row.description,type:row.type,lessonId:row.lesson_id,labId:row.lab_id,
   ideologicalNote:row.ideological_note,rubric,maxScore:row.max_score,weight:row.weight,
   opensAt:row.opens_at,dueAt:row.due_at,allowLate:!!row.allow_late,allowResubmit:!!row.allow_resubmit,
   maxAttempts:row.max_attempts,status:row.status,publishedAt:row.published_at,
   outcomes:all('SELECT outcome_id AS outcomeId,contribution FROM task_outcomes WHERE task_id=?',row.id)};
 }
 function safeParse(text,fallback){try{const v=JSON.parse(text);return v??fallback;}catch{return fallback;}}
 // 实验是否通过只看实验自带的检测结果（check_result），与教师给出的分数无关。
 // 约定：{passed:boolean} 优先；否则看 checks 全部通过；否则看通过项数是否达到总数。
 // 没有检测结果一律记为"未通过"，并单独标记 experimentChecked=false，避免把"没检测"说成"没通过"。
 function experimentRulePassed(checkResult){
  if(!checkResult||typeof checkResult!=='object')return false;
  if(checkResult.passed===true)return true;
  if(checkResult.passed===false)return false;
  const checks=Array.isArray(checkResult.checks)?checkResult.checks:[];
  if(checks.length)return checks.every(item=>item&&(item.ok===true||item.passed===true));
  const total=Number(checkResult.total??checkResult.checkCount);
  const passed=Number(checkResult.passedCount??checkResult.okCount);
  if(Number.isFinite(total)&&total>0&&Number.isFinite(passed))return passed>=total;
  return false;
 }
 function experimentCheckedOf(checkResult){
  if(!checkResult||typeof checkResult!=='object')return false;
  if(typeof checkResult.passed==='boolean')return true;
  if(Array.isArray(checkResult.checks)&&checkResult.checks.length)return true;
  return Number.isFinite(Number(checkResult.total??checkResult.checkCount));
 }
 // 课程里真实存在的学习单元集合，用于拒绝不存在的 lesson 标识。
 // 优先读草稿；草稿没有章节时回退到已发布快照。
 function collectLessonIds(course){
  const ids=new Set();
  const chapters=[...(Array.isArray(course?.chapters)?course.chapters:[]),...(Array.isArray(course?.curriculum?.optionalChapters)?course.curriculum.optionalChapters:[])];
  for(const chapter of chapters)for(const lesson of chapter?.lessons||[])if(lesson?.id)ids.add(lesson.id);
  return ids;
 }
 function courseLessonIds(courseId){
  const row=q('SELECT draft_json,published_revision FROM courses WHERE id=?',courseId);
  const draft=safeParse(row?.draft_json,{});
  const ids=collectLessonIds(draft);
  if(ids.size)return ids;
  if(row?.published_revision!=null){
   const snapshot=q('SELECT payload FROM published_versions WHERE course_id=? AND revision=?',courseId,row.published_revision);
   return collectLessonIds(safeParse(snapshot?.payload,{}));
  }
  return ids;
 }
 // 课程目标：优先读课程草稿（教师正在编辑的那份），草稿没登记时回退到已保存的目标表。
// 报告与任务关联都用这一份，避免两处口径不一致。
function courseOutcomes(courseId){
 const row=q('SELECT draft_json,revision,published_revision FROM courses WHERE id=?',courseId);
 const draft=safeParse(row?.draft_json,{});
 const list=Array.isArray(draft.outcomes)?draft.outcomes.filter(o=>o&&o.id):[];
 if(list.length)return list.map(o=>({id:o.id,code:o.code||'',description:o.description||'',type:o.type||'knowledge'}));
 const revision=row?.published_revision??row?.revision??0;
 return all('SELECT id,code,description,type FROM course_outcomes WHERE course_id=? AND revision=? ORDER BY code',courseId,revision);
}
function classSummary(row,userId){
  const members=memberSummary(row.id);
  const published=all("SELECT * FROM tasks WHERE class_id=? AND status='published'",row.id);
  const weightTotal=Math.round(published.reduce((s,t)=>s+t.weight,0)*100)/100;
  // courses 表只存 draft_json，课程标题在草稿 JSON 内。
  const course=q('SELECT draft_json FROM courses WHERE id=?',row.course_id);
  const courseTitle=safeParse(course?.draft_json,{}).title||'';
  return {id:row.id,courseId:row.course_id,courseTitle,name:row.name,status:row.status,
   publishedRevision:row.published_revision,createdAt:row.created_at,
   membersCount:members.length,tasksTotal:published.length,tasksDraft:all('SELECT id FROM tasks WHERE class_id=? AND status=\'draft\'',row.id).length,
   weightTotal};
 }
 // 班级学情：四种完成口径分列，分母只含本班已下发任务。
 // 四口径互不替代：自报已学（学生自述）、视频结束（客户端观测）、
 // 实验通过（规则检测+教师确认有分数）、教师确认（教师已批阅）。
 function analytics(classId){
  const cls=classById(classId);
  const members=classMembers(classId).filter(m=>m.status!=='archived');
  const tasks=all("SELECT * FROM tasks WHERE class_id=? AND status='published' ORDER BY created_at",classId);
  const denominator=tasks.length;
  const rows=members.map(m=>{
   const perTask=tasks.map(t=>{
    const submits=all('SELECT * FROM submissions WHERE task_id=? AND student_id=? ORDER BY attempt',t.id,m.studentId);
    const formal=submits.filter(s=>s.status!=='draft');
    const latest=formal[formal.length-1]||null;
    const selfReported=all("SELECT 1 AS n FROM learning_events WHERE actor_id=? AND object_id=? AND verb='self_reported' LIMIT 1",m.studentId,t.id).length>0;
    const videoEnded=t.lesson_id?all("SELECT 1 AS n FROM learning_events WHERE actor_id=? AND object_type='lesson' AND object_id=? AND verb='ended' LIMIT 1",m.studentId,t.lesson_id).length>0:false;
    const checkResults=formal.map(s=>safeParse(s.check_result,null)).filter(Boolean);
    const experimentPassed=checkResults.some(experimentRulePassed);
    const experimentChecked=checkResults.some(experimentCheckedOf);
    const teacherConfirmed=formal.some(s=>s.status==='graded');
    return {taskId:t.id,title:t.title,maxScore:t.max_score,weight:t.weight,attempts:formal.length,
     submitted:formal.length>0,latestAttempt:latest?.attempt??0,score:latest?.score??null,released:latest?.released===1,
     statuses:{selfReported,videoEnded,experimentPassed,experimentChecked,teacherConfirmed}};
   });
   const confirmed=perTask.filter(t=>t.statuses.teacherConfirmed).length;
   const released=perTask.filter(t=>t.released);
   // 课程总评：各任务归一百分制按第二层权重（task.weight）加权。
   const total=courseTotal(perTask.map(t=>({normalized:t.released&&t.score!=null?Math.min(100,Number(t.score)/t.maxScore*100):null,weight:t.weight})));
   return {studentId:m.studentId,studentNo:m.studentNo,name:m.displayName,username:m.username,groupName:m.groupName,
    tasksTotal:denominator,submittedCount:perTask.filter(t=>t.submitted).length,confirmedCount:confirmed,
    releasedCount:released.length,
    average:released.length?Math.round(released.reduce((s,t)=>s+(t.score||0),0)/released.length*100)/100:null,
    courseTotal:total.total,weightTotal:total.weightTotal,weightComplete:total.complete,
    tasks:perTask};
  });
 const weightTotal=Math.round(tasks.reduce((s,t)=>s+t.weight,0)*100)/100;
 // tasks 一并返回，供前端画权重环与任务维度对照图，避免前端从学生记录里反推。
 return {classId,className:cls.name,denominator,weightTotal,
  weightComplete:Math.abs(weightTotal-100)<0.001,
  tasks:tasks.map(t=>({id:t.id,title:t.title,type:t.type,maxScore:t.max_score,weight:t.weight,status:t.status})),
  note:'分母仅含本班已下发任务；缺失记录不计为完成，也未下发任务不计入分母。',
  students:rows};
 }
 function csvCell(value){const text=String(value??'');return /[",\n\r]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;}
 function gradeCsv(classId){
  const cls=classById(classId);
  const members=classMembers(classId);
  const tasks=all("SELECT * FROM tasks WHERE class_id=? AND status='published' ORDER BY created_at",classId);
  const header=['学号','姓名','账号','分组',...tasks.map(t=>`${t.title}(满分${t.max_score})`),'已提交','已批阅','平均分'];
  const lines=[header.map(csvCell).join(',')];
  for(const m of members){
   const cells=[m.studentNo,m.displayName,m.username,m.groupName||''];
   let submitted=0,graded=0;const scores=[];
   for(const t of tasks){
    const list=all('SELECT * FROM submissions WHERE task_id=? AND student_id=? ORDER BY attempt',t.id,m.studentId).filter(s=>s.status!=='draft');
    const latest=list[list.length-1]||null;
    if(latest){submitted++;if(latest.status==='graded')graded++;if(latest.released===1)scores.push(Number(latest.score)||0);}
    cells.push(latest?String(latest.score??''):'未提交');
   }
   cells.push(String(submitted),String(graded),scores.length?String(Math.round(scores.reduce((a,b)=>a+b,0)/scores.length*100)/100):'');
   lines.push(cells.map(csvCell).join(','));
  }
  return {filename:`${cls.name}-成绩导出.csv`,content:'\ufeff'+lines.join('\r\n')};
 }

 // ===== 成绩复核 =====
// 复核只针对「已批阅且已发布」的成绩；改分必须同时重算分项，
// 让页面、总评、CSV 导出读的是同一份数据，不出现分项与总分对不上。
function appealPayload(row){
 return {id:row.id,submissionId:row.submission_id,taskId:row.task_id,taskTitle:row.taskTitle||'',
  studentId:row.student_id,studentNo:row.studentNo||'',displayName:row.displayName||'',
  reason:row.reason,status:row.status,decision:row.decision,decisionNote:row.decision_note,
  beforeScore:row.before_score,afterScore:row.after_score,createdAt:row.created_at,
  resolvedAt:row.resolved_at,resolvedBy:row.resolved_by};
}

// ===== 课程质量报告 =====
// 报告只汇总真实数据：目标达成来自任务—目标关联与已发布成绩，
// 证据材料来自提交、检测、改分、复核、干预记录，不生成估算值。
function classReport(classId){
 const cls=classById(classId);
 const analyticsData=analytics(classId);
 const course=q('SELECT draft_json FROM courses WHERE id=?',cls.course_id);
 const draft=safeParse(course?.draft_json,{});
 const outcomes=courseOutcomes(cls.course_id);
 const links=all('SELECT task_id AS taskId,outcome_id AS outcomeId,contribution FROM task_outcomes');
 const tasks=all("SELECT * FROM tasks WHERE class_id=? AND status='published' ORDER BY created_at",classId);
 const liveTasks=tasks.filter(t=>t.status==='published');

 const scoreRows=[];
 for(const t of liveTasks){
  const rows=all("SELECT score,released FROM submissions WHERE task_id=? AND status='graded'",t.id);
  const released=rows.filter(r=>r.released===1);
  if(released.length)scoreRows.push({taskId:t.id,title:t.title,weight:t.weight,
   average:Math.round(released.reduce((sum,r)=>sum+Number(r.score||0),0)/released.length*100)/100,
   normalized:Math.round(released.reduce((sum,r)=>sum+Number(r.score||0)/Number(t.max_score||1)*100,0)/released.length*100)/100,
   count:released.length});
 }
 const averages=analyticsData.students.map(s=>s.average).filter(v=>v!=null).sort((a,b)=>a-b);
 const totals=analyticsData.students.map(s=>s.courseTotal).filter(v=>v!=null);
 const median=list=>list.length?(list.length%2?list[(list.length-1)/2]:(list[list.length/2-1]+list[list.length/2])/2):null;

 const outcomeRows=outcomes.map(o=>{
  const related=links.filter(l=>l.outcomeId===o.id&&liveTasks.some(t=>t.id===l.taskId));
  const parts=related.map(l=>{
   const stat=scoreRows.find(r=>r.taskId===l.taskId);
   return stat?{taskId:l.taskId,title:stat.title,weight:Number(l.contribution)||Number(stat.weight)||1,normalized:stat.normalized,count:stat.count}:null;
  }).filter(Boolean);
  const weightSum=parts.reduce((sum,p)=>sum+p.weight,0);
  const achieved=weightSum?Math.round(parts.reduce((sum,p)=>sum+p.normalized*p.weight,0)/weightSum*100)/100:null;
  return {id:o.id,code:o.code,description:o.description,type:o.type,
   linked:related.length>0,achieved,tasks:parts};
 });

 const submissionsTotal=q("SELECT COUNT(*) AS n FROM submissions s JOIN tasks t ON t.id=s.task_id WHERE t.class_id=? AND s.status<>'draft'",classId)?.n||0;
 const evidence=[
  {kind:'submission',label:'正式提交',count:submissionsTotal,note:'学生提交的实验场景与说明'},
  {kind:'check',label:'实验检测记录',count:q("SELECT COUNT(*) AS n FROM submissions s JOIN tasks t ON t.id=s.task_id WHERE t.class_id=? AND s.check_result IS NOT NULL",classId)?.n||0,note:'实验台自动检测的规则通过情况'},
  {kind:'graded',label:'已批阅',count:q("SELECT COUNT(*) AS n FROM submissions s JOIN tasks t ON t.id=s.task_id WHERE t.class_id=? AND s.status='graded'",classId)?.n||0,note:'按量规维度评分'},
  {kind:'revision',label:'改分留痕',count:q("SELECT COUNT(*) AS n FROM score_revisions r JOIN submissions s ON s.id=r.submission_id JOIN tasks t ON t.id=s.task_id WHERE t.class_id=?",classId)?.n||0,note:'每次改分都有理由与操作人'},
  {kind:'appeal',label:'成绩复核',count:q("SELECT COUNT(*) AS n FROM grade_appeals WHERE class_id=?",classId)?.n||0,note:'学生申请与教师处理记录'},
  {kind:'intervention',label:'辅导记录',count:q("SELECT COUNT(*) AS n FROM interventions WHERE class_id=?",classId)?.n||0,note:'预警后的干预与结案'},
 ];
 const improvements=all(`SELECT i.id,i.kind,i.note,i.actor,i.at,i.closed_at AS closedAt,m.display_name AS displayName
  FROM interventions i JOIN class_members m ON m.student_id=i.student_id AND m.class_id=i.class_id
  WHERE i.class_id=? ORDER BY i.at DESC`,classId);
 const risks=analyticsData.students.filter(s=>{
  const confirmedRatio=s.tasksTotal?s.confirmedCount/s.tasksTotal:0;
  return (s.average!=null&&s.average<60)||(s.tasksTotal>0&&confirmedRatio<0.5);
 }).map(s=>({studentId:s.studentId,name:s.name,studentNo:s.studentNo,
  reason:s.average!=null&&s.average<60?'平均分低于 60':'已完成任务不足一半',
  average:s.average,confirmed:s.confirmedCount,tasksTotal:s.tasksTotal}));

 return {
  classId,className:cls.name,courseTitle:draft.title||'',generatedAt:stamp(),
  totals:{students:analyticsData.students.length,tasks:liveTasks.length,
   weightTotal:analyticsData.weightTotal,weightComplete:analyticsData.weightComplete,
   submitted:submissionsTotal,graded:evidence.find(e=>e.kind==='graded').count},
  score:{average:averages.length?Math.round(averages.reduce((a,b)=>a+b,0)/averages.length*100)/100:null,
   median:median(averages),max:averages.length?averages[averages.length-1]:null,min:averages.length?averages[0]:null,
   passRate:averages.length?Math.round(averages.filter(v=>v>=60).length/averages.length*10000)/100:null,
   courseAverage:totals.length?Math.round(totals.reduce((a,b)=>a+b,0)/totals.length*100)/100:null},
  outcomes:outcomeRows,evidence,improvements,risks,
  note:'目标达成按任务在总评中的占比加权；无关联任务的目标记为空，不用估算值填充。',
 };
}

const routes=[
  // ===== 学期 =====
  ['POST','/api/teaching/terms',async(ctx)=>{
   const user=needUser(ctx.session);requireThat(user.global_role!=='student',403,'FORBIDDEN','学生账号不能管理学期');
   const body=await bodyOf(ctx.req);const term=validateTerm(body);const id='term-'+randomUUID();
   transaction(()=>{run('INSERT INTO terms VALUES(?,?,?,?,?)',id,term.name,term.startDate,term.endDate,stamp());audit(user,'term.created',id);});
   ctx.json(201,{term:{id,name:term.name,startDate:term.startDate,endDate:term.endDate}});
  }],
  ['GET','/api/teaching/terms',async(ctx)=>{
   const user=needUser(ctx.session);requireThat(user.global_role!=='student',403,'FORBIDDEN','学生账号不能查看学期列表');
   ctx.json(200,{terms:all('SELECT id,name,start_date AS startDate,end_date AS endDate FROM terms ORDER BY created_at DESC')});
  }],

  // ===== 教学班 =====
  ['POST','/api/teaching/classes',async(ctx)=>{
   const user=needUser(ctx.session);requireThat(user.global_role!=='student',403,'FORBIDDEN','学生账号不能创建教学班');
   const body=await bodyOf(ctx.req);const data=validateClass(body);
   const course=q('SELECT * FROM courses WHERE id=?',body.courseId);requireThat(course,404,'NOT_FOUND','课程不存在');
   const member=q('SELECT role FROM course_members WHERE course_id=? AND user_id=?',course.id,user.id);
   requireThat(member&&['owner','teacher'].includes(member.role),403,'FORBIDDEN','只有课程负责人或教师可以开班');
   const teacherId=member.role==='owner'&&data.teacherUsername?user.id:user.id;
   const id='class-'+randomUUID();
   transaction(()=>{
    run('INSERT INTO classes(id,course_id,term_id,name,teacher_id,published_revision,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
     id,course.id,data.termId,data.name,teacherId,data.publishedRevision,'active',stamp(),stamp());
    audit(user,'class.created',id);
   });
   ctx.json(201,{class:classSummary(classById(id),user.id)});
  }],
  ['GET','/api/teaching/classes',async(ctx)=>{
   const user=needUser(ctx.session);requireThat(user.global_role!=='student',403,'FORBIDDEN','学生账号不能查看教学班列表');
   const rows=all(`SELECT c.* FROM classes c
    WHERE c.teacher_id=? OR EXISTS(SELECT 1 FROM class_staff s WHERE s.class_id=c.id AND s.user_id=?)
      OR EXISTS(SELECT 1 FROM course_members m WHERE m.course_id=c.course_id AND m.user_id=? AND m.role='owner')
    ORDER BY c.created_at DESC`,user.id,user.id,user.id);
   ctx.json(200,{classes:rows.map(r=>classSummary(r,user.id))});
  }],
  ['GET','/api/teaching/classes/:id',async(ctx)=>{
   const user=needUser(ctx.session);const access=classAccess(user,ctx.params.id);
   const cls=access.class;
   ctx.json(200,{class:{...classSummary(cls,user.id),courseRevision:cls.published_revision},
    role:access.role,
    members:memberSummary(cls.id),
    tasks:all('SELECT * FROM tasks WHERE class_id=? ORDER BY created_at DESC',cls.id).map(t=>taskPayload(t)),
    outcomes:courseOutcomes(cls.course_id),
    staff:all(`SELECT u.id,u.username,u.name,s.role FROM class_staff s JOIN users u ON u.id=s.user_id WHERE s.class_id=?`,cls.id)});
  }],

  // ===== 名单导入（预览 + 提交） =====
  ['POST','/api/teaching/classes/:id/roster/preview',async(ctx)=>{
   const user=needUser(ctx.session);const access=classAccess(user,ctx.params.id);
   requireThat(access.role==='owner',403,'FORBIDDEN','只有班负责人可以导入名单');
   const body=await bodyOf(ctx.req);const {rows,errors}=validateRoster(body);
   const existing=new Set(classMembers(ctx.params.id).map(m=>m.username));
   const seen=new Set();const accepted=[],duplicated=[],unknown=[];
   for(const row of rows){
    if(existing.has(row.username)||seen.has(row.username)){duplicated.push(row);continue;}
    seen.add(row.username);
    const account=q('SELECT id,username,name,global_role FROM users WHERE username=? AND active=1',row.username);
    if(!account){unknown.push(row);continue;}
    accepted.push({...row,userId:account.id,globalRole:account.global_role});
   }
   ctx.json(200,{accepted,duplicated,unknown,errors,
    note:'重复项不会再次入班；找不到账号的行需要先由平台管理员创建该账号。'});
  }],
  ['POST','/api/teaching/classes/:id/roster',async(ctx)=>{
   const user=needUser(ctx.session);const access=classAccess(user,ctx.params.id);
   requireThat(access.role==='owner',403,'FORBIDDEN','只有班负责人可以导入名单');
   const body=await bodyOf(ctx.req);const {rows,errors}=validateRoster(body);
   const existing=new Set(classMembers(ctx.params.id).map(m=>m.username));
   const added=[],skipped=[];const seen=new Set();
   transaction(()=>{
    for(const row of rows){
     if(existing.has(row.username)||seen.has(row.username)){skipped.push(row);continue;}
     seen.add(row.username);
     const account=q('SELECT id FROM users WHERE username=? AND active=1',row.username);
     if(!account){skipped.push(row);continue;}
     run('INSERT OR IGNORE INTO class_members(class_id,student_id,student_no,display_name,group_name,source,created_at) VALUES(?,?,?,?,?,?,?)',
      ctx.params.id,account.id,row.studentNo,row.displayName,row.groupName,'import',stamp());
     added.push({...row,userId:account.id});
    }
    audit(user,'class.roster.imported',ctx.params.id+':'+added.length);
   });
   ctx.json(200,{added,skipped,errors,members:memberSummary(ctx.params.id)});
  }],
  ['PATCH','/api/teaching/classes/:id/members/:studentId',async(ctx)=>{
   const user=needUser(ctx.session);const access=classAccess(user,ctx.params.id);
   requireThat(access.role==='owner',403,'FORBIDDEN','只有班负责人可以调整名单');
   const body=await bodyOf(ctx.req);
   const member=q('SELECT * FROM class_members WHERE class_id=? AND student_id=?',ctx.params.id,ctx.params.studentId);
   requireThat(member,404,'NOT_FOUND','该学生不在本班名单中');
   if(body.status!==undefined){
    requireThat(['active','archived'].includes(body.status),422,'INVALID_STATUS','名单状态无效');
    transaction(()=>{run('UPDATE class_members SET status=? WHERE class_id=? AND student_id=?',body.status,ctx.params.id,ctx.params.studentId);audit(user,'class.member.status',ctx.params.id+':'+ctx.params.studentId);});
   }
   if(body.groupName!==undefined){
    const group=typeof body.groupName==='string'?body.groupName.trim().slice(0,40):'';
    transaction(()=>{run('UPDATE class_members SET group_name=? WHERE class_id=? AND student_id=?',group||null,ctx.params.id,ctx.params.studentId);audit(user,'class.member.group',ctx.params.id+':'+ctx.params.studentId);});
   }
   ctx.json(200,{members:memberSummary(ctx.params.id)});
  }],
  ['POST','/api/teaching/classes/:id/staff',async(ctx)=>{
   const user=needUser(ctx.session);const access=classAccess(user,ctx.params.id);
   requireThat(access.role==='owner',403,'FORBIDDEN','只有班负责人可以配置助教');
   const body=await bodyOf(ctx.req);
   requireThat(typeof body.username==='string'&&['assistant','teacher'].includes(body.role),422,'INVALID_MEMBER','请选择成员账号和角色');
   const account=q('SELECT * FROM users WHERE username=? AND active=1',body.username.trim().toLowerCase());
   requireThat(account&&['assistant','teacher'].includes(account.global_role),422,'INVALID_MEMBER','成员须为启用的教师或助教账号');
   transaction(()=>{run('INSERT INTO class_staff VALUES(?,?,?) ON CONFLICT(class_id,user_id) DO UPDATE SET role=excluded.role',ctx.params.id,account.id,body.role);audit(user,'class.staff.changed',ctx.params.id+':'+account.id);});
   ctx.json(200,{staff:all(`SELECT u.id,u.username,u.name,s.role FROM class_staff s JOIN users u ON u.id=s.user_id WHERE s.class_id=?`,ctx.params.id)});
  }],

  // ===== 教学任务 =====
  ['POST','/api/teaching/classes/:id/tasks',async(ctx)=>{
   const user=needUser(ctx.session);const access=classAccess(user,ctx.params.id);
   requireThat(access.role==='owner',403,'FORBIDDEN','只有班负责人或授课教师可以下发任务');
   const body=await bodyOf(ctx.req);const data=validateTask(body);
   const cls=access.class;
   const course=q('SELECT * FROM courses WHERE id=?',cls.course_id);requireThat(course,404,'NOT_FOUND','课程不存在');
   const validOutcomes=new Set(courseOutcomes(cls.course_id).map(o=>o.id));
   const links=data.outcomeLinks.filter(link=>validOutcomes.has(link.outcomeId));
   requireThat(links.length===data.outcomeLinks.length,422,'INVALID_OUTCOME','关联了本课程不存在的目标');
   const id='task-'+randomUUID();
   transaction(()=>{
    run(`INSERT INTO tasks(id,class_id,course_id,course_revision,title,description,type,lesson_id,lab_id,ideological_note,rubric_json,max_score,weight,opens_at,due_at,allow_late,allow_resubmit,max_attempts,status,published_at,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
     id,cls.id,cls.course_id,cls.published_revision??course.revision,data.title,data.description,data.type,data.lessonId,data.labId,data.ideologicalNote,
     JSON.stringify(data.rubric),data.maxScore,data.weight,data.opensAt,data.dueAt,data.allowLate?1:0,data.allowResubmit?1:0,data.maxAttempts,'draft',null,stamp(),stamp());
    for(const link of links)run('INSERT OR REPLACE INTO task_outcomes VALUES(?,?,?)',id,link.outcomeId,link.contribution);
    for(const outcomeId of data.outcomeIds)if(!links.some(link=>link.outcomeId===outcomeId))run('INSERT OR IGNORE INTO task_outcomes VALUES(?,?,?)',id,outcomeId,0);
    audit(user,'task.created',id);
   });
   ctx.json(201,{task:taskPayload(q('SELECT * FROM tasks WHERE id=?',id))});
  }],
  ['PUT','/api/teaching/tasks/:id',async(ctx)=>{
   const user=needUser(ctx.session);
   const task=q('SELECT * FROM tasks WHERE id=?',ctx.params.id);requireThat(task,404,'NOT_FOUND','任务不存在');
   const access=classAccess(user,task.class_id);requireThat(access.role==='owner',403,'FORBIDDEN','只有班负责人或授课教师可以修改任务');
   requireThat(task.status==='draft',409,'TASK_LOCKED','已发布的任务不可修改，请新建任务或调整规则说明');
   const body=await bodyOf(ctx.req);const data=validateTask(body);
   const validOutcomes=new Set(courseOutcomes(access.class.course_id).map(o=>o.id));
   const links=data.outcomeLinks.filter(link=>validOutcomes.has(link.outcomeId));
   requireThat(links.length===data.outcomeLinks.length,422,'INVALID_OUTCOME','关联了本课程不存在的目标');
   transaction(()=>{
    run(`UPDATE tasks SET title=?,description=?,type=?,lesson_id=?,lab_id=?,ideological_note=?,rubric_json=?,max_score=?,weight=?,opens_at=?,due_at=?,allow_late=?,allow_resubmit=?,max_attempts=?,updated_at=? WHERE id=?`,
     data.title,data.description,data.type,data.lessonId,data.labId,data.ideologicalNote,JSON.stringify(data.rubric),data.maxScore,data.weight,
     data.opensAt,data.dueAt,data.allowLate?1:0,data.allowResubmit?1:0,data.maxAttempts,stamp(),ctx.params.id);
    run('DELETE FROM task_outcomes WHERE task_id=?',ctx.params.id);
    for(const link of links)run('INSERT OR REPLACE INTO task_outcomes VALUES(?,?,?)',ctx.params.id,link.outcomeId,link.contribution);
    for(const outcomeId of data.outcomeIds)if(!links.some(link=>link.outcomeId===outcomeId))run('INSERT OR IGNORE INTO task_outcomes VALUES(?,?,?)',ctx.params.id,outcomeId,0);
    audit(user,'task.updated',ctx.params.id);
   });
   ctx.json(200,{task:taskPayload(q('SELECT * FROM tasks WHERE id=?',ctx.params.id))});
  }],
  ['POST','/api/teaching/tasks/:id/publish',async(ctx)=>{
   const user=needUser(ctx.session);
   const task=q('SELECT * FROM tasks WHERE id=?',ctx.params.id);requireThat(task,404,'NOT_FOUND','任务不存在');
   const access=classAccess(user,task.class_id);requireThat(access.role==='owner',403,'FORBIDDEN','只有班负责人或授课教师可以发布任务');
   requireThat(task.status==='draft'||task.status==='withdrawn',409,'TASK_LOCKED','任务已发布，无需重复发布');
   const rubric=normalizeRubric(safeParse(task.rubric_json,[]));
   requireThat(!rubric.errors.length,422,'INVALID_RUBRIC','量规配置不完整',rubric.errors);
   const cls=access.class;const course=q('SELECT * FROM courses WHERE id=?',cls.course_id);
   const revision=cls.published_revision??course.published_revision??course.revision;
   transaction(()=>{
    run('UPDATE tasks SET status=\'published\',published_at=?,course_revision=?,updated_at=? WHERE id=?',stamp(),revision,stamp(),ctx.params.id);
    audit(user,'task.published',ctx.params.id+':'+revision);
   });
   ctx.json(200,{task:taskPayload(q('SELECT * FROM tasks WHERE id=?',ctx.params.id))});
  }],
  // 已发布/已撤回任务的规则调整：只动时间与提交规则，量规与满分锁定。
  // 这样「延期、开放补交、增加重做次数」不必重建任务，也不会让已交作业的评分标准变样。
  ['PATCH','/api/teaching/tasks/:id/rules',async(ctx)=>{
   const user=needUser(ctx.session);
   const task=q('SELECT * FROM tasks WHERE id=?',ctx.params.id);requireThat(task,404,'NOT_FOUND','任务不存在');
   const access=classAccess(user,task.class_id);requireThat(access.role==='owner',403,'FORBIDDEN','只有班负责人或授课教师可以调整任务规则');
   const body=await bodyOf(ctx.req);const data=validateTaskRules(body);
   const opensAt=data.opensAt===undefined?task.opens_at:data.opensAt;
   const dueAt=data.dueAt===undefined?task.due_at:data.dueAt;
   requireThat(!(opensAt&&dueAt&&Date.parse(opensAt)>Date.parse(dueAt)),422,'INVALID_RULES','截止时间不能早于开放时间');
   // 已提交次数不能因为调低上限而作废：上限不得低于学生已提交的次数。
   const maxUsed=q('SELECT MAX(attempt) AS n FROM submissions WHERE task_id=?',task.id)?.n||0;
   const maxAttempts=data.maxAttempts===undefined?task.max_attempts:data.maxAttempts;
   requireThat(maxAttempts>=maxUsed,409,'MAX_ATTEMPTS_TOO_LOW','重做上限不能低于已有提交次数（当前最高第 '+maxUsed+' 次）');
   transaction(()=>{
    run(`UPDATE tasks SET opens_at=?,due_at=?,allow_late=?,allow_resubmit=?,max_attempts=?,updated_at=? WHERE id=?`,
     opensAt,dueAt,data.allowLate===undefined?task.allow_late:data.allowLate?1:0,
     data.allowResubmit===undefined?task.allow_resubmit:data.allowResubmit?1:0,maxAttempts,stamp(),task.id);
    audit(user,'task.rules.updated',task.id+(data.note?':'+data.note:''));
   });
   ctx.json(200,{task:taskPayload(q('SELECT * FROM tasks WHERE id=?',task.id))});
  }],
  // 撤回：任务从学生端消失，但提交、评分与历史记录全部保留，可再次发布。
  ['POST','/api/teaching/tasks/:id/withdraw',async(ctx)=>{
   const user=needUser(ctx.session);
   const task=q('SELECT * FROM tasks WHERE id=?',ctx.params.id);requireThat(task,404,'NOT_FOUND','任务不存在');
   const access=classAccess(user,task.class_id);requireThat(access.role==='owner',403,'FORBIDDEN','只有班负责人或授课教师可以撤回任务');
   requireThat(task.status==='published',409,'TASK_NOT_PUBLISHED','只有已发布的任务可以撤回');
   const body=await bodyOf(ctx.req);
   const reason=typeof body?.reason==='string'?body.reason.trim():'';
   requireThat(reason.length>0&&reason.length<=500,422,'REASON_REQUIRED','撤回必须填写原因');
   transaction(()=>{
    run('UPDATE tasks SET status=\'withdrawn\',updated_at=? WHERE id=?',stamp(),task.id);
    audit(user,'task.withdrawn',task.id+':'+reason);
   });
   ctx.json(200,{task:taskPayload(q('SELECT * FROM tasks WHERE id=?',task.id)),reason});
  }],
  ['GET','/api/teaching/tasks/:id/submissions',async(ctx)=>{
   const user=needUser(ctx.session);
   const task=q('SELECT * FROM tasks WHERE id=?',ctx.params.id);requireThat(task,404,'NOT_FOUND','任务不存在');
   classAccess(user,task.class_id);
   const rows=all(`SELECT s.*,m.student_no AS studentNo,m.display_name AS displayName,m.group_name AS groupName
    FROM submissions s JOIN class_members m ON m.student_id=s.student_id AND m.class_id=?
    WHERE s.task_id=? ORDER BY m.student_no,s.attempt`,task.class_id,ctx.params.id);
   ctx.json(200,{task:taskPayload(task),submissions:rows.map(r=>({
    id:r.id,studentId:r.student_id,studentNo:r.studentNo,displayName:r.displayName,groupName:r.groupName,
    attempt:r.attempt,status:r.status,score:r.score,feedback:r.feedback,released:!!r.released,
    submittedAt:r.submitted_at,gradedAt:r.graded_at,checkResult:safeParse(r.check_result,null),    revisions:all('SELECT before_score AS beforeScore,after_score AS afterScore,reason,actor,at FROM score_revisions WHERE submission_id=? ORDER BY id',r.id)}))});
  }],

  // ===== 学生提交 =====
  ['POST','/api/teaching/tasks/:id/submissions',async(ctx)=>{
   const user=needUser(ctx.session);
   requireThat(user.global_role==='student',403,'FORBIDDEN','只有学生账号可以提交任务');
   const task=q('SELECT * FROM tasks WHERE id=?',ctx.params.id);requireThat(task,404,'NOT_FOUND','任务不存在');
   requireThat(task.status==='published',403,'TASK_CLOSED','该任务尚未发布或已关闭');
   const member=studentInClass(user,task.class_id);requireThat(member,403,'NOT_IN_CLASS','你不在这个教学班的名单中');
   const body=await bodyOf(ctx.req);const data=validateSubmission(body);
   const existing=q('SELECT * FROM submissions WHERE task_id=? AND student_id=? AND idempotency_key=?',task.id,user.id,data.idempotencyKey);
   // 幂等：同一幂等键重复提交只产生一个有效版本。
   if(existing){ctx.json(200,{submission:{id:existing.id,attempt:existing.attempt,status:existing.status,score:existing.score,released:!!existing.released,submittedAt:existing.submitted_at},duplicate:true});return;}
   const attempts=q('SELECT COUNT(*) AS n FROM submissions WHERE task_id=? AND student_id=?',task.id,user.id).n;
   // 注意：此处 task 是数据库原始行，列名为蛇形下划线。
   requireThat(task.allow_resubmit===1||attempts===0,409,'RESUBMIT_CLOSED','该任务不允许重做');
   requireThat(attempts<task.max_attempts,409,'MAX_ATTEMPTS','已达到该任务的最大重做次数');
   const now=Date.now();
   if(task.due_at&&task.allow_late!==1&&Date.parse(task.due_at)<now)requireThat(false,409,'DEADLINE_PASSED','已超过截止时间且不允许补交');
   if(task.opens_at&&Date.parse(task.opens_at)>now)requireThat(false,409,'NOT_OPEN','任务尚未开放');
   const attempt=attempts+1;const id='sub-'+randomUUID();const at=stamp();
   transaction(()=>{
    run(`INSERT INTO submissions(id,task_id,student_id,attempt,idempotency_key,scene_json,note,check_result,status,score,rubric_scores_json,feedback,submitted_at,graded_at,graded_by,released)
     VALUES(?,?,?,?,?,?,?,?,?,NULL,NULL,'',?,NULL,NULL,0)`,
     id,task.id,user.id,attempt,data.idempotencyKey,data.sceneJson,data.note,data.checkResult?JSON.stringify(data.checkResult):null,'submitted',at);
    for(const fileId of data.attachmentIds){const file=q('SELECT * FROM submission_files WHERE id=?',fileId);requireThat(file&&file.task_id===task.id&&file.student_id===user.id&&file.submission_id===null,422,'INVALID_ATTACHMENT','附件不存在、无权使用或已被提交');run('UPDATE submission_files SET submission_id=? WHERE id=?',id,fileId);}
    audit(user,'submission.created',id);
   });
   ctx.json(201,{submission:{id,attempt,status:'submitted',score:null,released:false,submittedAt:at}});
  }],
  ['GET','/api/teaching/submissions/:id',async(ctx)=>{
   const user=needUser(ctx.session),submission=q('SELECT * FROM submissions WHERE id=?',ctx.params.id);requireThat(submission,404,'NOT_FOUND','提交不存在');
   const task=q('SELECT * FROM tasks WHERE id=?',submission.task_id);requireThat(task,404,'NOT_FOUND','任务不存在');
   const own=user.global_role==='student'&&submission.student_id===user.id&&studentInClass(user,task.class_id);if(!own)classAccess(user,task.class_id);
   const files=all('SELECT id,original_name AS originalName,content_type AS contentType,bytes,created_at AS createdAt FROM submission_files WHERE submission_id=? ORDER BY created_at',submission.id);
   ctx.json(200,{submission:{id:submission.id,taskId:task.id,studentId:submission.student_id,attempt:submission.attempt,sceneJson:submission.scene_json,note:submission.note,checkResult:safeParse(submission.check_result,null),status:submission.status,files}});
  }],

  // ===== 量规批阅 =====
  ['POST','/api/teaching/submissions/:id/grade',async(ctx)=>{
   const user=needUser(ctx.session);
   const submission=q('SELECT * FROM submissions WHERE id=?',ctx.params.id);requireThat(submission,404,'NOT_FOUND','提交不存在');
   const task=q('SELECT * FROM tasks WHERE id=?',submission.task_id);requireThat(task,404,'NOT_FOUND','任务不存在');
   const access=classAccess(user,task.class_id);requireThat(access.role!=='assistant',403,'FORBIDDEN','助教当前不能批阅');
   const body=await bodyOf(ctx.req);const data=validateGrading(body);
   const rubric=normalizeRubric(safeParse(task.rubric_json,[])).rubric;
   const scored=scoreRubric(rubric,data.scores);
   requireThat(!scored.errors.length,422,'INVALID_SCORE','评分不合法',scored.errors);
   const before=submission.score;
   transaction(()=>{
    run('UPDATE submissions SET status=\'graded\',score=?,rubric_scores_json=?,feedback=?,graded_at=?,graded_by=?,released=? WHERE id=?',
     scored.total,JSON.stringify(scored.items),data.feedback,stamp(),user.id,data.released?1:0,ctx.params.id);
    if(before!==scored.total)run('INSERT INTO score_revisions(submission_id,before_score,after_score,before_json,after_json,reason,actor,at) VALUES(?,?,?,?,?,?,?,?)',
     ctx.params.id,before,scored.total,submission.rubric_scores_json,JSON.stringify(scored.items),'首次批阅',user.username,stamp());
    audit(user,'submission.graded',ctx.params.id);
   });
   ctx.json(200,{submission:{id:ctx.params.id,status:'graded',score:scored.total,normalized:scored.normalized,items:scored.items,feedback:data.feedback,released:data.released}});
  }],
  ['POST','/api/teaching/submissions/:id/revise',async(ctx)=>{
   const user=needUser(ctx.session);
   const submission=q('SELECT * FROM submissions WHERE id=?',ctx.params.id);requireThat(submission,404,'NOT_FOUND','提交不存在');
   const task=q('SELECT * FROM tasks WHERE id=?',submission.task_id);requireThat(task,404,'NOT_FOUND','任务不存在');
   const access=classAccess(user,task.class_id);requireThat(access.role==='owner',403,'FORBIDDEN','只有班负责人可以改分');
   const body=await bodyOf(ctx.req);const data=validateScoreRevision(body);
   requireThat(submission.status==='graded',409,'NOT_GRADED','尚未批阅的提交不能改分');
   const before=submission.score;
   // 改分必须同步分项：按新总分等比缩放，保证「总分 = 各分项之和」。
   const rubric=normalizeRubric(safeParse(task.rubric_json,[])).rubric;
   const maxTotal=rubric.reduce((sum,d)=>sum+d.maxScore,0);
   const existingItems=safeParse(submission.rubric_scores_json,[]);
   const rescale=data.score===null
    ?{items:(Array.isArray(existingItems)?existingItems:[]).map(it=>({...it,score:0})),total:0}
    :rescaleRubric(Array.isArray(existingItems)&&existingItems.length?existingItems:rubric.map(d=>({...d,score:0})),data.score,maxTotal);
   transaction(()=>{
    run('UPDATE submissions SET score=?,rubric_scores_json=?,graded_at=?,graded_by=?,released=? WHERE id=?',
     data.score===null?null:rescale.total,JSON.stringify(rescale.items),stamp(),user.id,data.score===null?0:1,ctx.params.id);
    run('INSERT INTO score_revisions(submission_id,before_score,after_score,before_json,after_json,reason,actor,at) VALUES(?,?,?,?,?,?,?,?)',
     ctx.params.id,before,data.score===null?null:rescale.total,submission.rubric_scores_json,JSON.stringify(rescale.items),data.reason,user.username,stamp());
    audit(user,'submission.revised',ctx.params.id);
   });
   ctx.json(200,{submission:{id:ctx.params.id,score:data.score===null?null:rescale.total,items:rescale.items,
    revisions:all('SELECT before_score AS beforeScore,after_score AS afterScore,reason,actor,at FROM score_revisions WHERE submission_id=? ORDER BY id',ctx.params.id)}});
  }],

  // ===== 成绩复核 =====
  // 学生只能对自己的、已批阅且已发布的成绩申请复核；同一提交同时只允许一条待处理申请。
  ['POST','/api/teaching/submissions/:id/appeal',async(ctx)=>{
   const user=needUser(ctx.session);
   requireThat(user.global_role==='student',403,'FORBIDDEN','只有学生可以申请复核');
   const submission=q('SELECT * FROM submissions WHERE id=?',ctx.params.id);requireThat(submission,404,'NOT_FOUND','提交不存在');
   requireThat(submission.student_id===user.id,403,'FORBIDDEN','只能对自己的提交申请复核');
   const task=q('SELECT * FROM tasks WHERE id=?',submission.task_id);requireThat(task,404,'NOT_FOUND','任务不存在');
   requireThat(studentInClass(user,task.class_id),403,'NOT_IN_CLASS','你不在这个教学班的名单中');
   requireThat(submission.status==='graded',409,'NOT_GRADED','尚未批阅，暂时不能申请复核');
   requireThat(submission.released===1,409,'NOT_RELEASED','成绩尚未发布，暂时不能申请复核');
   const existing=q("SELECT * FROM grade_appeals WHERE submission_id=? AND status='open'",submission.id);
   requireThat(!existing,409,'APPEAL_PENDING','这次提交已有待处理的复核申请');
   const body=await bodyOf(ctx.req);const data=validateAppeal(body);
   const id='apl-'+randomUUID();
   transaction(()=>{
    run('INSERT INTO grade_appeals(id,submission_id,class_id,task_id,student_id,reason,status,decision,decision_note,before_score,after_score,created_at,resolved_at,resolved_by) VALUES(?,?,?,?,?,?,?,NULL,\'\',?,NULL,?,NULL,NULL)',
     id,submission.id,task.class_id,task.id,user.id,data.reason,'open',submission.score,stamp());
    audit(user,'appeal.created',id);
   });
   ctx.json(201,{appeal:{id,status:'open',reason:data.reason,submissionId:submission.id,createdAt:stamp()}});
  }],
  ['GET','/api/teaching/student/appeals',async(ctx)=>{
   const user=needUser(ctx.session);
   requireThat(user.global_role==='student',403,'FORBIDDEN','该接口仅供学生使用');
   const rows=all(`SELECT a.*,t.title AS taskTitle FROM grade_appeals a JOIN tasks t ON t.id=a.task_id
    WHERE a.student_id=? ORDER BY a.created_at DESC`,user.id);
   ctx.json(200,{appeals:rows.map(appealPayload)});
  }],
  ['GET','/api/teaching/classes/:id/appeals',async(ctx)=>{
   const user=needUser(ctx.session);classAccess(user,ctx.params.id);
   const rows=all(`SELECT a.*,t.title AS taskTitle,m.student_no AS studentNo,m.display_name AS displayName
    FROM grade_appeals a JOIN tasks t ON t.id=a.task_id
    JOIN class_members m ON m.student_id=a.student_id AND m.class_id=a.class_id
    WHERE a.class_id=? ORDER BY CASE a.status WHEN 'open' THEN 0 ELSE 1 END,a.created_at DESC`,ctx.params.id);
   ctx.json(200,{appeals:rows.map(appealPayload)});
  }],
  // 处理复核：revise 走改分并重算分项，uphold 只留痕；两种情况都关闭申请。
  ['POST','/api/teaching/appeals/:id/resolve',async(ctx)=>{
   const user=needUser(ctx.session);
   const appeal=q('SELECT * FROM grade_appeals WHERE id=?',ctx.params.id);requireThat(appeal,404,'NOT_FOUND','复核申请不存在');
   const access=classAccess(user,appeal.class_id);requireThat(access.role!=='assistant',403,'FORBIDDEN','助教当前不能处理复核');
   requireThat(appeal.status==='open',409,'APPEAL_CLOSED','该复核申请已处理');
   const body=await bodyOf(ctx.req);const data=validateAppealDecision(body);
   const submission=q('SELECT * FROM submissions WHERE id=?',appeal.submission_id);requireThat(submission,404,'NOT_FOUND','提交不存在');
   const task=q('SELECT * FROM tasks WHERE id=?',submission.task_id);requireThat(task,404,'NOT_FOUND','任务不存在');
   let after=submission.score;
   if(data.decision==='revise'){
    const rubric=normalizeRubric(safeParse(task.rubric_json,[])).rubric;
    const maxTotal=rubric.reduce((sum,d)=>sum+d.maxScore,0);
    const existingItems=safeParse(submission.rubric_scores_json,[]);
    const rescale=rescaleRubric(Array.isArray(existingItems)&&existingItems.length?existingItems:rubric.map(d=>({...d,score:0})),data.score,maxTotal);
    requireThat(!rescale.error,422,'INVALID_SCORE',rescale.error||'改分无效');
    after=rescale.total;
    transaction(()=>{
     run('UPDATE submissions SET score=?,rubric_scores_json=?,graded_at=?,graded_by=?,released=1 WHERE id=?',rescale.total,JSON.stringify(rescale.items),stamp(),user.id,submission.id);
     run('INSERT INTO score_revisions(submission_id,before_score,after_score,before_json,after_json,reason,actor,at) VALUES(?,?,?,?,?,?,?,?)',
      submission.id,submission.score,rescale.total,submission.rubric_scores_json,JSON.stringify(rescale.items),'复核改分：'+(data.note||appeal.reason),user.username,stamp());
     run('UPDATE grade_appeals SET status=\'revised\',decision=?,decision_note=?,after_score=?,resolved_at=?,resolved_by=? WHERE id=?',
      data.decision,data.note,rescale.total,stamp(),user.username,appeal.id);
     audit(user,'appeal.revised',appeal.id);
    });
   }else{
    transaction(()=>{
     run('UPDATE grade_appeals SET status=\'upheld\',decision=?,decision_note=?,after_score=?,resolved_at=?,resolved_by=? WHERE id=?',
      data.decision,data.note,submission.score,stamp(),user.username,appeal.id);
     audit(user,'appeal.upheld',appeal.id);
    });
   }
   const row=q(`SELECT a.*,t.title AS taskTitle,m.student_no AS studentNo,m.display_name AS displayName
    FROM grade_appeals a JOIN tasks t ON t.id=a.task_id JOIN class_members m ON m.student_id=a.student_id AND m.class_id=a.class_id
    WHERE a.id=?`,appeal.id);
   ctx.json(200,{appeal:appealPayload(row),submission:{id:submission.id,score:after}});
  }],

  // ===== 实验模板 =====
  // 模板是课程级的可配置项：场景对象、脚本范围、检测规则、提示与版本号。
  // 读取对所有登录用户开放（实验台与教师预览都要用），写入限教师与管理员。
  ['GET','/api/teaching/labs',async(ctx)=>{
   const user=needUser(ctx.session);
   const rows=all('SELECT * FROM lab_templates');
   const byId=new Map(rows.map(r=>[r.lab_id,r]));
   ctx.json(200,{labs:LAB_IDS.map(id=>mergeTemplate(id,byId.get(id))).filter(Boolean),
    canEdit:['admin','teacher'].includes(user.global_role)});
  }],
  ['GET','/api/teaching/labs/:labId/template',async(ctx)=>{
   needUser(ctx.session);
   const labId=ctx.params.labId;
   const base=defaultTemplate(labId);requireThat(base,404,'LAB_NOT_FOUND','实验不存在');
   const row=q('SELECT * FROM lab_templates WHERE lab_id=?',labId);
   ctx.json(200,{template:mergeTemplate(labId,row),source:row?'customized':'default'});
  }],
  ['PUT','/api/teaching/labs/:labId/template',async(ctx)=>{
   const user=needUser(ctx.session);
   requireThat(['admin','teacher'].includes(user.global_role),403,'FORBIDDEN','只有教师或管理员可以修改实验模板');
   const labId=ctx.params.labId;
   requireThat(LAB_IDS.includes(labId),404,'LAB_NOT_FOUND','实验不存在');
   const body=await bodyOf(ctx.req);
   const result=validateLabTemplate(labId,body);
   requireThat(!result.errors.length,422,'INVALID_TEMPLATE','请检查模板配置',result.errors);
   const data=result.value;
   const existing=q('SELECT * FROM lab_templates WHERE lab_id=?',labId);
   // 版本号每次都递增：默认模板算 v1，第一次自定义即 v2，便于实验台与报告引用具体版本。
   const version=Math.max(Number(existing?.version??1)+1,Number(data.version)||1);
   transaction(()=>{
    run(`INSERT INTO lab_templates(lab_id,version,title,scene_json,scripts_json,checks_json,hints_json,updated_by,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?)
     ON CONFLICT(lab_id) DO UPDATE SET version=excluded.version,title=excluded.title,scene_json=excluded.scene_json,
      scripts_json=excluded.scripts_json,checks_json=excluded.checks_json,hints_json=excluded.hints_json,
      updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
     labId,version,data.title||defaultTemplate(labId).title,JSON.stringify(data.scene),JSON.stringify(data.scripts),
     JSON.stringify(data.checks),JSON.stringify(data.hints),user.username,stamp());
    audit(user,'lab.template.updated',labId+':v'+version);
   });
   ctx.json(200,{template:mergeTemplate(labId,q('SELECT * FROM lab_templates WHERE lab_id=?',labId))});
  }],

  // ===== 学情与导出 =====
  ['GET','/api/teaching/classes/:id/analytics',async(ctx)=>{
   const user=needUser(ctx.session);classAccess(user,ctx.params.id);
   ctx.json(200,analytics(ctx.params.id));
  }],
  ['GET','/api/teaching/classes/:id/export/grades',async(ctx)=>{
   const user=needUser(ctx.session);classAccess(user,ctx.params.id);
   const csv=gradeCsv(ctx.params.id);
   ctx.res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="grades.csv"','Cache-Control':'no-store'});
   ctx.res.end(csv.content);
  }],
  ['GET','/api/teaching/classes/:id/report',async(ctx)=>{
   const user=needUser(ctx.session);classAccess(user,ctx.params.id);
   ctx.json(200,classReport(ctx.params.id));
  }],
  // 质量报告导出为可打印 HTML：目标达成、成绩概览、证据材料、改进记录、风险名单一次带走。
  ['GET','/api/teaching/classes/:id/report/export',async(ctx)=>{
   const user=needUser(ctx.session);classAccess(user,ctx.params.id);
   const report=classReport(ctx.params.id);
   const esc=value=>String(value??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
   const pct=value=>value==null?'—':value+'%';
   const rows=report.outcomes.map(o=>`<tr><td>${esc(o.code)}</td><td>${esc(o.description)}</td><td>${o.linked?'<span class="ok">已关联</span>':'<span class="muted">未关联任务</span>'}</td><td class="num">${pct(o.achieved)}</td></tr>`).join('');
   const evidence=report.evidence.map(item=>`<li><strong>${esc(item.label)}</strong><span class="num">${item.count}</span><small>${esc(item.note)}</small></li>`).join('');
   const improvements=report.improvements.length?report.improvements.map(item=>`<li><strong>${esc(item.displayName)}</strong> · ${esc(item.kind)} · ${esc(item.note)}<small>${esc(item.actor)} · ${esc(item.at)}${item.closedAt?' · 已结案':' · 跟进中'}</small></li>`).join(''):'<li class="muted">本周期没有辅导记录。</li>';
   const risks=report.risks.length?report.risks.map(r=>`<tr><td>${esc(r.studentNo)}</td><td>${esc(r.name)}</td><td>${esc(r.reason)}</td><td class="num">${r.average==null?'—':r.average}</td><td class="num">${r.confirmed}/${r.tasksTotal}</td></tr>`).join(''):'<tr><td colspan="5" class="muted">暂无风险学生。</td></tr>';
   const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(report.className)} · 课程质量报告</title>
<style>
body{font:14px/1.7 "Microsoft YaHei",system-ui,sans-serif;color:#172c3e;max-width:920px;margin:40px auto;padding:0 24px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 10px;padding-bottom:6px;border-bottom:1px solid #e6ebef}
.meta{color:#71808e;font-size:12px}table{width:100%;border-collapse:collapse;margin:8px 0}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #eef2f4;vertical-align:top}
th{background:#f7f9fa;font-weight:600;font-size:12px;color:#52616e}
.num{text-align:right;font-variant-numeric:tabular-nums}
.cards{display:flex;gap:14px;flex-wrap:wrap;margin:12px 0}
.card{flex:1 1 150px;border:1px solid #e6ebef;border-radius:10px;padding:12px 14px}
.card span{display:block;font-size:12px;color:#71808e}.card strong{font-size:22px}
ul{list-style:none;padding:0;margin:0}li{padding:8px 0;border-bottom:1px solid #f2f5f6}
li small{display:block;color:#71808e;font-size:12px}li .num{float:right;font-weight:700}
.ok{color:#087f70}.muted{color:#a8bcc7}
@media print{body{margin:0}h2{page-break-after:avoid}}
</style></head><body>
<h1>${esc(report.className)} · 课程质量报告</h1>
<p class="meta">${esc(report.courseTitle)} · 生成时间 ${esc(report.generatedAt)} · 数据来源：平台真实提交与批阅记录</p>
<div class="cards">
<div class="card"><span>在册学生</span><strong>${report.totals.students}</strong></div>
<div class="card"><span>已下发任务</span><strong>${report.totals.tasks}</strong></div>
<div class="card"><span>总评占比合计</span><strong>${report.totals.weightTotal}%</strong></div>
<div class="card"><span>班级平均分</span><strong>${report.score.average==null?'—':report.score.average}</strong></div>
<div class="card"><span>及格率</span><strong>${pct(report.score.passRate)}</strong></div>
</div>
<h2>一、课程目标达成</h2>
<table><thead><tr><th>编号</th><th>目标</th><th>任务关联</th><th class="num">达成度</th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="muted">本课程版本没有登记课程目标。</td></tr>'}</tbody></table>
<p class="meta">${esc(report.note)}</p>
<h2>二、过程证据材料</h2><ul>${evidence}</ul>
<h2>三、教学改进记录</h2><ul>${improvements}</ul>
<h2>四、需要关注的学生</h2>
<table><thead><tr><th>学号</th><th>姓名</th><th>原因</th><th class="num">平均分</th><th class="num">已确认</th></tr></thead><tbody>${risks}</tbody></table>
<p class="meta">本报告由课程平台自动生成，分数与达成度均可追溯到具体提交与批阅记录。</p>
</body></html>`;
   ctx.res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Disposition':`attachment; filename="report-${encodeURIComponent(report.className)}.html"`,'Cache-Control':'no-store'});
   ctx.res.end(html);
  }],
  ['POST','/api/teaching/classes/:id/interventions',async(ctx)=>{
   const user=needUser(ctx.session);const access=classAccess(user,ctx.params.id);
   requireThat(access.role!=='assistant',403,'FORBIDDEN','助教当前不能记录辅导');
   const body=await bodyOf(ctx.req);const data=validateIntervention(body);
   requireThat(typeof body.studentId==='string','422','INVALID_INTERVENTION','请选择学生');
   requireThat(q('SELECT 1 AS n FROM class_members WHERE class_id=? AND student_id=?',ctx.params.id,body.studentId),404,'NOT_FOUND','该学生不在本班');
   const id='itv-'+randomUUID();
   transaction(()=>{run('INSERT INTO interventions VALUES(?,?,?,?,?,?,?,?,NULL)',id,ctx.params.id,body.studentId,data.taskId,data.kind,data.note,user.username,stamp());audit(user,'intervention.created',id);});
   ctx.json(201,{intervention:{id,kind:data.kind,note:data.note,taskId:data.taskId,actor:user.username,at:stamp()}});
  }],
  ['GET','/api/teaching/classes/:id/interventions',async(ctx)=>{
   const user=needUser(ctx.session);classAccess(user,ctx.params.id);
   ctx.json(200,{interventions:all(`SELECT i.id,i.kind,i.note,i.task_id AS taskId,i.actor,i.at,i.closed_at AS closedAt,m.student_no AS studentNo,m.display_name AS displayName
    FROM interventions i JOIN class_members m ON m.student_id=i.student_id AND m.class_id=i.class_id WHERE i.class_id=? ORDER BY i.at DESC`,ctx.params.id)});
  }],

  // ===== 学习事件落库 =====
  // 可信度原则：事件必须能对回真实的班级与任务；来源与课程版本由服务端判定，
  // 学生只能上报客户端可观测的行为（打开/播放/保存/自报已学等），
  // "教师确认""评分""发布"这类受信动词只能由本班教师或助教上报。
  ['POST','/api/teaching/events',async(ctx)=>{
   const user=needUser(ctx.session);
   const body=await bodyOf(ctx.req);
   const list=Array.isArray(body?.events)?body.events:[];
   requireThat(list.length<=200,413,'TOO_MANY_EVENTS','一次最多上报200条事件');
   const isStudent=user.global_role==='student';
   const accepted=[],rejected=[];
   for(const raw of list){
    try{
     const verb=typeof raw?.verb==='string'?raw.verb:'';
     requireThat(CLIENT_VERBS.has(verb)||(!isStudent&&STAFF_VERBS.has(verb)),403,'VERB_NOT_ALLOWED',
       isStudent?'学生账号不能上报教师确认、评分等受信事件':'不支持的事件类型');
     requireThat(typeof raw?.idempotencyKey==='string'&&raw.idempotencyKey.length<=200,'422','BAD_KEY','事件缺少幂等键');
     requireThat(typeof raw?.objectId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(raw.objectId),'422','BAD_OBJECT','事件缺少有效的对象标识');
     const objectType=typeof raw?.objectType==='string'&&/^[a-z_]{2,40}$/.test(raw.objectType)?raw.objectType:'lesson';
     const classId=typeof raw?.classId==='string'&&raw.classId?raw.classId:null;
     requireThat(classId,422,'CLASS_REQUIRED','学习事件必须注明教学班');
     // 班级必须真实存在，且上报人确实属于该班（学生）或拥有该班权限（教师/助教）。
     const cls=q('SELECT * FROM classes WHERE id=?',classId);
     requireThat(cls,404,'CLASS_NOT_FOUND','教学班不存在');
     if(isStudent){
      requireThat(studentInClass(user,classId),403,'NOT_IN_CLASS','你不在这个教学班的名单中');
     }else{
      requireThat(user.global_role!=='student',403,'FORBIDDEN','学生账号不能为其他班级上报事件');
      classAccess(user,classId);
     }
     // 任务必须属于该班、且已下发；版本号取自任务或班级，不采用客户端自称的版本。
     // objectType=task 时允许只用 objectId 指代任务，避免客户端必须重复写两次标识。
     let taskId=typeof raw?.taskId==='string'&&raw.taskId?raw.taskId:null;
     if(!taskId&&objectType==='task')taskId=raw.objectId;
     let task=null;
     if(taskId){
      task=q('SELECT * FROM tasks WHERE id=?',taskId);
      requireThat(task,404,'TASK_NOT_FOUND','任务不存在');
      requireThat(task.class_id===classId,422,'TASK_CLASS_MISMATCH','该任务不属于这个教学班');
      requireThat(task.status==='published',409,'TASK_NOT_PUBLISHED','该任务尚未下发');
     }
     if(objectType==='task')requireThat(task&&task.id===raw.objectId,422,'OBJECT_MISMATCH','任务事件必须指向本班已下发的任务');
     if(objectType==='lesson')requireThat(courseLessonIds(cls.course_id).has(raw.objectId),422,'LESSON_NOT_FOUND','课程中不存在该学习单元');
     const eventId=typeof raw?.eventId==='string'&&/^[0-9a-f-]{36}$/i.test(raw.eventId)?raw.eventId:randomUUID();
     const payload=raw?.payload&&typeof raw.payload==='object'&&!Array.isArray(raw.payload)?raw.payload:{};
     requireThat(JSON.stringify(payload).length<=4000,413,'PAYLOAD_TOO_LARGE','事件证据过大');
     const occurredAt=typeof raw?.occurredAt==='string'&&!Number.isNaN(Date.parse(raw.occurredAt))?new Date(raw.occurredAt).toISOString():stamp();
     const dup=q('SELECT event_id FROM learning_events WHERE actor_id=? AND idempotency_key=?',user.id,raw.idempotencyKey);
     if(dup){rejected.push({key:raw.idempotencyKey,reason:'duplicate'});continue;}
     const courseVersionId=task?String(task.course_revision):(cls.published_revision!=null?String(cls.published_revision):'unknown');
     run(`INSERT INTO learning_events(event_id,idempotency_key,actor_id,class_id,task_id,verb,object_type,object_id,course_version_id,offering_id,occurred_at,source,payload_json,received_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      eventId,raw.idempotencyKey,user.id,classId,taskId,verb,objectType,raw.objectId,
      courseVersionId,classId,occurredAt,
      verb==='self_reported'?'self_reported':(isStudent?'client_observed':'teacher_recorded'),JSON.stringify(payload),stamp());
     accepted.push({eventId,key:raw.idempotencyKey});
    }catch(error){rejected.push({key:raw?.idempotencyKey??'',reason:error.code||'invalid'});}
   }
   ctx.json(202,{accepted,rejected});
  }],

  // ===== 学生端读取 =====
  ['GET','/api/teaching/student/records',async(ctx)=>{
   const user=needUser(ctx.session);
   requireThat(user.global_role==='student',403,'FORBIDDEN','该接口仅供学生使用');
   const courseId=typeof ctx.url.searchParams.get('course')==='string'?ctx.url.searchParams.get('course'):'';
   requireThat(courseId.length>0&&courseId.length<=100,'422','INVALID_COURSE','请指定课程');
   const row=q('SELECT state_json AS stateJson,updated_at AS updatedAt FROM learning_records WHERE user_id=? AND course_id=?',user.id,courseId);
   ctx.json(200,{record:row?{state:safeParse(row.stateJson,{}),updatedAt:row.updatedAt}:null,
    // 服务端已有记录时，客户端应以它为准，避免同浏览器切换账号造成串用。
    note:'学习记录按账号保存；切换账号后不会读取其他账号的进度与笔记。'});
  }],
  ['PUT','/api/teaching/student/records',async(ctx)=>{
   const user=needUser(ctx.session);
   requireThat(user.global_role==='student',403,'FORBIDDEN','该接口仅供学生使用');
   const body=await bodyOf(ctx.req);
   requireThat(typeof body.courseId==='string'&&body.courseId.length>0&&body.courseId.length<=100,'422','INVALID_COURSE','请指定课程');
   requireThat(body.state&&typeof body.state==='object'&&!Array.isArray(body.state),'422','INVALID_STATE','学习记录格式无效');
   const text=JSON.stringify(body.state);
   requireThat(text.length<=8_000_000,413,'STATE_TOO_LARGE','学习记录过大');
   const at=stamp();
   run('INSERT INTO learning_records(user_id,course_id,state_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,course_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at',user.id,body.courseId,text,at);
   ctx.json(200,{saved:true,updatedAt:at});
  }],
  ['GET','/api/teaching/student/tasks',async(ctx)=>{
   const user=needUser(ctx.session);
   requireThat(user.global_role==='student',403,'FORBIDDEN','该接口仅供学生使用');
   const rows=all(`SELECT t.*,c.name AS className FROM tasks t JOIN class_members m ON m.class_id=t.class_id AND m.student_id=?
    JOIN classes c ON c.id=t.class_id WHERE t.status='published' AND m.status!='archived' ORDER BY t.opens_at IS NULL,t.opens_at,t.created_at DESC`,user.id);
   ctx.json(200,{tasks:rows.map(t=>({...taskPayload(t),className:t.className,
    // 未发布的批阅结果只能表明"老师已批阅"，分数与评语一律不下发，避免通过接口读到未公开成绩。
    mySubmissions:all('SELECT id,attempt,status,score,released,submitted_at AS submittedAt,feedback FROM submissions WHERE task_id=? AND student_id=? ORDER BY attempt',t.id,user.id)
     .map(s=>({id:s.id,attempt:s.attempt,status:s.status,released:s.released===1,
      score:s.released===1?s.score:null,submittedAt:s.submittedAt,feedback:s.released===1?s.feedback:''}))}))});
  }],
  ['GET','/api/teaching/student/submissions',async(ctx)=>{
   const user=needUser(ctx.session);
   requireThat(user.global_role==='student',403,'FORBIDDEN','该接口仅供学生使用');
   const rows=all(`SELECT s.*,t.title AS taskTitle,t.max_score AS maxScore,t.class_id AS classId FROM submissions s JOIN tasks t ON t.id=s.task_id
    JOIN class_members m ON m.class_id=t.class_id AND m.student_id=? WHERE s.student_id=? AND m.status!='archived' ORDER BY s.submitted_at DESC`,user.id,user.id);
   ctx.json(200,{submissions:rows.map(r=>({id:r.id,taskId:r.task_id,taskTitle:r.taskTitle,classId:r.classId,attempt:r.attempt,
    status:r.status,score:r.released===1?r.score:null,maxScore:r.maxScore,
    released:r.released===1,feedback:r.released===1?r.feedback:'',submittedAt:r.submitted_at,
    rubric:normalizeRubric(safeParse(q('SELECT rubric_json FROM tasks WHERE id=?',r.task_id)?.rubric_json||'[]',[])).rubric,
    myScores:r.released===1?safeParse(r.rubric_scores_json,[]):[],
    // 复核状态：学生需要知道自己是否已在复核中、上次复核的结论。
    appeal:(()=>{const a=q('SELECT id,status,decision,decision_note AS decisionNote,created_at AS createdAt,resolved_at AS resolvedAt FROM grade_appeals WHERE submission_id=? ORDER BY created_at DESC LIMIT 1',r.id);
     return a?{id:a.id,status:a.status,decision:a.decision,decisionNote:a.decisionNote,createdAt:a.createdAt,resolvedAt:a.resolvedAt}:null;})()}))});
  }],
  ['GET','/api/teaching/student/classes',async(ctx)=>{
   const user=needUser(ctx.session);
   requireThat(user.global_role==='student',403,'FORBIDDEN','该接口仅供学生使用');
   const rows=all(`SELECT c.id,c.name,t.name AS termName FROM class_members m JOIN classes c ON c.id=m.class_id LEFT JOIN terms t ON t.id=c.term_id
    WHERE m.student_id=? AND m.status!='archived'`,user.id);
   ctx.json(200,{classes:rows});
  }],
 ];

 return async function handle(ctx){
  for(const [method,pattern,handler] of routes){
   if(ctx.method!==method)continue;
   const names=[];const regex=new RegExp('^'+pattern.replace(/:([A-Za-z]+)/g,(m,n)=>{names.push(n);return '([^/]+)';})+'$');
   const match=regex.exec(ctx.pathname);if(!match)continue;
   const params={};names.forEach((n,i)=>params[n]=decodeURIComponent(match[i+1]));
   await handler({...ctx,params});
   return true;
  }
  return false;
 };
}
