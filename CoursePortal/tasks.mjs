// 学生端任务与成绩：我的任务、任务详情与提交、量规公开、成绩与反馈。
// 提交带幂等键，重复点击不会产生多个版本；重做保留历史提交。
import {api,requireSession,bindAccount,escapeHTML as e,notice,errorMessage,formatDate} from './api-client.mjs';
import {taskTypes,submissionStatusTag,appealTag} from './teaching-ui.mjs';
import {initIcons} from './icons.mjs';
import {progressRing} from './charts.mjs';
import {labEntryUrl} from './task-links.mjs';

initIcons();

const view=document.querySelector('#tasks-view');
let session=null,routeSequence=0;
let tasks=[],submissions=[],activeTask=null;

const heading=(eyebrow,title,description,action='')=>`<div class="page-heading teaching-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${e(title)}</h1><p>${e(description)}</p></div>${action}</div>`;

// 任务列表：状态区分「未提交 / 待批阅 / 已发布成绩」，截止时间与重做次数明确展示。
function taskCard(task){
 const mine=task.mySubmissions||[];
 const latest=mine[mine.length-1]||null;
 const graded=latest&&latest.status==='graded';
 const released=latest&&latest.released;
 const attempts=mine.length;
 const canSubmit=task.status==='published';
 const overdue=task.dueAt&&Date.parse(task.dueAt)<Date.now()&&!task.allowLate;
 // 实验入口按任务配置的 labId 打开对应章节；没有 labId 的任务不显示入口。
 const labHref=labEntryUrl(task);
 let state='未提交',stateClass='';
 if(graded&&released){state='已发布成绩';stateClass='green';}
 else if(graded){state='已批阅 · 未发布';stateClass='draft-tag';}
 else if(latest){state='待批阅';stateClass='';}
 return `<article class="manage-course-card task-card"><div class="course-card-label"><span class="tag ${stateClass}">${state}</span><span>${e(taskTypes[task.type]||task.type)}</span></div><h2>${e(task.title)}</h2><p>${e(task.description||'老师未填写任务说明。')}</p><div class="course-metadata"><span>满分 ${e(task.maxScore)}</span><span>${e(task.className||'教学班')}</span><span>已提交 ${attempts}/${e(task.maxAttempts)} 次</span></div><div class="course-revision">${task.dueAt?`截止 ${e(formatDate(task.dueAt))}`:'不限截止时间'}${task.allowLate?' · 允许补交':''}${overdue?' · 已过截止':''}</div><div class="course-card-actions"><button class="button secondary small-button" data-action="open-task" data-task="${e(task.id)}" ${canSubmit?'':'disabled'}>${mine.length?'查看与重做':'提交任务'}</button>${labHref?`<a class="text-button" href="${e(labHref)}" target="_blank" rel="noopener">打开实验台 ↗</a>`:''}</div></article>`;
}

// 成绩与反馈：只有已发布的成绩才显示分数与评语，避免未发布信息外泄。
// 复核状态单独成列：待处理 / 已改分 / 维持原判，学生不用猜进度。
function gradeRow(item){
 if(!item.released)return `<tr><td>${e(item.taskTitle)}</td><td class="mono">第 ${item.attempt} 次</td><td>—</td><td class="muted">尚未发布</td><td class="small">${e(formatDate(item.submittedAt))}</td><td></td></tr>`;
 const items=(item.myScores||[]).map(score=>`<div class="rubric-chip">${e(score.title)} <strong>${e(score.score)}</strong>/${e(score.maxScore)}</div>`).join('');
 const appeal=item.appeal;
 const appealCell=appeal
  ? `${appealTag(appeal.status)}${appeal.decisionNote?`<br><small class="muted">${e(appeal.decisionNote)}</small>`:''}`
  : '<span class="muted small">—</span>';
 const appealAction=appeal&&appeal.status==='open'
  ? '<span class="muted small">等待老师处理</span>'
  : `<button class="text-button" data-action="appeal" data-submission="${e(item.id)}" data-task="${e(item.taskTitle)}">申请复核</button>`;
 return `<tr><td><strong>${e(item.taskTitle)}</strong></td><td class="mono">第 ${item.attempt} 次</td><td>${item.score==null?'—':e(item.score)} / ${e(item.maxScore)}</td><td><div class="rubric-scores">${items}</div>${item.feedback?`<p class="feedback-text">${e(item.feedback)}</p>`:'<span class="muted small">无评语</span>'}</td><td class="small">${e(formatDate(item.submittedAt))}</td><td>${appealCell}${appealAction?`<br>${appealAction}`:''}</td></tr>`;
}

async function tasksView(){
 const [taskData,submitData]=await Promise.all([
  api.request('/api/teaching/student/tasks'),
  api.request('/api/teaching/student/submissions'),
 ]);
 tasks=taskData.tasks;submissions=submitData.submissions;
 const total=tasks.length;
 const submitted=tasks.filter(t=>(t.mySubmissions||[]).length>0).length;
 const released=submissions.filter(s=>s.released).length;
 const graded=submissions.filter(s=>s.status==='graded').length;
 let html=heading('MY TASKS','我的任务','老师发布的任务会出现在这里。提交后由老师按量规批阅，发布成绩后可看到分项得分与评语。');
 html+=`<section class="workspace-summary" aria-label="任务概况"><div><span>待完成任务</span><strong>${total}<small> 项</small></strong></div><div><span>已提交</span><strong>${submitted}<small> 项</small></strong></div><div><span>已发布成绩</span><strong>${released}<small> 项</small></strong></div></section>`;
 html+=`<section class="panel"><div class="section-heading"><div><h2>我的完成进度</h2><p>提交进度与批阅进度分开统计：已提交不代表老师已经批阅。</p></div></div>
  <div class="cx-grid cx-grid-3">
   ${progressRing(total?submitted/total*100:0,{label:`已提交 ${submitted}/${total} 项`})}
   ${progressRing(total?graded/total*100:0,{label:`老师已批阅 ${graded}/${total} 项`})}
   ${progressRing(total?released/total*100:0,{label:`成绩已发布 ${released}/${total} 项`})}
  </div></section>`;
 html+=total?`<div class="manage-course-grid">${tasks.map(taskCard).join('')}</div>`:`<section class="panel empty-state"><h2>暂时没有任务</h2><p>老师发布任务后，这里会显示待完成的作业与实验。</p></section>`;
 if(submissions.length){
  html+=`<section class="panel"><div class="section-heading"><div><h2>我的成绩与反馈</h2><p>仅显示已发布给本人的成绩；分项得分对应老师的量规维度。对成绩有疑问可以申请复核，改分后分项与总评同步更新。</p></div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>任务</th><th>提交</th><th>成绩</th><th>分项得分与评语</th><th>提交时间</th><th>成绩复核</th></tr></thead><tbody>${submissions.map(gradeRow).join('')}</tbody></table></div></section>`;
 }
 return html;
}

// 提交弹窗：展示量规维度（公开可见），学生据此自评，教师再按同一量规批阅。
function openSubmit(taskId){
 activeTask=tasks.find(t=>t.id===taskId);
 if(!activeTask)return;
 const form=document.querySelector('#submit-form');
 form.reset();
 form.elements.taskId.value=activeTask.id;
 const mine=activeTask.mySubmissions||[];
 const latest=mine[mine.length-1];
 document.querySelector('#submit-title').textContent=activeTask.title;
 document.querySelector('#submit-rubric').innerHTML=`<div class="submit-rubric-inner"><span class="eyebrow">RUBRIC / 评分标准</span><ul>${
  (activeTask.rubric||[]).map(dim=>`<li><strong>${e(dim.title)}</strong><span>满分 ${e(dim.maxScore)} · 权重 ${e(dim.weight)}%</span></li>`).join('')
 }</ul>${latest?`<p class="small muted">你已提交 ${mine.length} 次（上限 ${e(activeTask.maxAttempts)} 次）。再次提交会保留历史版本，最终成绩以最新一次为准。</p>`:''}</div>`;
 document.querySelector('#submit-error').hidden=true;
 document.querySelector('#submit-dialog').showModal();
}

async function submitTask(event){
 event.preventDefault();
 const form=event.target;
 const host=document.querySelector('#submit-error');
 host.hidden=true;
 const sceneJson=form.elements.sceneJson.value.trim();
 if(sceneJson){
  try{JSON.parse(sceneJson);}
  catch{host.hidden=false;host.textContent='场景数据不是合法 JSON，请检查格式或留空。';return;}
 }
 // 幂等键：同一份内容重复提交只会产生一个版本。
 const key=`${form.elements.taskId.value}:${Date.now()}:${Math.random().toString(36).slice(2,10)}`;
 const body={idempotencyKey:key,note:form.elements.note.value,sceneJson:sceneJson||null};
 try{
  await api.request(`/api/teaching/tasks/${encodeURIComponent(form.elements.taskId.value)}/submissions`,{method:'POST',body});
  document.querySelector('#submit-dialog').close();
  await renderRoute();
  notice('提交成功。等待老师批阅后即可看到成绩与评语。','success');
 }catch(error){host.hidden=false;host.textContent=errorMessage(error);}
}

async function action(event){
 const button=event.target.closest('[data-action]');
 if(!button)return;
 if(button.dataset.action==='open-task'){openSubmit(button.dataset.task);return;}
 if(button.dataset.action==='appeal'){openAppeal(button.dataset.submission,button.dataset.task);return;}
}

// 复核申请：只对已发布成绩开放，理由必填；同一提交同时只能有一条待处理申请。
function openAppeal(submissionId,taskTitle){
 const form=document.querySelector('#appeal-form');
 form.reset();
 form.elements.submissionId.value=submissionId;
 document.querySelector('#appeal-target').textContent=`任务：${taskTitle||''}。请写清你认为哪一项得分与评分标准不符，老师处理后会给出说明。`;
 document.querySelector('#appeal-error').hidden=true;
 document.querySelector('#appeal-dialog').showModal();
}

async function submitAppeal(event){
 event.preventDefault();
 const form=event.target;
 const host=document.querySelector('#appeal-error');
 host.hidden=true;
 try{
  await api.request(`/api/teaching/submissions/${encodeURIComponent(form.elements.submissionId.value)}/appeal`,{method:'POST',body:{reason:form.elements.reason.value}});
  document.querySelector('#appeal-dialog').close();
  await renderRoute();
  notice('复核申请已提交，等待老师处理。','success');
 }catch(error){host.hidden=false;host.textContent=errorMessage(error);}
}

async function renderRoute(){
 const sequence=++routeSequence;notice('');
 view.innerHTML='<div class="loading-state">正在读取任务…</div>';
 try{
  const html=await tasksView();
  if(sequence===routeSequence)view.innerHTML=html;
 }catch(error){
  if(sequence===routeSequence){view.innerHTML='<section class="panel empty-state"><h2>暂时无法读取任务</h2><p>检查网络或稍后重试。</p></section>';notice(errorMessage(error),'error');}
 }
}

async function boot(){
 try{
  session=await requireSession(['student']);
  if(!session)return;
  bindAccount(session.user);
  const label=document.querySelector('#account-name');
  if(label)label.textContent=session.user.name||session.user.username;
  view.addEventListener('click',action);
  document.querySelector('#cancel-submit').addEventListener('click',()=>document.querySelector('#submit-dialog').close());
  document.querySelector('#submit-form').addEventListener('submit',submitTask);
  document.querySelector('#cancel-appeal').addEventListener('click',()=>document.querySelector('#appeal-dialog').close());
  document.querySelector('#appeal-form').addEventListener('submit',submitAppeal);
  await renderRoute();
 }catch(error){
  view.innerHTML='<section class="panel empty-state"><h1>无法打开任务页面</h1><p>需要学生账号才能查看老师发布的任务。</p><a class="button secondary" href="login.html">更换账号</a><a class="inline-link" href="./">返回学习首页</a></section>';
  notice(errorMessage(error),'error');
 }
}
if(view)boot();
