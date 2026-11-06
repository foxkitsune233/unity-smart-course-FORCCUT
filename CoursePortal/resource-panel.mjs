// 课件/素材统一资源库（TC04）前端面板。
// 教师：新增/编辑资源、提交来源授权审核、审核通过或驳回、发布与下架、查看版本历史并回溯恢复。
// 学生：只读已发布资源（含来源与授权），不绑定任何写操作。
// CSP 禁止内联脚本，交互全部在模块内通过 DOM 属性绑定。
import {api,escapeHTML as e,notice,errorMessage,formatDate} from './api-client.mjs';
const COURSE='unity-script-2021';
const KINDS=[['courseware','课件'],['asset','素材'],['video','视频'],['handout','讲义/资料'],['other','其他']];
const STATUS={draft:'草稿',pending:'待审核',approved:'审核通过',rejected:'已驳回',published:'已发布',offline:'已下架'};
let state={teacher:false,items:[],classId:''};
const qs=()=>new URLSearchParams({courseId:COURSE,...(state.classId?{classId:state.classId}:{})});
const opt=(list,selected)=>list.map(([v,t])=>`<option value="${e(v)}"${v===selected?' selected':''}>${e(t)}</option>`).join('');

function card(x){
 // 本地文件名不映射到静态目录（本地视频走 /media/ 由服务端映射），只显示为文本，避免生成死链。
 const link=x.url?(/^https?:\/\//i.test(x.url)||x.url.startsWith('/')
  ? `<p><a href="${e(x.url)}" target="_blank" rel="noopener">打开资源</a></p>`
  : `<p class="muted">本地文件：${e(x.url)}（由教师提供）</p>`):'';
 const meta=`<p class="muted">类型：${e(x.kindLabel)} · v${e(x.version)} · 来源：${e(x.source)} · 授权：${e(x.authorization)}</p>`;
 const review=x.reviewNote?`<p class="muted">审核/下架说明：${e(x.reviewNote)}${x.reviewedBy?' · '+e(x.reviewedBy):''}</p>`:'';
 const actions=state.teacher?`<div class="item-actions">
  ${['draft','rejected'].includes(x.status)?`<button type="button" data-res-act="${e(x.id)}" data-act="submit">提交审核</button>`:''}
  ${x.status==='pending'?`<button type="button" data-res-act="${e(x.id)}" data-act="approve">审核通过</button><button type="button" data-res-act="${e(x.id)}" data-act="reject">驳回</button>`:''}
  ${['approved','offline'].includes(x.status)?`<button type="button" data-res-act="${e(x.id)}" data-act="publish">${x.status==='offline'?'重新发布':'发布给学生'}</button>`:''}
  ${x.status==='published'?`<button type="button" data-res-act="${e(x.id)}" data-act="offline">下架</button>`:''}
  <button type="button" data-res-edit="${e(x.id)}">编辑</button>
  <button type="button" data-res-history="${e(x.id)}">版本历史</button>
  ${['draft','rejected'].includes(x.status)?`<button type="button" data-res-del="${e(x.id)}">删除</button>`:''}
 </div>`:'';
 return `<article class="tools-card"><span class="tag">${e(STATUS[x.status]||x.status)}</span><h3>${e(x.title)}</h3>${x.summary?`<p>${e(x.summary)}</p>`:''}${meta}${link}${review}<small class="muted">更新 ${e(formatDate(x.updatedAt))}${x.publishedAt?' · 发布 '+e(formatDate(x.publishedAt)):''}</small>${actions}<div data-res-history-box="${e(x.id)}"></div></article>`;
}

export async function resourceHTML({teacher,classId}){
 state={teacher,classId:classId||'',items:[]};
 let data={items:[],summary:{}};
 try{data=await api.request('/api/resources?'+qs());}catch(err){return `<section class="tools-card"><p class="muted">读取资源库失败：${e(errorMessage(err))}</p></section>`;}
 const items=data.items||[];state.items=items;
 const s=data.summary||{total:items.length,pending:0,published:0,offline:0};
 const cards=`<div class="tools-grid" style="margin-bottom:8px">${[['资源总数',s.total||0],['待审核',s.pending||0],['已发布',s.published||0],['已下架',s.offline||0]].map(([k,v])=>`<article class="tools-card"><span class="tag">${e(k)}</span><div class="result-score">${e(v)}</div></article>`).join('')}</div>`;
 const form=teacher?`<form id="resource-form" class="tools-form"><h2>新增课件 / 素材</h2>
  <p class="muted">来源与授权为必填项（视频/素材仍由教师提供，版权责任不变）。新建后为草稿，须经课程负责人审核通过才能发布。</p>
  <label>资源类型<select name="kind">${opt(KINDS,'courseware')}</select></label>
  <label>名称<input name="title" required maxlength="200" placeholder="如：第3章 Transform 组件课件"></label>
  <label>资源地址<input name="url" required maxlength="500" placeholder="https://… 或 /CourseVideos/xxx.mp4 或 chapter3.pptx"></label>
  <label>来源（作者 / 出处）<input name="source" required maxlength="500"></label>
  <label>授权说明（许可类型 / 授权范围）<input name="authorization" required maxlength="500"></label>
  <label>摘要<textarea name="summary" rows="2" maxlength="2000"></textarea></label>
  <button type="submit">保存为草稿</button></form>`:'';
 return `<section><h2>${teacher?'课件与素材资源库':'课程资源'}</h2><p class="muted">统一登记课件、素材、视频与讲义；来源授权经审核通过后才能发布给学生。每次内容修改生成独立版本，已发布内容不会被静默替换。</p>${cards}</section>
 ${teacher?`<section><h2>登记资源</h2>${form}</section>`:''}
 <section><h2>${teacher?'资源清单（含未发布）':'可用资源'}</h2>${items.length?`<div class="tools-grid">${items.map(card).join('')}</div>`:'<p class="muted">尚无资源。教师可先登记课件或素材并提交来源授权审核。</p>'}</section>`;
}

export function bindResources({teacher,classId,reload}){
 if(!teacher)return;
 const form=document.querySelector('#resource-form');
 if(form)form.onsubmit=async ev=>{
  ev.preventDefault();
  const b=Object.fromEntries(new FormData(form));b.courseId=COURSE;if(classId)b.classId=classId;
  const editId=form.dataset.editId,btn=form.querySelector('button');btn.disabled=true;
  try{await api.request('/api/resources'+(editId?'/'+encodeURIComponent(editId):''),{method:editId?'PUT':'POST',body:b});
   notice(editId?'已生成新版本，状态回到草稿，请重新提交审核。':'资源已保存为草稿。','success');await reload();
  }catch(err){notice(errorMessage(err),'error');}finally{btn.disabled=false;}
 };
 document.querySelectorAll('[data-res-edit]').forEach(b=>b.onclick=()=>{
  const x=state.items.find(v=>v.id===b.dataset.resEdit);if(!x||!form)return;
  form.elements.kind.value=x.kind;form.elements.title.value=x.title;form.elements.url.value=x.url;
  form.elements.source.value=x.source;form.elements.authorization.value=x.authorization;form.elements.summary.value=x.summary||'';
  form.dataset.editId=x.id;form.querySelector('h2').textContent='编辑资源（生成新版本）';form.querySelector('button').textContent='保存新版本';
  form.scrollIntoView({block:'center',behavior:'smooth'});
 });
 document.querySelectorAll('[data-res-act]').forEach(b=>b.onclick=async()=>{
  const act=b.dataset.act;
  let body={};
  if(act==='reject'||act==='offline'){
   const note=prompt(act==='reject'?'请填写驳回理由：':'请填写下架原因：');
   if(note===null)return;
   if(!note.trim()){notice('理由不能为空。','error');return;}
   body.note=note.trim();
  }
  if(act==='approve'||act==='reject')body.decision=act==='approve'?'approve':'reject';
  const path='/api/resources/'+encodeURIComponent(b.dataset.resAct)+'/'+(act==='approve'||act==='reject'?'review':act)+'?'+qs();
  b.disabled=true;
  try{const r=await api.request(path,{method:'POST',body});notice(r.item?('状态已更新为「'+(STATUS[r.item.status]||r.item.status)+'」。'):'已保存。','success');await reload();}
  catch(err){notice(errorMessage(err),'error');}finally{b.disabled=false;}
 });
 document.querySelectorAll('[data-res-del]').forEach(b=>b.onclick=async()=>{
  if(!confirm('确认删除该草稿资源？版本历史会保留。'))return;
  try{await api.request('/api/resources/'+encodeURIComponent(b.dataset.resDel)+'?'+qs(),{method:'DELETE'});notice('已删除。','success');await reload();}
  catch(err){notice(errorMessage(err),'error');}
 });
 document.querySelectorAll('[data-res-history]').forEach(b=>b.onclick=async()=>{
  const box=document.querySelector('[data-res-history-box="'+CSS.escape(b.dataset.resHistory)+'"]');if(!box)return;
  try{
   const data=await api.request('/api/resources/'+encodeURIComponent(b.dataset.resHistory)+'/history?'+qs());
   box.innerHTML=`<section class="tools-card"><h3>版本历史（不可变）</h3>${(data.items||[]).map(x=>`<p>v${e(x.version)} · ${e(x.snapshot?.title||'')} · ${e(formatDate(x.at))} · ${e(x.actor||'')}${x.current?' <span class="tag">当前</span>':''}${x.current?'':` <button type="button" data-res-restore="${e(b.dataset.resHistory)}" data-version="${e(x.version)}">恢复此版本</button>`}</p>`).join('')}<p class="muted">恢复会按所选版本内容生成一个新版本并退回草稿，历史不会被覆盖。</p></section>`;
   box.querySelectorAll('[data-res-restore]').forEach(r=>r.onclick=async()=>{
    if(!confirm('按该版本内容生成新版本？资源将退回草稿并需重新审核。'))return;
    r.disabled=true;
    try{await api.request('/api/resources/'+encodeURIComponent(r.dataset.resRestore)+'/restore?'+qs(),{method:'POST',body:{version:Number(r.dataset.version)}});notice('已恢复为新版本。','success');await reload();}
    catch(err){notice(errorMessage(err),'error');}finally{r.disabled=false;}
   });
  }catch(err){notice(errorMessage(err),'error');}
 });
}
