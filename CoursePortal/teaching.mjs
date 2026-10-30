// 教师端教学流程：教学班、名单、任务下发、量规批阅、班级学情、成绩导出。
// 权限沿用后端：教师看自己被授权的教学班；仅班负责人可导入名单与改分。
import {api,requireSession,bindAccount,escapeHTML as e,notice,errorMessage,formatDate,roles} from './api-client.mjs';
import {taskTypes,interventionKinds,rubricTable,readRubric,weightBar,taskStatusTag,submissionStatusTag,appealTag,appealStatusText,toLocalInput,toISO,downloadGrades,downloadReport} from './teaching-ui.mjs';
import {caliberChart,scoreChart,studentTotalChart,weightRing,outcomeMatrix,riskChart} from './charts.mjs';

const view=document.querySelector('#teaching-view');
let session=null,busy=false,routeSequence=0;
let currentClass=null;      // 当前教学班详情
let gradingTask=null;       // 当前批阅的任务
let rosterPreview=null;     // 名单导入预览结果
let activeTab='roster';     // 教学班详情内的当前分页，切换视图后保持
const classes=[];           // 教学班列表缓存

const heading=(eyebrow,title,description,action='')=>`<div class="page-heading teaching-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${e(title)}</h1><p>${e(description)}</p></div>${action}</div>`;
const roleName=role=>roles[role]||role||'—';

// ===== 教学班列表 =====
function classCard(item){
 const complete=Math.abs((item.weightTotal||0)-100)<0.001;
 return `<article class="manage-course-card"><div class="course-card-label"><span class="tag ${item.tasksTotal?'green':'draft-tag'}">${item.tasksTotal} 项已下发</span><span>${e(roleName('owner'))}</span></div><h2><a href="#class/${encodeURIComponent(item.id)}">${e(item.name)}</a></h2><p>${e(item.courseTitle||'未关联课程')}</p><div class="course-metadata"><span>${item.membersCount||0} 名学生</span><span>${item.tasksDraft||0} 个草稿任务</span></div>${weightBar(item.weightTotal,{complete})}<div class="course-card-actions"><a class="button secondary small-button" href="#class/${encodeURIComponent(item.id)}">进入教学班 →</a><a class="text-button" href="#analytics/${encodeURIComponent(item.id)}">查看学情</a></div></article>`;
}

async function classesView(){
 const data=await api.request('/api/teaching/classes');
 classes.length=0;classes.push(...data.classes);
 const action=`<button class="button primary" data-action="new-class">＋ 新建教学班</button>`;
 let html=heading('CLASSROOMS','教学班','一个教学班对应一份名单、一组任务和一套成绩。学生只会看到本班已发布的任务。',action);
 html+=`<section class="workspace-summary" aria-label="教学班概况"><div><span>我负责的教学班</span><strong>${classes.length}<small> 个</small></strong></div><div><span>累计在册学生</span><strong>${classes.reduce((n,c)=>n+(c.membersCount||0),0)}<small> 人</small></strong></div><div class="workspace-summary-note"><span class="eyebrow">ROSTER → TASK → GRADE</span><p>先导入名单，再下发任务，最后按量规批阅。<br>任务与成绩都只在对应教学班内可见。</p></div></section>`;
 html+=classes.length?`<div class="manage-course-grid">${classes.map(classCard).join('')}</div>`:`<section class="panel empty-state"><h2>还没有教学班</h2><p>先新建一个教学班，绑定已发布的课程，然后导入学生名单。</p><button class="button primary" data-action="new-class">＋ 新建教学班</button></section>`;
 return html;
}

// ===== 教学班详情 =====
function rosterTable(members,role){
 return `<div class="table-scroll"><table class="data-table"><thead><tr><th>学号</th><th>姓名</th><th>账号</th><th>分组</th><th>已提交</th><th>已批阅</th><th>平均分</th><th>状态</th><th></th></tr></thead><tbody>${
  members.length?members.map(member=>`<tr class="${member.status==='archived'?'archived-row':''}">
   <td class="mono">${e(member.studentNo)}</td><td><strong>${e(member.displayName)}</strong></td><td class="mono">${e(member.username)}</td>
   <td>${e(member.groupName||'—')}</td><td>${member.submitted||0}/${member.tasksTotal||0}</td><td>${member.graded||0}</td>
   <td>${member.average==null?'—':e(member.average)}</td>
   <td><span class="role-badge">${member.status==='archived'?'已离班':'在册'}</span></td>
   <td class="table-action">${role==='owner'?`<button class="text-button" data-action="toggle-member" data-student="${e(member.studentId)}" data-status="${member.status==='archived'?'active':'archived'}">${member.status==='archived'?'恢复入班':'标记离班'}</button>`:''}</td></tr>`).join('')
  :'<tr><td colspan="9" class="muted">尚未导入学生名单。</td></tr>'}</tbody></table></div>`;
}

function taskTable(tasks,role){
 if(!tasks.length)return '<p class="muted small">还没有任务。先创建一个任务草稿，再发布给本班学生。</p>';
 return `<div class="table-scroll"><table class="data-table"><thead><tr><th>任务</th><th>类型</th><th>满分</th><th>占比 %</th><th>截止</th><th>提交规则</th><th>状态</th><th></th></tr></thead><tbody>${
  tasks.map(task=>{
   // 已撤回的任务保留在列表里，历史提交与成绩不丢，可重新发布。
   const canGrade=task.status==='published';
   const rules=`${task.allowLate?'可补交':'不可补交'} · ${task.allowResubmit?'可重做':'限一次'} · 上限 ${task.maxAttempts} 次`;
   return `<tr><td><strong>${e(task.title)}</strong>${task.description?`<br><small class="muted">${e(task.description.slice(0,60))}</small>`:''}</td>
   <td><span class="role-badge">${e(taskTypes[task.type]||task.type)}</span></td><td>${e(task.maxScore)}</td><td>${e(task.weight)}</td>
   <td class="small">${task.dueAt?e(formatDate(task.dueAt)):'不限'}</td><td class="small muted">${e(rules)}</td><td>${taskStatusTag(task)}</td>
   <td class="table-action">${canGrade?`<a class="text-button" href="#grading/${encodeURIComponent(task.id)}">批阅</a> · `:''}<button class="text-button" data-action="task-rules" data-task="${e(task.id)}">规则</button>${task.status==='published'?` · <button class="text-button danger" data-action="withdraw-task" data-task="${e(task.id)}">撤回</button>`:''}${task.status==='draft'||task.status==='withdrawn'?` · <button class="text-button" data-action="publish-task" data-task="${e(task.id)}">${task.status==='withdrawn'?'重新发布':'发布'}</button>`:''}</td></tr>`;
  }).join('')
 }</tbody></table></div>`;
}

function interventionList(list){
 if(!list.length)return '<p class="muted small">暂无辅导记录。发现学生掉队时，先留下一条记录再跟进。</p>';
 return `<div class="table-scroll"><table class="data-table"><thead><tr><th>学生</th><th>类型</th><th>说明</th><th>记录人</th><th>时间</th></tr></thead><tbody>${
  list.map(item=>`<tr><td>${e(item.displayName||'')}<br><small class="mono">${e(item.studentNo||'')}</small></td><td><span class="role-badge">${e(interventionKinds[item.kind]||item.kind)}</span></td><td>${e(item.note||'—')}</td><td>${e(item.actor)}</td><td class="small">${e(formatDate(item.at))}</td></tr>`).join('')
 }</tbody></table></div>`;
}

function appealList(list,role){
 if(!list.length)return '<p class="muted small">暂无复核申请。学生可以在「我的成绩」里对已发布的成绩提出复核。</p>';
 return `<div class="table-scroll"><table class="data-table"><thead><tr><th>学生</th><th>任务</th><th>原分</th><th>复核理由</th><th>状态</th><th>申请时间</th><th></th></tr></thead><tbody>${
  list.map(item=>`<tr><td><strong>${e(item.displayName||'')}</strong><br><small class="mono">${e(item.studentNo||'')}</small></td>
   <td>${e(item.taskTitle||'')}</td><td class="mono">${item.beforeScore==null?'—':e(item.beforeScore)}</td>
   <td class="small">${e(item.reason)}${item.decisionNote?`<br><small class="muted">处理说明：${e(item.decisionNote)}</small>`:''}</td>
   <td>${appealTag(item.status)}${item.afterScore!=null&&item.status==='revised'?`<br><small class="mono">→ ${e(item.afterScore)}</small>`:''}</td>
   <td class="small">${e(formatDate(item.createdAt))}</td>
   <td class="table-action">${item.status==='open'&&role!=='assistant'?`<button class="text-button" data-action="appeal-revise" data-appeal="${e(item.id)}">改分处理</button> · <button class="text-button" data-action="appeal-uphold" data-appeal="${e(item.id)}">维持原判</button>`:item.resolvedBy?`<small class="muted">${e(item.resolvedBy)}</small>`:''}</td></tr>`).join('')
 }</tbody></table></div>`;
}

async function classView(id){
 const data=await api.request(`/api/teaching/classes/${encodeURIComponent(id)}`);
 currentClass=data;
 const cls=data.class;
 const role=data.role;
 const published=data.tasks.filter(t=>t.status==='published');
 const weightTotal=Math.round(published.reduce((n,t)=>n+(t.weight||0),0)*100)/100;
 const interventions=await api.request(`/api/teaching/classes/${encodeURIComponent(id)}/interventions`);
 const appeals=await api.request(`/api/teaching/classes/${encodeURIComponent(id)}/appeals`).catch(()=>({appeals:[]}));
 const openAppeals=appeals.appeals.filter(item=>item.status==='open').length;
 let html=heading('CLASSROOM',cls.name,`${cls.courseTitle||''} · 授课教师 ${roleName(role)}`,`<div class="inline-actions"><a class="button secondary small-button" href="#report/${encodeURIComponent(id)}">课程质量报告</a><a class="text-button" href="#classes">← 返回列表</a></div>`);
 html+=`<section class="workspace-summary" aria-label="教学班概况"><div><span>在册学生</span><strong>${data.members.length}<small> 人</small></strong></div><div><span>已下发任务</span><strong>${published.length}<small> 项</small></strong></div><div class="workspace-summary-note">${weightBar(weightTotal)}</div></section>`;
 html+=`<div class="teaching-tabs" role="tablist"><button class="teaching-tab ${activeTab==='roster'?'active':''}" data-tab="roster" role="tab">学生名单</button><button class="teaching-tab ${activeTab==='tasks'?'active':''}" data-tab="tasks" role="tab">任务下发</button><button class="teaching-tab ${activeTab==='appeals'?'active':''}" data-tab="appeals" role="tab">成绩复核${openAppeals?` <span class="count-chip">${openAppeals}</span>`:''}</button><button class="teaching-tab ${activeTab==='interventions'?'active':''}" data-tab="interventions" role="tab">辅导记录</button></div>`;
 html+=`<section class="panel" data-panel="roster" ${activeTab==='roster'?'':'hidden'}><div class="section-heading"><div><h2>学生名单</h2><p>名单中的学生才能看到本班任务。重复导入不会覆盖已有记录。</p></div><div class="inline-actions">${role==='owner'?`<button class="button secondary small-button" data-action="import-roster">导入名单</button>`:''}<button class="button secondary small-button" data-action="export-grades">导出成绩 CSV</button></div></div>${rosterTable(data.members,role)}</section>`;
 html+=`<section class="panel" data-panel="tasks" ${activeTab==='tasks'?'':'hidden'}><div class="section-heading"><div><h2>任务下发</h2><p>草稿可自由修改；发布后评分标准锁定，但截止时间与补交、重做规则仍可调整。</p></div><div class="inline-actions"><button class="button primary small-button" data-action="new-task">＋ 新建任务</button></div></div>${taskTable(data.tasks,role)}</section>`;
 html+=`<section class="panel" data-panel="appeals" ${activeTab==='appeals'?'':'hidden'}><div class="section-heading"><div><h2>成绩复核</h2><p>学生只能对已发布的成绩提出复核。改分会同步重算分项，总评与导出随之更新。</p></div></div>${appealList(appeals.appeals,role)}</section>`;
 html+=`<section class="panel" data-panel="interventions" ${activeTab==='interventions'?'':'hidden'}><div class="section-heading"><div><h2>辅导记录</h2><p>学情看板发现异常后，在这里留下跟进记录，形成可追溯的过程证据。</p></div></div>${interventionList(interventions.interventions)}</section>`;
 return html;
}

// ===== 批阅 =====
async function gradingListView(){
 const data=await api.request('/api/teaching/classes');
 const rows=[];
 for(const item of data.classes){
  const detail=await api.request(`/api/teaching/classes/${encodeURIComponent(item.id)}`);
  for(const task of detail.tasks){
   if(task.status!=='published')continue;
   const subs=await api.request(`/api/teaching/tasks/${encodeURIComponent(task.id)}/submissions`);
   const pending=subs.submissions.filter(s=>s.status!=='graded').length;
   rows.push({classId:item.id,className:item.name,task,pending,total:subs.submissions.length});
  }
 }
 let html=heading('GRADING','作业批阅','按量规逐维度打分。规则检测结果只作为证据，最终成绩由教师确认。');
 if(!rows.length){html+=`<section class="panel empty-state"><h2>暂无可批阅的任务</h2><p>先在教学班中发布任务，学生提交后这里会出现待批阅队列。</p><a class="button secondary" href="#classes">返回教学班</a></section>`;return html;}
 html+=`<section class="panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>教学班</th><th>任务</th><th>满分</th><th>提交数</th><th>待批阅</th><th></th></tr></thead><tbody>${
  rows.map(row=>`<tr><td>${e(row.className)}</td><td><strong>${e(row.task.title)}</strong></td><td>${e(row.task.maxScore)}</td><td>${row.total}</td><td>${row.pending?`<span class="tag draft-tag">${row.pending}</span>`:'<span class="tag green">已完成</span>'}</td><td class="table-action"><a class="text-button" href="#grading/${encodeURIComponent(row.task.id)}">进入批阅</a></td></tr>`).join('')
 }</tbody></table></div></section>`;
 return html;
}

async function gradingView(taskId){
 const data=await api.request(`/api/teaching/tasks/${encodeURIComponent(taskId)}/submissions`);
 gradingTask=data.task;
 const rubric=data.task.rubric||[];
 const rows=data.submissions;
 const grade=(s)=>s.status==='graded';
 let html=heading('GRADING',data.task.title,`满分 ${data.task.maxScore} · 在总评中占比 ${data.task.weight}% · 量规维度权重合计 100%`,`<a class="text-button" href="#grading">← 返回批阅队列</a>`);
 html+=`<section class="panel"><div class="section-heading"><div><h2>提交记录</h2><p>同一学生的多次提交按尝试次数排列，批阅针对最新一次提交。改分必须填写理由并留痕。</p></div></div>`;
 if(!rows.length){html+=`<p class="muted small">还没有学生提交。</p>`;}
 else{
  html+=`<div class="table-scroll"><table class="data-table"><thead><tr><th>学号</th><th>姓名</th><th>第几次</th><th>提交时间</th><th>检测结果</th><th>得分</th><th>状态</th><th></th></tr></thead><tbody>${
   rows.map(s=>`<tr><td class="mono">${e(s.studentNo)}</td><td><strong>${e(s.displayName)}</strong></td><td>${s.attempt}</td><td class="small">${e(formatDate(s.submittedAt))}</td>
    <td class="small">${s.checkResult?`<span class="tag green">有</span>`:'—'}</td><td>${s.score==null?'—':e(s.score)}</td><td>${submissionStatusTag(s.status,s.released)}</td>
    <td class="table-action"><button class="text-button" data-action="replay" data-submission="${e(s.id)}" data-task="${e(s.taskId||'')}">回放</button> · <button class="text-button" data-action="grade" data-submission="${e(s.id)}">${grade(s)?'重新批阅':'批阅'}</button>${s.revisions?.length?`<br><small class="muted" title="${e(s.revisions.map(r=>r.reason).join(' / '))}">改分 ${s.revisions.length} 次</small>`:''}</td></tr>`).join('')
  }</tbody></table></div>`;
 }
 html+=`</section>`;
 return html;
}

// ===== 班级学情 =====
async function analyticsIndexView(){
 const data=await api.request('/api/teaching/classes');
 if(!data.classes.length)return heading('ANALYTICS','班级学情','先创建教学班并下发任务，才能查看学情。')+`<section class="panel empty-state"><h2>暂无教学班</h2><p>学情数据来自教学班的真实名单与任务完成记录。</p><a class="button secondary" href="#classes">返回教学班</a></section>`;
 return heading('ANALYTICS','班级学情','选择教学班查看完成情况与成绩分布。')+`<section class="panel"><div class="table-scroll"><table class="data-table"><thead><tr><th>教学班</th><th>学生</th><th>任务</th><th>已下发占比</th><th></th></tr></thead><tbody>${
  data.classes.map(item=>`<tr><td><strong>${e(item.name)}</strong></td><td>${item.membersCount}</td><td>${item.tasksTotal}</td><td>${e(item.weightTotal)}%</td><td class="table-action"><a class="text-button" href="#analytics/${encodeURIComponent(item.id)}">查看学情</a></td></tr>`).join('')
 }</tbody></table></div></section>`;
}

async function analyticsView(classId){
 const data=await api.request(`/api/teaching/classes/${encodeURIComponent(classId)}/analytics`);
 let html=heading('ANALYTICS',data.className,'四种完成口径分列，互不替代。缺失记录不计为完成，未下发的任务不计入分母。',`<a class="text-button" href="#analytics">← 切换教学班</a>`);
 html+=`<section class="workspace-summary" aria-label="学情概况"><div><span>统计分母</span><strong>${data.denominator}<small> 项任务</small></strong></div><div><span>总评占比合计</span><strong>${e(data.weightTotal)}<small> %</small></strong></div><div class="workspace-summary-note"><span class="eyebrow">FOUR CALIBERS</span><p>${e(data.note)}</p></div></section>`;
 // 图表区：四口径对比、成绩分布、学生总评、任务权重配置
 const publishedTasks=(data.tasks||[]).filter(t=>t.status==='published');
 html+=`<section class="panel"><div class="section-heading"><div><h2>完成口径对比</h2><p>同一个任务在四种口径下的完成人数。四条并排，不相加、不互相替代。</p></div></div>${caliberChart(data.students)}</section>`;
 html+=`<section class="panel"><div class="section-heading"><div><h2>成绩分布与课程总评</h2><p>成绩分布只统计已发布的分数；总评按任务占比加权，权重不足时单独标注。</p></div></div><div class="cx-grid">${scoreChart(data.students)}${studentTotalChart(data.students)}</div></section>`;
 html+=`<section class="panel"><div class="section-heading"><div><h2>任务权重配置</h2><p>各任务在课程总评中的占比，合计应为 100%。</p></div></div>${weightRing(publishedTasks)}</section>`;
 html+=`<section class="panel"><div class="section-heading"><div><h2>学生完成与成绩</h2><p>“实验通过”要求规则检测或教师评分有结果；“教师确认”要求已被批阅。</p></div><button class="button secondary small-button" data-action="export-grades">导出成绩 CSV</button></div>`;
 if(!data.students.length){html+=`<p class="muted small">本班尚未导入学生名单。</p>`;}
 else{
  html+=`<div class="table-scroll"><table class="data-table analytics-table"><thead><tr><th>学号</th><th>姓名</th><th>分组</th><th>已提交</th><th>教师确认</th><th>平均分</th><th>课程总评</th><th>各任务状态</th></tr></thead><tbody>${
   data.students.map(student=>`<tr><td class="mono">${e(student.studentNo)}</td><td><strong>${e(student.name)}</strong></td><td>${e(student.groupName||'—')}</td>
    <td>${student.submittedCount}/${student.tasksTotal}</td><td>${student.confirmedCount}/${student.tasksTotal}</td><td>${student.average==null?'—':e(student.average)}</td>
    <td>${student.courseTotal==null?'—':e(student.courseTotal)}${student.weightComplete?'':' <span class="tag draft-tag">占比不足</span>'}</td>
    <td class="analytics-cells">${student.tasks.map(t=>`<span class="caliber-cell ${t.statuses.teacherConfirmed?'done':t.statuses.experimentPassed?'partial':'none'}" title="${e(t.title)}：自报${t.statuses.selfReported?'✓':'×'} / 视频${t.statuses.videoEnded?'✓':'×'} / 实验${t.statuses.experimentPassed?'✓':t.statuses.experimentChecked?'×':'—'} / 确认${t.statuses.teacherConfirmed?'✓':'×'}">${e(t.title.slice(0,4))}</span>`).join('')}</td></tr>`).join('')
  }</tbody></table></div>`;
 }
 html+=`</section>`;
 return html;
}

// ===== 课程质量报告 =====
async function reportView(classId){
 const report=await api.request(`/api/teaching/classes/${encodeURIComponent(classId)}/report`);
 const score=report.score;
 let html=heading('QUALITY REPORT',`${report.className} · 课程质量报告`,`${report.courseTitle||''} · 生成于 ${formatDate(report.generatedAt)}`, `<div class="inline-actions"><button class="button secondary small-button" data-action="export-report" data-class="${e(classId)}">导出报告</button><a class="text-button" href="#class/${encodeURIComponent(classId)}">← 返回教学班</a></div>`);
 html+=`<section class="workspace-summary" aria-label="报告概览">
  <div><span>在册学生</span><strong>${report.totals.students}<small> 人</small></strong></div>
  <div><span>已下发任务</span><strong>${report.totals.tasks}<small> 项</small></strong></div>
  <div><span>班级平均分</span><strong>${score.average==null?'—':score.average}</strong></div>
  <div><span>及格率</span><strong>${score.passRate==null?'—':score.passRate}<small> %</small></strong></div>
  <div class="workspace-summary-note"><span class="eyebrow">EVIDENCE BASED</span><p>目标达成按任务占比加权；未关联任务的目标显示为空，不填估算值。</p></div></section>`;
 html+=`<section class="panel"><div class="section-heading"><div><h2>课程目标达成</h2><p>${e(report.note)}</p></div></div>${outcomeMatrix(report.outcomes)}</section>`;
 html+=`<section class="panel"><div class="section-heading"><div><h2>成绩概览</h2><p>平均分 ${score.average??'—'} · 中位数 ${score.median??'—'} · 最高 ${score.max??'—'} · 最低 ${score.min??'—'} · 课程总评均值 ${score.courseAverage??'—'}</p></div></div>${riskChart(report.risks,report.totals.students)}</section>`;
 html+=`<section class="panel"><div class="section-heading"><div><h2>过程证据材料</h2><p>报告中的每个数字都能回到具体记录，不做人工估算。</p></div></div><div class="evidence-grid">${report.evidence.map(item=>`<article class="evidence-card"><span>${e(item.label)}</span><strong>${item.count}</strong><p>${e(item.note)}</p></article>`).join('')}</div></section>`;
 html+=`<section class="panel"><div class="section-heading"><div><h2>教学改进记录</h2><p>预警之后的干预与结案，构成持续改进的证据链。</p></div></div>${report.improvements.length?`<div class="table-scroll"><table class="data-table"><thead><tr><th>学生</th><th>类型</th><th>说明</th><th>记录人</th><th>时间</th><th>状态</th></tr></thead><tbody>${report.improvements.map(item=>`<tr><td>${e(item.displayName)}</td><td><span class="role-badge">${e(interventionKinds[item.kind]||item.kind)}</span></td><td class="small">${e(item.note||'—')}</td><td class="small">${e(item.actor)}</td><td class="small">${e(formatDate(item.at))}</td><td>${item.closedAt?'<span class="tag green">已结案</span>':'<span class="tag draft-tag">跟进中</span>'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted small">本周期没有辅导记录。</p>'}</section>`;
 html+=`<section class="panel"><div class="section-heading"><div><h2>需要关注的学生</h2><p>平均分低于 60 或已完成任务不足一半的学生，建议先留一条辅导记录再跟进。</p></div></div>${report.risks.length?`<div class="table-scroll"><table class="data-table"><thead><tr><th>学号</th><th>姓名</th><th>原因</th><th>平均分</th><th>已确认任务</th></tr></thead><tbody>${report.risks.map(r=>`<tr><td class="mono">${e(r.studentNo)}</td><td>${e(r.name)}</td><td class="small">${e(r.reason)}</td><td>${r.average==null?'—':e(r.average)}</td><td>${r.confirmed}/${r.tasksTotal}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted small">暂无风险学生。</p>'}</section>`;
 return html;
}

// ===== 实验模板管理 =====
function labTemplateCard(template){
 return `<article class="lab-template-card"><div class="course-card-label"><span class="tag ${template.customized?'green':'draft-tag'}">v${template.version}${template.customized?' · 已自定义':' · 内置默认'}</span><span>${e(template.labId)}</span></div>
  <h3>${e(template.title)}</h3>
  <p class="small muted">${template.checks.length} 条检测规则 · ${template.hints.length} 条提示 · ${template.scene?.objects?.length||0} 个推荐对象</p>
  <ul class="lab-check-list">${template.checks.map(check=>`<li><span class="${check.optional?'optional':''}">${e(check.label)}</span><code>${e(check.field)} ${e(check.op)} ${e(check.value)}</code></li>`).join('')}</ul>
  <button class="button secondary small-button" data-action="edit-lab" data-lab="${e(template.labId)}">编辑模板</button></article>`;
}

async function labsView(){
 const data=await api.request('/api/teaching/labs');
 let html=heading('LAB TEMPLATES','实验模板','网页上配置实验的推荐对象、脚本范围、检测规则与提示。检测结果只是证据，最终成绩仍由教师按量规评定。');
 html+=`<section class="panel"><div class="section-heading"><div><h2>当前模板</h2><p>保存后版本号自动加一。实验台每次打开都会读取最新模板。</p></div></div><div class="lab-template-grid">${data.labs.map(labTemplateCard).join('')}</div></section>`;
 return html;
}

// 编辑模板：用 JSON 文本域改规则，避免为一个页面再写一套动态表单。
async function openLabEditor(labId){
 const data=await api.request(`/api/teaching/labs/${encodeURIComponent(labId)}/template`);
 const template=data.template;
 const form=document.querySelector('#lab-form');
 form.reset();
 form.elements.labId.value=labId;
 form.elements.version.value=template.version;
 form.elements.title.value=template.title;
 form.elements.checks.value=JSON.stringify(template.checks,null,1);
 form.elements.hints.value=(template.hints||[]).join('\n');
 document.querySelector('#lab-dialog-title').textContent=`编辑模板 · ${labId}`;
 document.querySelector('#lab-error').hidden=true;
 document.querySelector('#lab-dialog').showModal();
}

async function saveLab(event){
 event.preventDefault();
 const form=event.target;
 const host=document.querySelector('#lab-error');
 host.hidden=true;
 let checks;
 try{checks=JSON.parse(form.elements.checks.value||'[]');}
 catch{host.hidden=false;host.textContent='检测规则不是合法 JSON，请检查括号与引号。';return;}
 const body={version:Number(form.elements.version.value),title:form.elements.title.value,
  checks,hints:form.elements.hints.value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean)};
 try{
  await api.request(`/api/teaching/labs/${encodeURIComponent(form.elements.labId.value)}/template`,{method:'PUT',body});
  document.querySelector('#lab-dialog').close();
  await renderRoute();
  notice('实验模板已保存，版本号已更新。','success');
 }catch(error){host.hidden=false;host.textContent=errorMessage(error);}
}

// ===== 名单导入预览 =====
function parseRosterText(text){
 return text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{
  const parts=line.split(/[,\t，]/).map(p=>p.trim());
  return {studentNo:parts[0]||'',name:parts[1]||'',username:(parts[2]||'').toLowerCase(),groupName:parts[3]||null};
 });
}
function rosterPreviewView(preview){
 const rows=(list,label,tone)=>list.length?`<div class="roster-group roster-${tone}"><h4>${label} <span class="count-chip">${list.length}</span></h4><ul>${list.map(row=>`<li><span class="mono">${e(row.username||row.studentNo||'')}</span> ${e(row.displayName||row.name||'')}${row.studentNo?` · ${e(row.studentNo)}`:''}</li>`).join('')}</ul></div>`:'';
 return `<div class="roster-result">${rows(preview.accepted,'可入班','ok')}${rows(preview.duplicated,'重复，已跳过','warn')}${rows(preview.unknown,'找不到账号','bad')}${preview.errors?.length?`<div class="roster-group roster-bad"><h4>格式问题</h4><ul>${preview.errors.map(err=>`<li>第 ${e(err.row)} 行：${e(err.message)}</li>`).join('')}</ul></div>`:''}
  <p class="small muted">${e(preview.note)}</p>
  <div class="form-footer"><button class="button primary" data-action="confirm-roster">确认导入 ${preview.accepted.length} 名学生</button><button class="text-button" data-action="cancel-roster-preview">返回修改</button></div></div>`;
}

// ===== 交互动作 =====
async function action(event){
 const tabButton=event.target.closest('[data-tab]');
 if(tabButton){
  activeTab=tabButton.dataset.tab;
  document.querySelectorAll('.teaching-tab').forEach(tab=>tab.classList.toggle('active',tab===tabButton));
  document.querySelectorAll('[data-panel]').forEach(panel=>{panel.hidden=panel.dataset.panel!==activeTab;});
  return;
 }
 const button=event.target.closest('[data-action]');
 if(!button||busy)return;
 const kind=button.dataset.action;notice('');

 if(kind==='new-class'){await openNewClass();return;}
 if(kind==='import-roster'){openRoster();return;}
 if(kind==='cancel-roster-preview'){document.querySelector('#roster-preview').hidden=true;document.querySelector('#roster-error').hidden=true;return;}
 if(kind==='confirm-roster'){await confirmRoster();return;}
 if(kind==='new-task'){openTaskDialog();return;}
 if(kind==='add-rubric'){addRubricRow();return;}
 if(kind==='remove-rubric'){button.closest('.rubric-row').remove();return;}
 if(kind==='publish-task'){await publishTask(button.dataset.task);return;}
 if(kind==='task-rules'){await openTaskRules(button.dataset.task);return;}
 if(kind==='withdraw-task'){await withdrawTask(button.dataset.task);return;}
 if(kind==='appeal-revise'){await resolveAppeal(button.dataset.appeal,'revise');return;}
 if(kind==='appeal-uphold'){await resolveAppeal(button.dataset.appeal,'uphold');return;}
 if(kind==='export-report'){await exportReport(button.dataset.class);return;}
 if(kind==='edit-lab'){await openLabEditor(button.dataset.lab);return;}
 if(kind==='grade'){await openGrade(button.dataset.submission);return;}
 if(kind==='replay'){await openReplay(button.dataset.submission);return;}
 if(kind==='export-grades'){await exportGrades();return;}
 if(kind==='toggle-member'){await toggleMember(button.dataset.student,button.dataset.status);return;}
 if(kind==='revise-score'){await reviseScore();return;}
 if(kind==='save-grade'){await saveGrade();return;}
 if(kind==='close-grade'){document.querySelector('#grade-dialog').close();return;}
}

async function openNewClass(){
 const [courses,terms]=await Promise.all([
  api.request('/api/manage/courses'),
  api.request('/api/teaching/terms').catch(()=>({terms:[]})),
 ]);
 const courseSelect=document.querySelector('#new-class-course');
 const termSelect=document.querySelector('#new-class-term');
 courseSelect.innerHTML=courses.courses.length?courses.courses.map(c=>`<option value="${e(c.id)}">${e(c.title)}${c.publishedRevision==null?'（尚未发布）':`（已发布 v${c.publishedRevision}）`}</option>`).join(''):'<option value="">暂无可用课程</option>';
 termSelect.innerHTML='<option value="">不指定学期</option>'+terms.terms.map(t=>`<option value="${e(t.id)}">${e(t.name)}</option>`).join('');
 const dialog=document.querySelector('#new-class-dialog');
 dialog.showModal();
}

async function openRoster(){
 rosterPreview=null;
 document.querySelector('#roster-preview').hidden=true;
 document.querySelector('#roster-error').hidden=true;
 document.querySelector('#roster-text').value='';
 document.querySelector('#roster-dialog').showModal();
}

async function previewRoster(){
 const rows=parseRosterText(document.querySelector('#roster-text').value);
 if(!rows.length){const host=document.querySelector('#roster-error');host.hidden=false;host.textContent='请至少填写一行名单内容。';return;}
 const data=await api.request(`/api/teaching/classes/${encodeURIComponent(currentClass.class.id)}/roster/preview`,{method:'POST',body:{rows}});
 rosterPreview=data;
 const host=document.querySelector('#roster-preview');
 host.innerHTML=rosterPreviewView(data);
 host.hidden=false;
}

async function confirmRoster(){
 if(!rosterPreview)return;
 const data=await api.request(`/api/teaching/classes/${encodeURIComponent(currentClass.class.id)}/roster`,{method:'POST',body:{rows:rosterPreview.accepted.map(row=>({studentNo:row.studentNo,name:row.displayName,username:row.username,groupName:row.groupName}))}});
 document.querySelector('#roster-dialog').close();
 await renderRoute();
 notice(`名单已导入：新增 ${data.added.length} 名学生，跳过 ${data.skipped.length} 行。`,'success');
}

function openTaskDialog(){
 const form=document.querySelector('#task-form');
 form.reset();
 form.elements.classId.value=currentClass.class.id;
 form.elements.weight.value=Math.max(0,Math.round((100-(currentClass.class.weightTotal||0))*10)/10);
 document.querySelector('#task-rubric-host').innerHTML=rubricTable([]);
 renderOutcomePicker([]);
 document.querySelector('#task-error').hidden=true;
 document.querySelector('#task-dialog').showModal();
}

// 任务—目标关联：勾选目标并给贡献值，目标达成矩阵按贡献加权。
function renderOutcomePicker(selected=[]){
 const host=document.querySelector('#task-outcomes-host');
 const outcomes=currentClass?.outcomes||[];
 if(!outcomes.length){
  host.innerHTML='<p class="small muted">本课程还没有登记课程目标。可先在「课程建设」里添加教学目标，再回来关联。</p>';
  return;
 }
 host.innerHTML=`<div class="outcome-links">${outcomes.map((outcome,index)=>{
  const current=selected.find(item=>item.outcomeId===outcome.id);
  return `<label class="outcome-link"><input type="checkbox" data-outcome="${e(outcome.id)}" ${current?'checked':''}>
   <span class="outcome-code mono">${e(outcome.code||'目标')}</span>
   <span class="outcome-text">${e(outcome.description||outcome.code||'')}</span>
   <input class="form-input outcome-weight" type="number" min="0" max="100" step="1" value="${current?current.contribution:1}" aria-label="目标贡献" title="该任务对此目标的贡献权重"></label>`;
 }).join('')}</div>`;
}

function readOutcomeLinks(scope){
 return [...scope.querySelectorAll('[data-outcome]')].filter(input=>input.checked).map(input=>({
  outcomeId:input.dataset.outcome,
  contribution:Number(input.closest('.outcome-link').querySelector('.outcome-weight').value||1),
 }));
}
function addRubricRow(){
 const host=document.querySelector('#rubric-rows');
 const index=host.children.length;
 const row=document.createElement('tr');
 row.className='rubric-row';row.dataset.index=String(index);
 row.innerHTML=`<td><input class="form-input rubric-title" type="text" maxlength="100" placeholder="维度名称"></td><td style="width:104px"><input class="form-input rubric-max" type="number" min="0.5" step="0.5" value="0" aria-label="维度满分"></td><td style="width:104px"><input class="form-input rubric-weight" type="number" min="0" max="100" step="1" value="0" aria-label="维度权重"></td><td style="width:92px"><button type="button" class="text-button danger" data-action="remove-rubric">删除</button></td>`;
 host.appendChild(row);
}

async function saveTask(event){
 event.preventDefault();
 const form=event.target;
 const host=document.querySelector('#task-error');
 host.hidden=true;
 const {rubric,errors}=readRubric(form);
 const maxScore=Number(form.elements.maxScore.value);
 if(!errors.length){
  const maxSum=rubric.reduce((n,d)=>n+d.maxScore,0);
  if(Math.abs(maxSum-maxScore)>0.001)errors.push(`量规维度满分之和（${maxSum}）须等于任务满分（${maxScore}）`);
  const weightSum=rubric.reduce((n,d)=>n+d.weight,0);
  if(Math.abs(weightSum-100)>0.001)errors.push(`同一任务内维度权重合计为 ${weightSum}%，须为 100%`);
 }
 if(errors.length){host.hidden=false;host.textContent=errors.join('；');return;}
 const body={
  title:form.elements.title.value.trim(),
  description:form.elements.description.value,
  type:form.elements.type.value,
  lessonId:form.elements.lessonId.value.trim()||null,
  labId:form.elements.labId.value.trim()||null,
  ideologicalNote:form.elements.ideologicalNote.value,
  maxScore,weight:Number(form.elements.weight.value),
  opensAt:toISO(form.elements.opensAt.value),
  dueAt:toISO(form.elements.dueAt.value),
  allowLate:form.elements.allowLate?form.elements.allowLate.checked:true,
  allowResubmit:form.elements.allowResubmit?form.elements.allowResubmit.checked:true,
  maxAttempts:Number(form.elements.maxAttempts.value),
  rubric,outcomeIds:[],outcomeLinks:readOutcomeLinks(form),
 };
 try{
  await api.request(`/api/teaching/classes/${encodeURIComponent(form.elements.classId.value)}/tasks`,{method:'POST',body});
  document.querySelector('#task-dialog').close();
  await renderRoute();
  notice('任务已保存为草稿。确认后请点击「发布」下发给学生。','success');
 }catch(error){host.hidden=false;host.textContent=errorMessage(error);}
}

async function publishTask(taskId){
 try{
  await api.request(`/api/teaching/tasks/${encodeURIComponent(taskId)}/publish`,{method:'POST',body:{}});
  await renderRoute();
  notice('任务已发布，本班学生现在可以提交。','success');
 }catch(error){notice(errorMessage(error),'error');}
}

// 规则调整：已发布任务只改时间与提交规则，评分标准保持锁定。
async function openTaskRules(taskId){
 const task=(currentClass?.tasks||[]).find(item=>item.id===taskId);
 if(!task){notice('找不到该任务，请刷新后重试。','error');return;}
 const form=document.querySelector('#task-rules-form');
 form.reset();
 form.elements.taskId.value=task.id;
 form.elements.opensAt.value=toLocalInput(task.opensAt);
 form.elements.dueAt.value=toLocalInput(task.dueAt);
 form.elements.allowLate.checked=!!task.allowLate;
 form.elements.allowResubmit.checked=!!task.allowResubmit;
 form.elements.maxAttempts.value=task.maxAttempts;
 document.querySelector('#task-rules-title').textContent=`调整规则 · ${task.title}`;
 document.querySelector('#task-rules-error').hidden=true;
 document.querySelector('#task-rules-dialog').showModal();
}

async function saveTaskRules(event){
 event.preventDefault();
 const form=event.target;
 const host=document.querySelector('#task-rules-error');
 host.hidden=true;
 const body={
  opensAt:toISO(form.elements.opensAt.value),
  dueAt:toISO(form.elements.dueAt.value),
  allowLate:form.elements.allowLate.checked,
  allowResubmit:form.elements.allowResubmit.checked,
  maxAttempts:Number(form.elements.maxAttempts.value),
  note:form.elements.note.value,
 };
 try{
  await api.request(`/api/teaching/tasks/${encodeURIComponent(form.elements.taskId.value)}/rules`,{method:'PATCH',body});
  document.querySelector('#task-rules-dialog').close();
  await renderRoute();
  notice('任务规则已更新，已提交的记录保持不变。','success');
 }catch(error){host.hidden=false;host.textContent=errorMessage(error);}
}

async function withdrawTask(taskId){
 const reason=prompt('撤回原因（将记入操作审计，学生端不再显示该任务）：');
 if(reason===null)return;
 if(!reason.trim()){notice('撤回必须填写原因。','error');return;}
 try{
  await api.request(`/api/teaching/tasks/${encodeURIComponent(taskId)}/withdraw`,{method:'POST',body:{reason:reason.trim()}});
  await renderRoute();
  notice('任务已撤回，提交与评分记录全部保留，可随时重新发布。','success');
 }catch(error){notice(errorMessage(error),'error');}
}

async function resolveAppeal(appealId,decision){
 const note=prompt(decision==='revise'?'改分说明（会记入改分日志与复核记录）：':'维持原判的理由（会反馈给学生）：');
 if(note===null)return;
 if(!note.trim()){notice('请填写处理说明。','error');return;}
 const body={decision,note:note.trim()};
 if(decision==='revise'){
  const score=prompt('改分后的分数（分项会按比例同步重算）：');
  if(score===null)return;
  const value=Number(score);
  if(!Number.isFinite(value)||value<0){notice('请输入有效分数。','error');return;}
  body.score=value;
 }
 try{
  const result=await api.request(`/api/teaching/appeals/${encodeURIComponent(appealId)}/resolve`,{method:'POST',body});
  await renderRoute();
  notice(decision==='revise'?`复核已改分：${result.submission.score} 分，分项与总评同步更新。`:'已维持原判，处理说明会反馈给学生。','success');
 }catch(error){notice(errorMessage(error),'error');}
}

async function exportReport(classId){
 const id=classId||currentClass?.class?.id;
 if(!id){notice('请先进入教学班。','error');return;}
 try{
  await downloadReport(id,`${currentClass?.class?.name||'班级'}-质量报告.html`);
  notice('质量报告已导出。','success');
 }catch(error){notice(errorMessage(error),'error');}
}

async function toggleMember(studentId,status){
 try{
  await api.request(`/api/teaching/classes/${encodeURIComponent(currentClass.class.id)}/members/${encodeURIComponent(studentId)}`,{method:'PATCH',body:{status}});
  await renderRoute();
  notice(status==='archived'?'已标记离班，历史记录保留。':'已恢复入班。','success');
 }catch(error){notice(errorMessage(error),'error');}
}

async function openGrade(submissionId){
 const data=await api.request(`/api/teaching/tasks/${encodeURIComponent(gradingTask.id)}/submissions`);
 const submission=data.submissions.find(s=>s.id===submissionId);
 if(!submission)return;
 const rubric=gradingTask.rubric||[];
 const body=document.querySelector('#grade-body');
 const existing={};
 body.innerHTML=`<div class="grade-meta"><span class="mono">${e(submission.studentNo)}</span> <strong>${e(submission.displayName)}</strong> · 第 ${submission.attempt} 次提交 · ${e(formatDate(submission.submittedAt))}</div>
 ${submission.checkResult?`<div class="grade-evidence"><span class="eyebrow">RULE CHECK</span><p>规则检测已完成，检测结果仅作为证据，最终成绩由教师确认。</p></div>`:''}
 <div class="table-scroll"><table class="data-table rubric-table"><thead><tr><th>评分维度</th><th>维度满分</th><th>权重 %</th><th>得分</th></tr></thead><tbody>${
  rubric.map(dim=>`<tr><td><strong>${e(dim.title)}</strong></td><td>${e(dim.maxScore)}</td><td>${e(dim.weight)}</td><td style="width:120px"><input class="form-input grade-score" type="number" min="0" max="${e(dim.maxScore)}" step="0.5" data-dimension="${e(dim.id)}" value=""></td></tr>`).join('')
 }</tbody></table></div>
 <label class="field"><span>评语</span><textarea id="grade-feedback" rows="3" placeholder="给出可执行的改进建议">${e(submission.feedback||'')}</textarea></label>
 <label class="check-field grade-release"><input id="grade-released" type="checkbox" ${submission.released?'checked':''}><span>发布成绩给学生</span></label>
 <div class="form-footer"><button class="button primary" data-action="save-grade" data-submission="${e(submission.id)}">保存批阅</button>${submission.status==='graded'?'<button class="button secondary" data-action="revise-score" data-submission="'+e(submission.id)+'">改分（留痕）</button>':''}</div>
 ${submission.revisions?.length?`<div class="grade-history"><span class="eyebrow">REVISION LOG</span><ul>${submission.revisions.map(r=>`<li>${e(r.beforeScore??'—')} → ${e(r.afterScore??'—')} · ${e(r.reason)} · ${e(r.actor)} · ${e(formatDate(r.at))}</li>`).join('')}</ul></div>`:''}`;
 document.querySelector('#grade-error').hidden=true;
 document.querySelector('#grade-dialog').showModal();
 void existing;
}

async function saveGrade(){
 const button=document.querySelector('#grade-body [data-action="save-grade"]');
 const submissionId=button.dataset.submission;
 const scores={};
 document.querySelectorAll('.grade-score').forEach(input=>{const value=input.value.trim();if(value!=='')scores[input.dataset.dimension]=Number(value);});
 const body={scores,feedback:document.querySelector('#grade-feedback').value,released:document.querySelector('#grade-released').checked};
 const host=document.querySelector('#grade-error');
 host.hidden=true;
 try{
  const result=await api.request(`/api/teaching/submissions/${encodeURIComponent(submissionId)}/grade`,{method:'POST',body});
  document.querySelector('#grade-dialog').close();
  await renderRoute();
  notice(`批阅完成：得分 ${result.submission.score}，任务达成度 ${result.submission.normalized}%。`,'success');
 }catch(error){host.hidden=false;host.textContent=errorMessage(error);}
}

async function reviseScore(){
 const button=document.querySelector('#grade-body [data-action="revise-score"]');
 const submissionId=button.dataset.submission;
 const reason=prompt('改分理由（将记入改分日志，不可省略）：');
 if(reason===null)return;
 const score=prompt('改分后的分数（留空表示撤分）：');
 if(score===null)return;
 const host=document.querySelector('#grade-error');
 host.hidden=true;
 try{
  await api.request(`/api/teaching/submissions/${encodeURIComponent(submissionId)}/revise`,{method:'POST',body:{reason,score:score.trim()===''?null:Number(score)}});
  document.querySelector('#grade-dialog').close();
  await renderRoute();
  notice('改分已保存，并留下改分日志。','success');
 }catch(error){host.hidden=false;host.textContent=errorMessage(error);}
}

// ===== 提交回放与版本比较 =====
// 场景数据来自实验台导出的 JSON：只读展示对象、位置与检测结果，
// 与同一学生的上一次提交逐对象比较，便于判断重做是否真的改动。
function parseScene(sceneJson){
 if(!sceneJson)return {objects:[],raw:null};
 try{
  const data=typeof sceneJson==='string'?JSON.parse(sceneJson):sceneJson;
  const objects=Array.isArray(data?.objects)?data.objects:Array.isArray(data)?data:[];
  return {objects:objects.filter(item=>item&&typeof item==='object'),raw:data};
 }catch{return {objects:[],raw:null};}
}
function diffScenes(current,previous){
 const before=new Map(previous.objects.map(item=>[item.id,item]));
 const after=new Map(current.objects.map(item=>[item.id,item]));
 const added=[...after.keys()].filter(id=>!before.has(id));
 const removed=[...before.keys()].filter(id=>!after.has(id));
 const moved=[];
 for(const [id,item] of after){
  const old=before.get(id);
  if(!old)continue;
  const a=item.position||{},b=old.position||{};
  const delta=['x','y','z'].reduce((sum,key)=>sum+Math.abs(Number(a[key]||0)-Number(b[key]||0)),0);
  if(delta>0.01)moved.push({id,name:item.name||item.kind||id,delta:Math.round(delta*100)/100});
  if((item.behavior||'none')!==(old.behavior||'none'))moved.push({id,name:item.name||item.kind||id,behavior:`${old.behavior||'none'} → ${item.behavior||'none'}`});
 }
 return {added,removed,moved};
}

async function openReplay(submissionId){
 const list=await api.request(`/api/teaching/tasks/${encodeURIComponent(gradingTask.id)}/submissions`);
 const current=list.submissions.find(item=>item.id===submissionId);
 if(!current){notice('找不到该提交记录。','error');return;}
 const detail=await api.request(`/api/teaching/submissions/${encodeURIComponent(submissionId)}`);
 const scene=parseScene(detail.submission.sceneJson);
 const previousRow=list.submissions.filter(item=>item.studentId===current.studentId&&item.attempt<current.attempt)
  .sort((a,b)=>b.attempt-a.attempt)[0]||null;
 let previous={objects:[]};
 if(previousRow){
  const prevDetail=await api.request(`/api/teaching/submissions/${encodeURIComponent(previousRow.id)}`);
  previous=parseScene(prevDetail.submission.sceneJson);
 }
 const diff=previousRow?diffScenes(scene,previous):null;
 const checks=Array.isArray(current.checkResult?.checks)?current.checkResult.checks:[];
 const checkHtml=checks.length?`<ul class="replay-checks">${checks.map(item=>`<li class="${item.ok?'ok':''}${item.optional?' optional':''}">
   <span class="tick">${item.ok?'✓':'×'}</span><span>${e(item.label||item.key||'')}${item.optional?'（参考）':''}
   <small>${e(item.field||'')} ${e(item.op||'')} ${e(item.expected)} · 实际 ${item.actual===null||item.actual===undefined?'—':e(item.actual)}</small></span></li>`).join('')}</ul>`
  :'<p class="small muted">这次提交没有附带检测结果，只能依据场景与说明批阅。</p>';
 const objectHtml=scene.objects.length?`<div class="table-scroll"><table class="data-table"><thead><tr><th>对象</th><th>类型</th><th>行为</th><th>位置 (x, y, z)</th></tr></thead><tbody>${scene.objects.map(item=>`<tr><td>${e(item.name||item.id||'—')}</td><td class="small">${e(item.kind||'—')}</td><td class="small">${e(item.behavior||item.scripts?.join(', ')||'—')}</td><td class="mono small">${['x','y','z'].map(key=>Number(item.position?.[key]||0).toFixed(2)).join(', ')}</td></tr>`).join('')}</tbody></table></div>`
  :'<p class="small muted">这次提交没有场景数据（可能只提交了文字说明）。</p>';
 const diffHtml=diff?`<div class="replay-diff"><span class="eyebrow">版本比较 · 第 ${previousRow.attempt} 次 → 第 ${current.attempt} 次</span>
  <ul><li>新增对象 <strong>${diff.added.length}</strong></li><li>移除对象 <strong>${diff.removed.length}</strong></li>
  <li>位置或行为变化 <strong>${diff.moved.length}</strong>${diff.moved.length?`：${diff.moved.slice(0,6).map(item=>e(item.name)+(item.behavior?`（${e(item.behavior)}）`:'')).join('、')}${diff.moved.length>6?' 等':''}`:''}</li></ul></div>`
  :'<p class="small muted">这是该学生的第一次提交，暂无可比较的历史版本。</p>';

 document.querySelector('#replay-title').textContent=`回放 · ${current.displayName||''} 第 ${current.attempt} 次`;
 document.querySelector('#replay-body').innerHTML=`<div class="grade-meta"><span class="mono">${e(current.studentNo||'')}</span> <strong>${e(current.displayName||'')}</strong> · 第 ${current.attempt} 次 · ${e(formatDate(current.submittedAt))}${current.score==null?'':` · 得分 ${e(current.score)}`}</div>
  <div class="replay-section"><h3>实验检测</h3>${current.checkResult?`<p class="small muted">检测结果只作为证据，最终成绩由教师按量规评定。</p>${checkHtml}`:checkHtml}</div>
  <div class="replay-section"><h3>场景快照</h3>${objectHtml}</div>
  ${detail.submission.note?`<div class="replay-section"><h3>学生说明</h3><p class="small">${e(detail.submission.note)}</p></div>`:''}
  <div class="replay-section">${diffHtml}</div>`;
 document.querySelector('#replay-dialog').showModal();
}

async function exportGrades(){
 const classId=currentClass?.class?.id||location.hash.split('/')[2];
 if(!classId){notice('请先进入教学班再导出成绩。','error');return;}
 try{
  await downloadGrades(classId,`${currentClass?.class?.name||'班级'}-成绩.csv`);
  notice('成绩 CSV 已导出。','success');
 }catch(error){notice(errorMessage(error),'error');}
}
// ===== 路由 =====
async function renderRoute(){
 const sequence=++routeSequence;notice('');
 const hash=location.hash.slice(1)||'classes';
 const parts=hash.split('/');
 const route=parts[0];
 currentClass=null;
 document.querySelectorAll('[data-nav]').forEach(link=>{
  const target=link.dataset.nav;
  const selected=target===route||(target==='classes'&&(route==='report'||route==='class'));
  link.classList.toggle('active',selected);
  if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
 });
 view.innerHTML='<div class="loading-state">正在读取教学数据…</div>';
 try{
  let html;
  if(route==='class'&&parts[1])html=await classView(decodeURIComponent(parts[1]));
  else if(route==='grading'&&parts[1])html=await gradingView(decodeURIComponent(parts[1]));
  else if(route==='analytics'&&parts[1])html=await analyticsView(decodeURIComponent(parts[1]));
  else if(route==='report'&&parts[1])html=await reportView(decodeURIComponent(parts[1]));
  else if(route==='labs')html=await labsView();
  else if(route==='grading')html=await gradingListView();
  else if(route==='analytics')html=await analyticsIndexView();
  else html=await classesView();
  if(sequence===routeSequence)view.innerHTML=html;
 }catch(error){
  if(sequence===routeSequence){
   view.innerHTML='<section class="panel empty-state"><h2>暂时无法打开</h2><p>检查账号授权或稍后重试。</p><button class="button secondary" data-action="reload">重新加载</button><a class="inline-link" href="#classes">返回教学班</a></section>';
   notice(errorMessage(error),'error');
  }
 }
}

async function boot(){
 try{
  session=await requireSession(['teacher','assistant','admin']);
  if(!session)return;
  bindAccount(session.user);
  // 弹窗（名单导入、任务、批阅）位于视图容器之外，事件委托必须挂在 document 上。
  document.addEventListener('click',action);
  document.querySelector('#cancel-new-class').addEventListener('click',()=>document.querySelector('#new-class-dialog').close());
  document.querySelector('#cancel-roster').addEventListener('click',()=>document.querySelector('#roster-dialog').close());
  document.querySelector('#cancel-task').addEventListener('click',()=>document.querySelector('#task-dialog').close());
  document.querySelector('#cancel-grade').addEventListener('click',()=>document.querySelector('#grade-dialog').close());
  document.querySelector('#cancel-replay').addEventListener('click',()=>document.querySelector('#replay-dialog').close());
  document.querySelector('#new-class-form').addEventListener('submit',async event=>{
   event.preventDefault();
   const form=event.target;
   const button=form.querySelector('button[type="submit"]');
   const host=document.querySelector('#new-class-error');
   host.hidden=true;button.disabled=true;
   try{
    const data=await api.request('/api/teaching/classes',{method:'POST',body:{courseId:form.elements.courseId.value,name:form.elements.name.value.trim(),termId:form.elements.termId.value||null}});
    document.querySelector('#new-class-dialog').close();
    form.reset();
    location.hash=`class/${encodeURIComponent(data.class.id)}`;
   }catch(error){host.hidden=false;host.textContent=errorMessage(error);}
   finally{button.disabled=false;}
  });
  document.querySelector('#roster-form').addEventListener('submit',async event=>{
   event.preventDefault();
   const button=event.target.querySelector('button[type="submit"]');
   button.disabled=true;
   try{await previewRoster();}
   catch(error){const host=document.querySelector('#roster-error');host.hidden=false;host.textContent=errorMessage(error);}
   finally{button.disabled=false;}
  });
  const html=document.querySelector('#task-rules-dialog');
  if(html)document.querySelector('#cancel-task-rules').addEventListener('click',()=>html.close());
  document.querySelector('#task-rules-form').addEventListener('submit',saveTaskRules);
  document.querySelector('#lab-form').addEventListener('submit',saveLab);
  document.querySelector('#cancel-lab').addEventListener('click',()=>document.querySelector('#lab-dialog').close());
  document.querySelector('#task-form').addEventListener('submit',saveTask);
  window.addEventListener('hashchange',renderRoute);
  await renderRoute();
 }catch(error){
  view.innerHTML='<section class="panel empty-state"><h1>无法进入教学流程</h1><p>需要教师、助教或管理员账号，并已被授予教学班权限。</p><a class="button secondary" href="login.html">更换账号</a><a class="inline-link" href="teacher.html">返回课程建设</a></section>';
  notice(errorMessage(error),'error');
 }
}
if(view)boot();
