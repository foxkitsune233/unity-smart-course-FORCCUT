import {safeNext,roleHome} from './portal-routing.mjs';
export {safeNext,roleHome};
export class ApiError extends Error {
  constructor(status, error={}) { super(error.message||`请求失败（${status}）`); this.name='ApiError'; this.status=status; this.code=error.code||'REQUEST_FAILED'; this.details=error.details; }
}

export function createApi({baseUrl='',fetcher=globalThis.fetch}={}) {
  let csrfToken=null;
  return {async request(path,{method='GET',body,signal}={}) {
    const headers={Accept:'application/json'};
    if(body!==undefined) headers['Content-Type']='application/json';
    if(!['GET','HEAD'].includes(method)&&csrfToken) headers['X-CSRF-Token']=csrfToken;
    let response;
    try { response=await fetcher(baseUrl+path,{method,headers,credentials:'same-origin',body:body===undefined?undefined:JSON.stringify(body),signal,cache:'no-store'}); }
    catch(error) { if(error.name==='AbortError') throw error; throw new ApiError(0,{code:'NETWORK',message:'无法连接课程服务，请检查连接后重试。'}); }
    let payload;
    try { payload=await response.json(); } catch { throw new ApiError(response.status,{message:'课程服务返回了无法读取的内容，请稍后重试。'}); }
    if(!response.ok) throw new ApiError(response.status,payload.error);
    if(Object.hasOwn(payload,'csrfToken')) csrfToken=payload.csrfToken;
    if(path==='/api/logout') csrfToken=null;
    return payload;
  }};
}
export const api=createApi();
export const roles={student:'学生',assistant:'助教',teacher:'教师',admin:'管理员',owner:'课程负责人'};
export function escapeHTML(value=''){ return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
export function formatDate(value){if(!value)return '尚未发布';const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('zh-CN',{hour12:false});}
export function errorMessage(error){
  let message=error.message||'操作未完成，请重试。';
  const details=error.details;
  const items=Array.isArray(details)?details:Array.isArray(details?.errors)?details.errors:[];
  if(items.length)message+=' '+items.map(item=>typeof item==='string'?item:item.message||item.path||'请检查课程内容').join('；');
  return message;
}
export async function requireSession(allowed){
  const session=await api.request('/api/session');
  if(!session.user){location.replace(`login.html?next=${encodeURIComponent(location.pathname.split('/').pop()+location.search+location.hash)}`);return null;}
  if(allowed&&!allowed.includes(session.user.globalRole))throw new ApiError(403,{message:'当前账号没有此页面的访问权限。请使用已获授权的账号登录。'});
  return session;
}
export function notice(message,kind='info',host=document.querySelector('#page-notice')){if(!host)return;host.hidden=!message;host.className=`notice ${kind}`;host.textContent=message;host.setAttribute('role',kind==='error'?'alert':'status');}
export function bindAccount(user){
  const label=document.querySelector('#account-name');if(label)label.textContent=`${user.name||user.username} · ${roles[user.globalRole]||user.globalRole}`;
  document.querySelector('#logout')?.addEventListener('click',async event=>{event.currentTarget.disabled=true;try{await api.request('/api/logout',{method:'POST'});location.assign('login.html');}catch(error){notice(errorMessage(error),'error');event.target.disabled=false;}});
}
