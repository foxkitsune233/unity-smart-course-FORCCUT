import {course,allLessons,requiredLessons,findLesson} from './course-data.mjs';
import {createRecordStore} from './learning-records.mjs';
import {icon,initIcons} from './icons.mjs';
export {course,allLessons,requiredLessons,findLesson,icon};
const ids=allLessons.map(lesson=>lesson.id);
const preview=new URLSearchParams(location.search).get('preview')==='1';
// 登录身份决定学习记录归属：同一浏览器切换账号时，进度与笔记互不可见。
let sessionUser=null;
try{const response=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});if(response.ok){const data=await response.json();sessionUser=data.user||null;}}catch{}
const store=createRecordStore({courseId:course.id,lessonIds:ids,userId:sessionUser?.id||null,userName:sessionUser?.name||'',preview});
export const storageKey=store.key;
export const accountName=sessionUser?.name||'';
export const signedIn=Boolean(sessionUser);
export function loadState(){return store.load();}
export function persist(state){return store.save(state);}
// 登录后同步本人记录：拉取服务端记录并按需回传本地内容。
export async function syncRecords(){return store.pull();}
export async function pushRecords(state){return store.push(state);}
// 同步结果：ok 为假时前端必须提示用户，不能假装已经上云。
export function recordSyncStatus(){return store.syncStatus;}
export function migrationNotice(){const sources=store.migrated;return sources?{migratedFrom:sources.migratedFrom,at:sources.migratedAt}:null;}
export function lessonLink(id,tab=''){const query=new URLSearchParams({course:course.id,lesson:id});if(tab)query.set('tab',tab);if(preview)query.set('preview','1');return 'watch.html?'+query;}
export function timeLabel(seconds){const value=Math.max(0,Math.floor(Number(seconds)||0));return Math.floor(value/60)+':'+String(value%60).padStart(2,'0');}
export function toast(message){let host=document.getElementById('toast');if(!host){host=document.createElement('div');host.id='toast';host.className='toast';host.setAttribute('role','status');document.body.append(host);}host.hidden=false;host.textContent=message;clearTimeout(toast.timer);toast.timer=setTimeout(()=>host.hidden=true,3000);}
export function initCommon(){
  const selection=new URLSearchParams({course:course.id});if(new URLSearchParams(location.search).get('preview')==='1')selection.set('preview','1');
  document.querySelectorAll('a[href="./"]').forEach(link=>{const hash=link.hash;link.href='./?'+selection+hash;});
  document.querySelectorAll('[data-icon]').forEach(node=>{node.innerHTML=icon(node.dataset.icon);});
  const about=document.getElementById('about-dialog');
  document.querySelectorAll('[data-open-about]').forEach(button=>button.addEventListener('click',()=>about?.showModal()));
  document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
}
