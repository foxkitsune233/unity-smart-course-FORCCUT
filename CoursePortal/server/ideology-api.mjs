// 课程思政育人成效证据链（TC21）。
// 链条：思政目标 → 已发布案例 → 任务量规评分点 → 学生提交（作品）→ 分项分数/评语。
// 证据一律锚定真实的 submissions 与 rubric_scores_json，不按点击量或说明文字认定育人成效。
import {randomUUID} from 'node:crypto';
import {requireThat} from './validation.mjs';

export function createIdeologyApi({q,all,run,transaction,audit,needUser,bodyOf}){
 const stamp=()=>new Date().toISOString();
 const text=(v,max=4000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
 const safeId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
 const safeCode=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(v.trim())&&!['__proto__','constructor','prototype'].includes(v.trim());
 const parseCase=row=>{try{return {...JSON.parse(row.payload),id:row.id,courseId:row.course_id};}catch{return {id:row.id,courseId:row.course_id,title:'',content:''};}};

 function classOf(classId){const c=q('SELECT * FROM classes WHERE id=?',classId);requireThat(c,404,'CLASS_NOT_FOUND','教学班不存在');return c;}
 function isStaff(user,cls){
  const s=q('SELECT role FROM class_staff WHERE class_id=? AND user_id=?',cls.id,user.id);
  const m=q('SELECT role FROM course_members WHERE course_id=? AND user_id=?',cls.course_id,user.id);
  return cls.teacher_id===user.id||Boolean(s)||m?.role==='owner';
 }
 function requireStaff(user,cls){requireThat(user.global_role!=='student'&&isStaff(user,cls),403,'FORBIDDEN','需要本班教师权限');}
 function requireCourseManager(user,courseId){
  requireThat(user.global_role!=='student',403,'FORBIDDEN','学生不能维护思政目标');
  requireThat(q("SELECT 1 FROM course_members WHERE course_id=? AND user_id=? AND role IN ('owner','teacher')",courseId,user.id),403,'FORBIDDEN','需要本课程教师权限');
 }
 function requireReadable(user,cls){
  requireThat(isStaff(user,cls)||q("SELECT 1 FROM class_members WHERE class_id=? AND student_id=? AND status!='archived'",cls.id,user.id),403,'FORBIDDEN','无权访问本班内容');
 }

 // 证据链明细：把目标、案例、任务、评分点、作品、分项分数与评语拼成一条可追溯记录。
 function chain(classId,{studentId=null,objectiveId=null,caseId=null,releasedOnly=false}={}){
  const cls=classOf(classId),courseId=cls.course_id;
  const objectives=new Map(all('SELECT * FROM ideology_objectives WHERE course_id=?',courseId).map(o=>[o.id,o]));
  const links=all('SELECT * FROM ideology_links WHERE class_id=?',classId);
  const cases=new Map(all("SELECT * FROM tool_items WHERE kind='cases' AND course_id=?",courseId).map(r=>[r.id,parseCase(r)]));
  const tasks=new Map(all('SELECT id,title,rubric_json FROM tasks WHERE class_id=?',classId).map(t=>[t.id,t]));
  const members=new Map(all('SELECT student_id AS id,student_no AS studentNo,display_name AS name FROM class_members WHERE class_id=?',classId).map(m=>[m.id,m]));
  let rows=all('SELECT * FROM ideology_evidence WHERE class_id=? ORDER BY at DESC',classId);
  if(studentId)rows=rows.filter(r=>r.student_id===studentId);
  if(objectiveId)rows=rows.filter(r=>r.objective_id===objectiveId);
  if(caseId)rows=rows.filter(r=>r.case_id===caseId);
  return rows.map(r=>{
   const task=tasks.get(r.task_id),rubric=(()=>{try{return (JSON.parse(task?.rubric_json||'[]')).find(x=>x.id===r.rubric_id)||null;}catch{return null;}})(),ca=cases.get(r.case_id),obj=objectives.get(r.objective_id),link=links.find(l=>l.task_id===r.task_id&&l.rubric_id===r.rubric_id&&l.case_id===r.case_id);
   const sub=q('SELECT id,status,released,submitted_at,attempt FROM submissions WHERE id=?',r.submission_id);
   const released=!!sub?.released;
   return {id:r.id,objectiveId:r.objective_id,objectiveCode:obj?.code||'',objectiveTitle:obj?.title||r.objective_id,
    caseId:r.case_id,caseTitle:ca?.title||r.case_id,caseSource:ca?.source||'',caseAuthorization:ca?.authorization||'',
    taskId:r.task_id,taskTitle:task?.title||r.task_id,rubricId:r.rubric_id,rubricTitle:rubric?.title||r.rubric_id,
    studentId:r.student_id,studentNo:members.get(r.student_id)?.studentNo||'',studentName:members.get(r.student_id)?.name||r.student_id,
    submissionId:r.submission_id,attempt:sub?.attempt??null,submittedAt:sub?.submitted_at||null,released,
    score:r.score,maxScore:r.max_score,feedback:r.feedback,workNote:r.work_note,
    linkNote:link?.note||'',byTeacher:r.by_teacher,at:r.at};
  }).filter(x=>!releasedOnly||x.released);
 }

 return async ctx=>{
  if(!ctx.pathname.startsWith('/api/ideology/'))return false;
  const user=needUser(ctx.session),parts=ctx.pathname.slice('/api/ideology/'.length).split('/').filter(Boolean),kind=parts[0],id=parts[1],action=parts[2],method=ctx.method;
  const b=['POST','PUT','PATCH'].includes(method)?await bodyOf(ctx.req):{};
  const send=(status,data)=>{ctx.json(status,data);return true;};
  const courseId=b.courseId||ctx.url.searchParams.get('courseId')||'unity-script-2021';
  const classId=b.classId||ctx.url.searchParams.get('classId')||null;

  // 前端下拉数据：已发布案例、本班任务及其评分点、课程思政目标。
  if(kind==='catalog'&&method==='GET'){
   requireThat(classId,422,'CLASS_REQUIRED','请选择教学班');const cls=classOf(classId);requireReadable(user,cls);
   const tasks=all("SELECT id,title,rubric_json FROM tasks WHERE class_id=? AND status='published'",classId).map(t=>({id:t.id,title:t.title,rubric:(()=>{try{return JSON.parse(t.rubric_json||'[]').map(x=>({id:x.id,title:x.title,maxScore:x.maxScore}));}catch{return [];}})()}));
   const cases=all("SELECT * FROM tool_items WHERE kind='cases' AND course_id=?",cls.course_id).map(parseCase).filter(c=>c.published).map(c=>({id:c.id,title:c.title,source:c.source||'',authorization:c.authorization||''}));
   return send(200,{objectives:all('SELECT id,code,title,description FROM ideology_objectives WHERE course_id=? ORDER BY code',cls.course_id),cases,tasks,
    links:all('SELECT * FROM ideology_links WHERE class_id=?',classId).map(l=>({id:l.id,caseId:l.case_id,objectiveId:l.objective_id,taskId:l.task_id,rubricId:l.rubric_id,note:l.note}))});
  }

  // ===== 思政目标（课程级，教师维护）=====
  if(kind==='objectives'){
   if(method==='GET')return send(200,{items:all('SELECT * FROM ideology_objectives WHERE course_id=? ORDER BY code',courseId)});
   requireCourseManager(user,courseId);
   const code=(b.code||'').trim();
   if(method==='POST'){
    requireThat(safeCode(code)&&text(b.title,200),422,'INVALID_OBJECTIVE','请填写唯一编号（字母数字）与名称');
    requireThat(!q('SELECT 1 FROM ideology_objectives WHERE course_id=? AND code=?',courseId,code),409,'CODE_EXISTS','该目标编号已存在');
    const row={id:'ideo-'+randomUUID(),course_id:courseId,code,title:b.title.trim(),description:typeof b.description==='string'?b.description.slice(0,4000):'',created_by:user.username,created_at:stamp()};
    run('INSERT INTO ideology_objectives VALUES(?,?,?,?,?,?,?)',row.id,row.course_id,row.code,row.title,row.description,row.created_by,row.created_at);
    audit(user,'ideology.objective.created',row.id);return send(201,{item:row});
   }
   if(id&&method==='PUT'){
    const row=q('SELECT * FROM ideology_objectives WHERE id=? AND course_id=?',id,courseId);requireThat(row,404,'NOT_FOUND','目标不存在');
    requireThat(text(b.title,200),422,'INVALID_OBJECTIVE','请填写名称');
    run('UPDATE ideology_objectives SET title=?,description=? WHERE id=?',b.title.trim(),typeof b.description==='string'?b.description.slice(0,4000):'',id);
    return send(200,{item:q('SELECT * FROM ideology_objectives WHERE id=?',id)});
   }
   if(id&&method==='DELETE'){
    requireThat(q('SELECT 1 FROM ideology_objectives WHERE id=? AND course_id=?',id,courseId),404,'NOT_FOUND','目标不存在');
    requireThat(!q('SELECT 1 FROM ideology_links WHERE objective_id=?',id)&&!q('SELECT 1 FROM ideology_evidence WHERE objective_id=?',id),409,'OBJECTIVE_IN_USE','目标已有案例挂接或评价证据，不能删除');
    run('DELETE FROM ideology_objectives WHERE id=?',id);audit(user,'ideology.objective.deleted',id);return send(200,{ok:true});
   }
  }

  // ===== 案例 → 目标 → 任务评分点 挂接（班级级，教师维护）=====
  if(kind==='links'){
   requireThat(classId,422,'CLASS_REQUIRED','请选择教学班');const cls=classOf(classId);
   requireReadable(user,cls);
   if(method==='GET')return send(200,{items:all('SELECT * FROM ideology_links WHERE class_id=?',classId)});
   requireStaff(user,cls);
   if(method==='POST'){
    requireThat(safeId(b.caseId)&&safeId(b.objectiveId)&&safeId(b.taskId)&&safeId(b.rubricId),422,'INVALID_LINK','挂接标识无效');
    const ca=q("SELECT * FROM tool_items WHERE id=? AND kind='cases' AND course_id=?",b.caseId,cls.course_id);requireThat(ca,404,'CASE_NOT_FOUND','思政案例不存在');
    requireThat(parseCase(ca).published===true,422,'CASE_NOT_PUBLISHED','只能挂接已发布并经审核的案例');
    requireThat(q('SELECT 1 FROM ideology_objectives WHERE id=? AND course_id=?',b.objectiveId,cls.course_id),404,'OBJECTIVE_NOT_FOUND','思政目标不存在');
    const task=q("SELECT * FROM tasks WHERE id=? AND class_id=?",b.taskId,classId);requireThat(task,404,'TASK_NOT_FOUND','任务不属于本班');
    let rubric=[];try{rubric=JSON.parse(task.rubric_json||'[]');}catch{}
    requireThat(rubric.some(x=>x.id===b.rubricId),422,'RUBRIC_NOT_FOUND','评分点不在该任务量规中');
    requireThat(!q('SELECT 1 FROM ideology_links WHERE class_id=? AND task_id=? AND rubric_id=? AND case_id=?',classId,b.taskId,b.rubricId,b.caseId),409,'LINK_EXISTS','该案例已挂接到此评分点');
    const row={id:'ilink-'+randomUUID(),course_id:cls.course_id,class_id:classId,case_id:b.caseId,objective_id:b.objectiveId,task_id:b.taskId,rubric_id:b.rubricId,note:typeof b.note==='string'?b.note.slice(0,1000):'',created_by:user.username,created_at:stamp()};
    run('INSERT INTO ideology_links VALUES(?,?,?,?,?,?,?,?,?,?)',row.id,row.course_id,row.class_id,row.case_id,row.objective_id,row.task_id,row.rubric_id,row.note,row.created_by,row.created_at);
    audit(user,'ideology.link.created',row.id);return send(201,{item:row});
   }
   if(id&&method==='DELETE'){
    const row=q('SELECT * FROM ideology_links WHERE id=? AND class_id=?',id,classId);requireThat(row,404,'NOT_FOUND','挂接不存在');
    run('DELETE FROM ideology_links WHERE id=?',id);audit(user,'ideology.link.deleted',id);return send(200,{ok:true});
   }
  }

  // ===== 证据链查询：教师看全班，学生只看自己且仅已发布成绩 =====
  if(kind==='evidence'&&method==='GET'){
   requireThat(classId,422,'CLASS_REQUIRED','请选择教学班');const cls=classOf(classId);requireReadable(user,cls);
   const own=user.global_role==='student'?user.id:null;
   const items=chain(classId,{studentId:own,objectiveId:ctx.url.searchParams.get('objectiveId'),caseId:ctx.url.searchParams.get('caseId'),releasedOnly:user.global_role==='student'});
   const byObjective=new Map();for(const x of items){const k=x.objectiveId;const s=byObjective.get(k)||{objectiveId:k,title:x.objectiveTitle,code:x.objectiveCode,count:0,students:new Set(),cases:new Set(),scored:0,scoreSum:0,maxSum:0};s.count++;s.students.add(x.studentId);s.cases.add(x.caseId);if(Number.isFinite(x.score)){s.scored++;s.scoreSum+=x.score;s.maxSum+=Number(x.maxScore)||0;}byObjective.set(k,s);}
   const objectives=[...byObjective.values()].map(s=>({objectiveId:s.objectiveId,code:s.code,title:s.title,evidenceCount:s.count,studentCount:s.students.size,caseCount:s.cases.size,scored:s.scored,average:s.scored?Math.round(s.scoreSum/s.scored*100)/100:null,achievement:s.maxSum?Math.round(s.scoreSum/s.maxSum*10000)/100:null}));
   return send(200,{items,objectives,summary:{students:new Set(items.map(x=>x.studentId)).size,cases:new Set(items.map(x=>x.caseId)).size,tasks:new Set(items.map(x=>x.taskId)).size,evidence:items.length}});
  }

  // ===== 育人成效证据导出（教师，HTML / CSV）=====
  if(kind==='export'&&method==='GET'){
   requireThat(classId,422,'CLASS_REQUIRED','请选择教学班');const cls=classOf(classId);requireStaff(user,cls);
   const items=chain(classId,{objectiveId:ctx.url.searchParams.get('objectiveId'),caseId:ctx.url.searchParams.get('caseId')});
   const esc=v=>String(v??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
   if(id==='csv'){
    const head=['目标编号','思政目标','案例','案例来源/授权','任务','评分点','学号','姓名','提交编号','作品说明','分项得分','满分','教师评语','挂接说明','批阅教师','时间'];
    const rows=items.map(x=>[x.objectiveCode,x.objectiveTitle,x.caseTitle,[x.caseSource,x.caseAuthorization].filter(Boolean).join(' / '),x.taskTitle,x.rubricTitle,x.studentNo,x.studentName,x.submissionId,x.workNote,x.score??'',x.maxScore??'',x.feedback,x.linkNote,x.byTeacher,x.at]);
    const csv='\uFEFF'+[head,...rows].map(r=>r.map(c=>'"'+String(c??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
    ctx.res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="ideology-evidence.csv"','Cache-Control':'no-store'});ctx.res.end(csv);return true;
   }
   const groups=new Map();for(const x of items){const k=x.objectiveId;if(!groups.has(k))groups.set(k,{code:x.objectiveCode,title:x.objectiveTitle,items:[]});groups.get(k).items.push(x);}
   const sections=[...groups.values()].map(g=>`<h2>${esc(g.code)} · ${esc(g.title)}（${g.items.length} 条证据 / ${new Set(g.items.map(x=>x.studentId)).size} 名学生）</h2>
<table><thead><tr><th>案例（来源/授权）</th><th>任务 · 评分点</th><th>学生</th><th>作品说明</th><th>分项得分</th><th>教师评语</th></tr></thead><tbody>${g.items.map(x=>`<tr><td>${esc(x.caseTitle)}<small>${esc([x.caseSource,x.caseAuthorization].filter(Boolean).join(' / '))}</small></td><td>${esc(x.taskTitle)}<br><small>${esc(x.rubricTitle)}</small></td><td>${esc(x.studentNo)} ${esc(x.studentName)}<small>提交 ${esc(x.submissionId)} · 第${esc(x.attempt)}次</small></td><td>${esc(x.workNote)||'<span class="muted">未填写</span>'}</td><td class="num">${x.score??'—'} / ${x.maxScore??'—'}</td><td>${esc(x.feedback)||'<span class="muted">无</span>'}</td></tr>`).join('')}</tbody></table>`).join('')||'<p class="muted">本班尚无思政评价证据。请先建立思政目标、发布案例并挂接到任务评分点，随后批阅对应提交。</p>';
   const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>课程思政育人成效证据 · ${esc(cls.name)}</title><style>
body{font:14px/1.7 "Microsoft YaHei",system-ui,sans-serif;color:#172c3e;max-width:1080px;margin:40px auto;padding:0 24px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 10px;padding-bottom:6px;border-bottom:1px solid #e6ebef}
.meta{color:#71808e;font-size:12px}table{width:100%;border-collapse:collapse;margin:8px 0}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #eef2f4;vertical-align:top;font-size:13px}
th{background:#f7f9fa;font-weight:600;font-size:12px;color:#52616e}td small{display:block;color:#71808e;font-size:11px;margin-top:3px}
.num{text-align:right;font-variant-numeric:tabular-nums}.muted{color:#a8bcc7}
@media print{body{margin:0}h2{page-break-after:avoid}table{page-break-inside:auto}tr{page-break-inside:avoid}}
</style></head><body><h1>${esc(cls.name)} · 课程思政育人成效证据</h1>
<p class="meta">生成时间 ${esc(stamp())} · 每条证据均锚定真实提交与量规分项分数，可追溯到作品说明与教师评语 · 共 ${items.length} 条，覆盖 ${new Set(items.map(x=>x.studentId)).size} 名学生、${new Set(items.map(x=>x.caseId)).size} 个案例、${new Set(items.map(x=>x.taskId)).size} 项任务</p>
${sections}<p class="meta">本材料由课程平台自动汇总，不含点击量或说明文字推断；育人成效以已发布案例挂接的评分点实际评价为准。</p></body></html>`;
   ctx.res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Disposition':'attachment; filename="ideology-evidence.html"','Cache-Control':'no-store'});ctx.res.end(html);return true;
  }
  return false;
 };
}
