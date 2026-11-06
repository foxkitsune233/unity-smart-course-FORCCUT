// 课程思政育人成效证据（TC21）前端面板。
// 教师：维护思政目标、把已发布案例挂接到任务评分点、查看证据链、导出育人成效材料。
// 学生：只读自己的育人成效反馈（服务端已限制为本人且仅已发布成绩）。
// CSP 禁止内联脚本，所有交互均通过模块内 DOM 绑定。
import {api,escapeHTML as e,notice,errorMessage,formatDate} from './api-client.mjs';
const COURSE='unity-script-2021';
let state={teacher:false,classId:'',catalog:null,evidence:null};
const sel=(name,label,choices,extra='')=>`<label>${label}<select name="${name}" ${extra}>${choices.map(([v,t])=>`<option value="${e(v)}">${e(t)}</option>`).join('')}</select></label>`;

export async function ideologyHTML({teacher,classId}){
 const qs=new URLSearchParams({courseId:COURSE,classId});
 let catalog={objectives:[],cases:[],tasks:[],links:[]},evidence={items:[],objectives:[],summary:{students:0,cases:0,tasks:0,evidence:0}};
 try{
  const [c,v]=await Promise.all([api.request('/api/ideology/catalog?'+qs),api.request('/api/ideology/evidence?'+qs)]);
  catalog=c;evidence=v;
 }catch(err){return `<section class="tools-card"><p class="muted">读取思政证据失败：${e(errorMessage(err))}</p></section>`;}
 state={teacher,classId,catalog,evidence};
 const s=evidence.summary||{},sums=evidence.objectives||[],items=evidence.items||[];
 const cards=`<div class="tools-grid" style="margin-bottom:8px">${[['思政目标',catalog.objectives.length],['案例挂接',catalog.links.length],['覆盖学生',s.students||0],['评价证据',s.evidence||0]].map(([k,v])=>`<article class="tools-card"><span class="tag">${e(k)}</span><div class="result-score">${e(v)}</div></article>`).join('')}</div>`;
 const objectiveRows=catalog.objectives.map(o=>`<article class="tools-card"><span class="tag">${e(o.code)}</span><h3>${e(o.title)}</h3><p>${e(o.description||'')}</p>${teacher?`<div class="item-actions"><button type="button" data-obj-edit="${e(o.id)}">编辑</button><button type="button" data-obj-del="${e(o.id)}">删除</button></div>`:''}</article>`).join('')||'<p class="muted">尚未建立思政目标。</p>';
 const linkRows=catalog.links.map(l=>{
  const ca=catalog.cases.find(x=>x.id===l.caseId),ob=catalog.objectives.find(x=>x.id===l.objectiveId),t=catalog.tasks.find(x=>x.id===l.taskId),r=t?.rubric.find(x=>x.id===l.rubricId);
  return `<article class="tools-card"><h3>${e(ca?.title||l.caseId)} → ${e(ob?.title||l.objectiveId)}</h3><p>任务：${e(t?.title||l.taskId)} · 评分点：${e(r?.title||l.rubricId)}${l.note?' · '+e(l.note):''}</p>${teacher?`<button type="button" data-link-del="${e(l.id)}">移除挂接</button>`:''}</article>`;
 }).join('')||'<p class="muted">尚未把案例挂接到评分点。挂接后，教师批阅对应评分点会自动生成评价证据。</p>';
 const chainRows=items.map(x=>`<tr><td>${e(x.objectiveCode)} ${e(x.objectiveTitle)}</td><td>${e(x.caseTitle)}</td><td>${e(x.taskTitle)}<small>${e(x.rubricTitle)}</small></td><td>${e(x.studentNo)} ${e(x.studentName)}</td><td class="num">${x.score??'—'} / ${x.maxScore??'—'}</td><td>${e(x.feedback)||'—'}<small>${e(x.workNote||'')}</small></td><td>${e(formatDate(x.at))}</td></tr>`).join('');
 const achievement=sums.length?`<section class="tools-card"><h2>目标育人成效汇总</h2><table><thead><tr><th>目标</th><th class="num">证据</th><th class="num">学生</th><th class="num">案例</th><th class="num">分项均分</th><th class="num">达成度</th></tr></thead><tbody>${sums.map(o=>`<tr><td>${e(o.code)} ${e(o.title)}</td><td class="num">${e(o.evidenceCount)}</td><td class="num">${e(o.studentCount)}</td><td class="num">${e(o.caseCount)}</td><td class="num">${o.average??'—'}</td><td class="num">${o.achievement==null?'—':o.achievement+'%'}</td></tr>`).join('')}</tbody></table><p class="muted">达成度按已产生证据的分项得分之和 / 满分之和计算，仅反映量规评价，不含点击量或说明文字推断。</p></section>`:'';
 const exportLinks=teacher?`<div class="item-actions"><a href="/api/ideology/export?${qs}">导出育人成效证据（HTML，可打印）</a><a href="/api/ideology/export/csv?${qs}">导出 CSV</a></div>`:'';
 const forms=teacher?`<div class="tools-grid">
  <form id="ideo-objective" class="tools-form"><h2>新增思政目标</h2><p class="muted">目标为课程级，编号唯一；例如“工程责任与规范意识”。</p><label>编号<input name="code" required maxlength="40" placeholder="如 ENG-ETHIC-01"></label><label>名称<input name="title" required maxlength="200"></label><label>说明<textarea name="description" rows="3" maxlength="4000"></textarea></label><button>保存目标</button></form>
  <form id="ideo-link" class="tools-form"><h2>挂接案例到评分点</h2><p class="muted">只显示已发布案例与已发布任务。批阅该评分点时自动生成可追溯证据。</p>
   ${sel('caseId','思政案例',catalog.cases.length?catalog.cases.map(x=>[x.id,x.title]):[['','暂无已发布案例']])}
   ${sel('objectiveId','思政目标',catalog.objectives.length?catalog.objectives.map(x=>[x.id,x.code+' · '+x.title]):[['','请先建立思政目标']])}
   ${sel('taskId','教学任务',catalog.tasks.length?catalog.tasks.map(x=>[x.id,x.title]):[['','暂无已发布任务']])}
   ${sel('rubricId','量规评分点',[['','请先选择任务']])}
   <label>挂接说明<textarea name="note" rows="2" maxlength="1000" placeholder="如：在作品说明中考察版本责任"></textarea></label><button>建立挂接</button></form>
 </div>`:'';
 return `<section><h2>${teacher?'课程思政育人成效':'我的育人成效反馈'}</h2><p class="muted">证据链：思政目标 → 已发布案例 → 任务评分点 → 学生作品 → 分项评价。每条证据锚定真实提交与批阅分数。</p>${cards}${exportLinks}</section>
 ${teacher?`<section id="ideo-achievement">${achievement}</section>`:''}
 ${forms}
 <section><h2>思政目标${teacher?'（可维护）':''}</h2>${objectiveRows}</section>
 <section><h2>案例与评分点挂接</h2>${linkRows}</section>
 <section><h2>${teacher?'评价证据链明细':'我的育人成效证据'}</h2>${items.length?`<div style="overflow-x:auto"><table><thead><tr><th>思政目标</th><th>案例</th><th>任务 · 评分点</th><th>学生</th><th class="num">分项得分</th><th>教师评语 / 作品说明</th><th>时间</th></tr></thead><tbody>${chainRows}</tbody></table></div>`:'<p class="muted">尚无评价证据。教师批阅已挂接的评分点后，这里会自动出现可追溯记录。</p>'}</section>`;
}

export function bindIdeology({teacher,classId,reload}){
 const qs=new URLSearchParams({courseId:COURSE,classId});
 if(!teacher)return;
 const objForm=document.querySelector('#ideo-objective');
 if(objForm)objForm.onsubmit=async ev=>{ev.preventDefault();const b=Object.fromEntries(new FormData(objForm));b.courseId=COURSE;const btn=objForm.querySelector('button');btn.disabled=true;try{await api.request('/api/ideology/objectives',{method:'POST',body:b});notice('思政目标已保存。','success');await reload();}catch(err){notice(errorMessage(err),'error');}finally{btn.disabled=false;}};
 const linkForm=document.querySelector('#ideo-link');
 if(linkForm){
  const syncRubric=()=>{const t=state.catalog.tasks.find(x=>x.id===linkForm.elements.taskId.value);const r=linkForm.elements.rubricId;r.innerHTML=(t?.rubric?.length?t.rubric.map(x=>`<option value="${e(x.id)}">${e(x.title)}（满分 ${e(x.maxScore)}）</option>`).join(''):'<option value="">该任务暂无评分点</option>');};
  syncRubric();linkForm.elements.taskId.onchange=syncRubric;
  linkForm.onsubmit=async ev=>{ev.preventDefault();const b=Object.fromEntries(new FormData(linkForm));b.classId=classId;const btn=linkForm.querySelector('button');btn.disabled=true;try{await api.request('/api/ideology/links',{method:'POST',body:b});notice('案例已挂接到评分点，后续批阅将自动生成证据。','success');await reload();}catch(err){notice(errorMessage(err),'error');}finally{btn.disabled=false;}};
 }
 document.querySelectorAll('[data-obj-del]').forEach(b=>b.onclick=async()=>{if(!confirm('确认删除该思政目标？已有挂接或证据的目标不能删除。'))return;try{await api.request('/api/ideology/objectives/'+encodeURIComponent(b.dataset.objDel)+'?'+qs,{method:'DELETE'});notice('已删除。','success');await reload();}catch(err){notice(errorMessage(err),'error');}});
 document.querySelectorAll('[data-link-del]').forEach(b=>b.onclick=async()=>{if(!confirm('移除该挂接？已生成的评价证据会保留。'))return;try{await api.request('/api/ideology/links/'+encodeURIComponent(b.dataset.linkDel)+'?classId='+encodeURIComponent(classId),{method:'DELETE'});notice('已移除挂接。','success');await reload();}catch(err){notice(errorMessage(err),'error');}});
 document.querySelectorAll('[data-obj-edit]').forEach(b=>b.onclick=()=>{const o=state.catalog.objectives.find(x=>x.id===b.dataset.objEdit);if(!o)return;const f=document.querySelector('#ideo-objective');f.elements.code.value=o.code;f.elements.title.value=o.title;f.elements.description.value=o.description||'';f.querySelector('button').textContent='更新目标';f.dataset.editId=o.id;f.scrollIntoView({block:'center',behavior:'smooth'});});
 const f=document.querySelector('#ideo-objective');
 if(f){const original=f.onsubmit;f.onsubmit=async ev=>{if(f.dataset.editId){ev.preventDefault();const b=Object.fromEntries(new FormData(f));b.courseId=COURSE;b.code=state.catalog.objectives.find(x=>x.id===f.dataset.editId)?.code||b.code;const btn=f.querySelector('button');btn.disabled=true;try{await api.request('/api/ideology/objectives/'+encodeURIComponent(f.dataset.editId)+'?'+qs,{method:'PUT',body:b});notice('思政目标已更新。','success');await reload();}catch(err){notice(errorMessage(err),'error');}finally{btn.disabled=false;}return;}await original(ev);};}
}
