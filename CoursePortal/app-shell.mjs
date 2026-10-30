import {catalogStatus,course} from './course-data.mjs';
const toolbar=document.querySelector('.topbar-actions,.watch-topbar');
let user=null,csrfToken=null;
try{const r=await fetch('/api/session');if(r.ok){({user,csrfToken}=await r.json());}}catch{}
if(toolbar){
 const access=document.createElement('div');access.className='workspace-access';
 const link=document.createElement('a');link.className='workspace-link';link.href='login.html';link.textContent='登录';
 if(!user)access.append(link);
 if(user){const button=document.createElement('button');button.className='workspace-logout';button.textContent='退出登录';button.onclick=async()=>{try{const r=await fetch('/api/logout',{method:'POST',headers:{'X-CSRF-Token':csrfToken}});if(r.ok)location.assign('login.html');else button.textContent='退出失败，重试';}catch{button.textContent='退出失败，重试';}};access.append(button);const profile=document.querySelector('.profile>span:last-child');if(profile)profile.textContent=user.name;}
 toolbar.append(access);
}
if(catalogStatus.error){const notice=document.createElement('section');notice.className='catalog-failure';notice.setAttribute('role','alert');const title=document.createElement('h1');title.textContent='课程内容暂时无法显示';const p=document.createElement('p');p.textContent=catalogStatus.error;const a=document.createElement('a');a.href='./';a.textContent='返回学习首页';notice.append(title,p,a);const main=document.querySelector('main');main?.replaceWith(notice);}
else if(catalogStatus.available){const notice=document.createElement('div');notice.className='catalog-notice'+(catalogStatus.preview?' preview':'');notice.textContent=catalogStatus.preview?(catalogStatus.revision?'课程预览 · 当前内容尚未发布':(course.curriculum?'学校教学计划 · '+course.hours+'学时 · 当前为课程预览':'课程预览 · 内容待公布')):'当前课程发布版本 '+catalogStatus.revision+' · 学习标记与笔记保存在当前浏览器';const header=document.querySelector('.portal-topbar,.watch-topbar');header?.after(notice);}
const courseName=document.querySelector('.watch-course-name');if(courseName){courseName.firstChild.textContent=course.title;}
