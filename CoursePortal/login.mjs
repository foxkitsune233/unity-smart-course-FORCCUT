import {loginDestination} from './portal-routing.mjs';
import {api,notice,errorMessage,safeNext} from './api-client.mjs';
const form=document.querySelector('#login-form');
const next=safeNext(new URLSearchParams(location.search).get('next'));
const requested=new URLSearchParams(location.search);const initialPortal=['student','teacher'].includes(requested.get('portal'))?requested.get('portal'):(next&&/^(?:\/)?(?:teacher|admin)\.html/.test(next))?'teacher':'student';form.querySelector('[name=portal][value='+initialPortal+']').checked=true;
form.addEventListener('submit',async event=>{
  event.preventDefault();const button=form.querySelector('button');button.disabled=true;button.textContent='正在登录…';notice('');
  const data=new FormData(form);
  try {const session=await api.request('/api/login',{method:'POST',body:{username:data.get('username').trim(),password:data.get('password'),portal:data.get('portal')}});form.elements.password.value='';const destination=loginDestination(session.user.globalRole,data.get('portal'),next);if(!destination)throw new Error('当前账号与所选入口不匹配，请重新选择。');location.assign(destination);}
  catch(error){notice(errorMessage(error),'error');form.elements.password.focus();}
  finally{button.disabled=false;button.textContent='登录';}
});
