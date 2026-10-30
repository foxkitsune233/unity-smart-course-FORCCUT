import {api,requireSession,bindAccount,escapeHTML as e,notice,errorMessage,formatDate,roles} from './api-client.mjs';
const view=document.querySelector('#admin-view');let session,users=[],requestSequence=0;
const actionNames={'session.login':'登录','account.created':'新建账号','account.enabled':'启用账号','account.disabled':'停用账号','course.created':'新建课程','course.saved':'保存课程草稿','course.published':'发布课程','course.member.changed':'更新课程授权',login:'登录',logout:'退出登录','user.create':'新建账号','user.update':'更新账号','user.disable':'停用账号','user.enable':'启用账号','course.create':'新建课程','course.save':'保存课程草稿','course.publish':'发布课程','course.member':'更新课程授权','member.upsert':'更新课程授权'};
function renderUsers(){
  view.innerHTML=`<div class="page-heading teaching-heading"><div><span class="eyebrow">ACCOUNT DIRECTORY</span><h1>账号管理</h1><p>为学习者与课程团队开通账号，维护平台访问权限。</p></div><button id="open-user-form" class="button primary" aria-expanded="false" aria-controls="new-user-panel">＋ 新建账号</button></div><section id="new-user-panel" class="panel new-user-panel" hidden><div class="section-heading"><div><h2>新建账号</h2><p>账号创建后，请通过合适的方式将登录信息交给使用者。</p></div><button id="close-user-form" class="text-button" type="button">收起</button></div><form id="new-user-form"><div class="form-grid"><label class="field"><span>账号</span><input name="username" required minlength="3" maxlength="50" pattern="[a-z0-9][a-z0-9_.\\-]{2,49}" autocomplete="off" placeholder="3–50 位小写字母、数字等"><small>以字母或数字开头，可含下划线、点和连字符。</small></label><label class="field"><span>姓名</span><input name="name" required maxlength="80" autocomplete="off" placeholder="填写使用者姓名"></label><label class="field"><span>初始密码</span><input name="password" type="password" required minlength="12" maxlength="256" autocomplete="new-password" placeholder="至少 12 位字符"><small>不要将密码填写在姓名或账号中。</small></label><label class="field"><span>平台角色</span><select name="globalRole"><option value="student">学生</option><option value="assistant">助教</option><option value="teacher">教师</option><option value="admin">管理员</option></select></label></div><div class="user-role-note"><strong>角色说明</strong><p>学生进入学习空间；助教按课程授权查看草稿；教师可建课；管理员管理账号与审计。课程内容的编辑、发布权限由课程成员角色决定。</p></div><div class="form-footer"><button class="button primary" type="submit">创建账号</button><span class="small muted">新账号创建后默认启用</span></div></form></section><section class="panel users-panel"><div class="directory-toolbar"><div><h2>平台账号 <span class="count-chip">${users.length}</span></h2><p class="small muted">停用后，该账号将不能继续访问课程服务。</p></div><label class="search-field"><span aria-hidden="true">⌕</span><span class="sr-only">搜索账号或姓名</span><input id="user-search" type="search" placeholder="搜索账号、姓名…"></label></div><div id="users-table"></div></section>`;
  renderUserRows('');
}
function renderUserRows(query){
  const filtered=users.filter(user=>`${user.username} ${user.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  document.querySelector('#users-table').innerHTML=filtered.length?`<div class="table-scroll"><table class="data-table"><thead><tr><th>姓名</th><th>登录账号</th><th>平台角色</th><th>状态</th><th class="table-action">操作</th></tr></thead><tbody>${filtered.map(user=>`<tr><td><strong>${e(user.name)}</strong>${user.id===session.user.id?'<span class="self-label">当前账号</span>':''}</td><td class="mono">${e(user.username)}</td><td><span class="role-badge">${e(roles[user.globalRole]||user.globalRole)}</span></td><td><span class="status-dot ${user.active?'enabled':'disabled'}">${user.active?'已启用':'已停用'}</span></td><td class="table-action"><button class="text-button ${user.active?'danger':''}" data-toggle-user="${e(user.id)}" ${user.id===session.user.id?'disabled title="不能停用当前管理员账号"':''}>${user.active?'停用':'启用'}</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="inline-empty">${query?'没有找到匹配账号，请尝试其他关键词。':'还没有账号。使用“新建账号”开通第一个账号。'}</div>`;
}
async function renderAudit(){
  const {entries}=await api.request('/api/admin/audit');
  return `<div class="page-heading teaching-heading"><div><span class="eyebrow">ACTIVITY LOG</span><h1>操作审计</h1><p>查看平台记录的账号、课程与授权操作。</p></div><button id="refresh-audit" class="button secondary">刷新记录</button></div><section class="panel audit-panel"><div class="section-heading"><div><h2>最近的操作</h2><p>仅展示服务端已记录的事件。</p></div><span class="small muted">${entries.length} 条记录</span></div>${entries.length?`<div class="table-scroll"><table class="data-table audit-table"><thead><tr><th>发生时间</th><th>操作人</th><th>操作</th><th>对象标识</th></tr></thead><tbody>${entries.map(entry=>`<tr><td class="mono">${e(formatDate(entry.at))}</td><td>${e(typeof entry.actor==='object'?(entry.actor?.name||entry.actor?.username||entry.actor?.id||'—'):entry.actor||'系统')}</td><td>${e(actionNames[entry.action]||entry.action)}</td><td class="mono audit-object">${e(entry.objectId||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="inline-empty">暂无审计记录。平台发生账号或课程操作后，会在此显示。</div>'}</section>`;
}
async function route(){
  const sequence=++requestSequence;const audit=location.hash==='#audit';notice('');
  document.querySelectorAll('[data-admin-nav]').forEach(link=>{const active=link.dataset.adminNav===(audit?'audit':'users');link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  view.innerHTML='<div class="loading-state">正在读取平台记录…</div>';
  try{if(audit){const html=await renderAudit();if(sequence===requestSequence)view.innerHTML=html;}else{const data=await api.request('/api/admin/users');if(sequence!==requestSequence)return;users=data.users;renderUsers();}}
  catch(error){view.innerHTML='<section class="panel empty-state"><h2>无法读取管理内容</h2><p>检查账号权限或稍后重试。</p><button id="retry-admin" class="button secondary">重新加载</button></section>';notice(errorMessage(error),'error');}
}
async function boot(){
  try{session=await requireSession(['admin']);if(!session)return;bindAccount(session.user);await route();}
  catch(error){view.innerHTML='<section class="panel empty-state"><span class="eyebrow">ACCESS RESTRICTED</span><h1>此空间仅向管理员开放</h1><p>请使用管理员账号登录后管理平台账号与审计记录。</p><a class="button secondary" href="login.html?next=admin.html">更换账号</a><a class="inline-link" href="./">返回学习首页</a></section>';notice(errorMessage(error),'error');return;}
  window.addEventListener('hashchange',route);
  view.addEventListener('input',event=>{if(event.target.id==='user-search')renderUserRows(event.target.value);});
  view.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.id==='open-user-form'||button.id==='close-user-form'){
      const panel=document.querySelector('#new-user-panel');panel.hidden=button.id==='close-user-form'||!panel.hidden;document.querySelector('#open-user-form').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)panel.querySelector('input').focus();return;
    }
    if(['refresh-audit','retry-admin'].includes(button.id)){await route();return;}
    if(button.dataset.toggleUser){
      const user=users.find(user=>user.id===button.dataset.toggleUser);if(!user)return;
      if(user.active&&!confirm(`停用“${user.name||user.username}”后，对方将无法继续访问课程服务。确认停用？`))return;
      button.disabled=true;notice('');
      try{await api.request(`/api/admin/users/${encodeURIComponent(user.id)}`,{method:'PATCH',body:{active:!user.active}});user.active=!user.active;renderUserRows(document.querySelector('#user-search').value);notice(`账号已${user.active?'启用':'停用'}。`,'success');}
      catch(error){notice(errorMessage(error),'error');button.disabled=false;}
    }
  });
  view.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.target;if(form.id!=='new-user-form')return;const button=form.querySelector('button[type="submit"]');button.disabled=true;button.textContent='正在创建…';notice('');
    const data=new FormData(form);
    try{await api.request('/api/admin/users',{method:'POST',body:{username:data.get('username').trim(),name:data.get('name').trim(),password:data.get('password'),globalRole:data.get('globalRole')}});form.reset();await route();notice('账号已创建，可以使用初始密码登录。','success');}
    catch(error){notice(errorMessage(error),'error');button.disabled=false;button.textContent='创建账号';}
  });
}
boot();



