import {bilibiliPlayerUrl,hasLessonVideo} from './video-resources.mjs';
import {renderVideoPlaylist} from './video-playlist.mjs';
import {course,allLessons,requiredLessons,findLesson,loadState,persist,icon,initCommon,timeLabel,toast,storageKey,lessonLink,syncRecords,recordSyncStatus,signedIn} from './ui.mjs';
import {lessonRecord,recordPlayback,markCompleted,addNote,removeNote,summarize,resourceRecord,recordResourcePlayback,markResourceCompleted} from './learning-state.mjs';
initCommon();const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);const lesson=findLesson(params.get('lesson'));
let state=loadState(),localUrl=null,loadedSource=null,lastSaved=0,activeResource=null,pendingSeek=null;
state={...state,lastLessonId:lesson.id};persist(state);
const externalVideo=$('external-video');let currentExternal=null;
const video=$('course-video');const record=()=>lessonRecord(state,lesson.id);
function saveChange(change){const next=change(loadState());if(!persist(next))return false;state=next;return true;}
document.title=lesson.title+' · Unity研习室';
$('lesson-title').textContent=lesson.title;$('chapter-breadcrumb').textContent=(lesson.optional?'选学专题':'第'+lesson.chapterNumber+'章')+' · '+lesson.chapterTitle;
$('lesson-summary').textContent=lesson.summary;
document.querySelector('.catalog-footer p').textContent='每节视频独立关联。'+(course.hours?'课程总学时'+course.hours+'学时；':'课程学时待公布；')+'笔记与进度保存在当前浏览器。';
for(const text of lesson.objectives){const li=document.createElement('li');li.innerHTML='<span>'+icon('check')+'</span>';const body=document.createElement('p');body.textContent=text;li.append(body);$('lesson-objectives').append(li);}
for(const text of lesson.keypoints){const chip=document.createElement('span');chip.textContent=text;$('keypoints').append(chip);}
$('practice-title').textContent=lesson.practice.title;
$('practice-link').hidden=!lesson.practice.available;
if(lesson.practice.available){$('practice-link').href=lesson.id==='lesson-01'&&lesson.practice.url==='http://127.0.0.1:8088/'?'/lab/':lesson.practice.url;$('practice-description').textContent='在真实场景中摆放对象、挂载预设脚本，观察运行结果。把本节的概念带进一次具体操作。';}
else $('practice-description').textContent='本节实训将按课程目标单独设计。现在可以先阅读导学，记录你想验证的问题。';
function renderCompletion(){const complete=record().completed;$('lesson-status').textContent=complete?'本节已标记为已学':'本节尚未标记已学';$('lesson-status').classList.toggle('done',complete);$('complete-label').textContent=complete?'取消已学标记':'标记本节已学';const sum=summarize(state,requiredLessons.map(item=>item.id));$('catalog-completed').textContent=sum.completed;$('catalog-progress').value=sum.completed;renderCatalog();}
$('complete-lesson').onclick=()=>{if(!saveChange(fresh=>markCompleted(fresh,lesson.id,!lessonRecord(fresh,lesson.id).completed)))return;renderCompletion();toast(record().completed?'已记录本节学习状态':'已取消本节已学标记');};
function setTab(name){const active=['guide','notes','practice'].includes(name)?name:'guide';for(const tab of document.querySelectorAll('[data-tab]')){const selected=tab.dataset.tab===active;tab.classList.toggle('active',selected);tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;$('panel-'+tab.dataset.tab).hidden=!selected;}const url=new URL(location.href);if(active==='guide')url.searchParams.delete('tab');else url.searchParams.set('tab',active);history.replaceState(null,'',url);}
document.querySelectorAll('[data-tab]').forEach((tab,index,tabs)=>{tab.onclick=()=>setTab(tab.dataset.tab);tab.onkeydown=event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();const next=tabs[(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length];next.focus();setTab(next.dataset.tab);}};});
setTab(params.get('tab'));
function renderNotes(){const notes=record().notes;$('note-count').textContent=notes.length;$('export-notes').disabled=!notes.length;$('notes-list').replaceChildren();if(!notes.length){const empty=document.createElement('div');empty.className='note-list-empty';empty.innerHTML=icon('note')+'<strong>第一条笔记，从你的理解开始</strong><p>写下一个定义，或一次“原来如此”的发现。</p>';$('notes-list').append(empty);return;}for(const note of [...notes].reverse()){const card=document.createElement('article');card.className='saved-note';const head=document.createElement('div');head.className='saved-note-heading';const stamp=document.createElement('button');stamp.className='note-time';const noteResource=note.resourceId?(lesson.video.resources||[]).find(r=>r.id===note.resourceId):null;stamp.textContent=note.time?(noteResource?'P'+noteResource.page+' · ':'')+timeLabel(note.time):'导学笔记';stamp.disabled=!note.time||(note.resourceId?!noteResource?.localSrc:(!loadedSource||!!activeResource));stamp.onclick=()=>{const seek=()=>{video.currentTime=Math.min(note.time,video.duration||note.time);video.scrollIntoView({behavior:'smooth',block:'center'});};clearPendingSeek();if(noteResource&&noteResource.id!==activeResource?.id)playExternalResource(noteResource);if(video.readyState<1){const targetSource=loadedSource,targetResource=activeResource?.id;pendingSeek=()=>{pendingSeek=null;if(loadedSource===targetSource&&video.currentSrc===targetSource&&activeResource?.id===targetResource)seek();};video.addEventListener('loadedmetadata',pendingSeek,{once:true});}else seek();};const remove=document.createElement('button');remove.className='icon-button delete-note';remove.setAttribute('aria-label','删除笔记');remove.innerHTML=icon('trash');remove.onclick=()=>{if(!saveChange(fresh=>removeNote(fresh,lesson.id,note.id)))return;renderNotes();toast('笔记已删除');};head.append(stamp,remove);const text=document.createElement('p');text.textContent=note.text;card.append(head,text);$('notes-list').append(card);}}
$('note-text').addEventListener('input',()=>{$('save-note').disabled=!$('note-text').value.trim();});
$('note-form').onsubmit=event=>{event.preventDefault();if(!$('note-text').value.trim())return;if(!saveChange(fresh=>addNote(fresh,lesson.id,$('note-text').value,loadedSource?video.currentTime:0,activeResource?.id)))return;$('note-text').value='';$('save-note').disabled=true;renderNotes();toast('笔记已保存');};
$('export-notes').onclick=()=>{const text=course.title+'\n'+lesson.chapterTitle+' · '+lesson.title+'\n\n'+record().notes.map(note=>(note.time?'['+timeLabel(note.time)+'] ':'[导学] ')+note.text).join('\n\n');const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='学习笔记-'+lesson.id+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function renderCatalog(){const query=$('catalog-search').value.trim().toLowerCase();const host=$('catalog-list');host.replaceChildren();const list=allLessons.filter(item=>[item.title,item.chapterTitle,...item.keypoints].join(' ').toLowerCase().includes(query));for(const item of list){const entry=lessonRecord(state,item.id);const link=document.createElement('a');link.className='catalog-lesson'+(item.id===lesson.id?' current':'');link.href=lessonLink(item.id);link.dataset.lessonId=item.id;if(item.id===lesson.id)link.setAttribute('aria-current','page');const number=document.createElement('span');number.className='catalog-number'+(entry.completed?' complete':'');number.innerHTML=entry.completed?icon('check'):item.optional?'选学':String(item.chapterNumber).padStart(2,'0');const copy=document.createElement('div');const name=document.createElement('strong');name.textContent=item.chapterTitle;const title=document.createElement('small');title.textContent=item.id===lesson.id?'正在查看 · '+item.title:item.title;const badge=document.createElement('span');badge.className='catalog-video-state';badge.textContent=hasLessonVideo(item,entry.videoUrl)?'已关联视频':'视频待接入';copy.append(name,title,badge);link.append(number,copy);host.append(link);}if(!list.length){const empty=document.createElement('p');empty.className='catalog-empty';empty.textContent='没有匹配章节，试试其他关键词。';host.append(empty);}}
$('catalog-search').oninput=renderCatalog;
$('catalog-count').textContent=course.chapters.length+'章 / '+requiredLessons.length+'必修'+(allLessons.length>requiredLessons.length?'＋'+(allLessons.length-requiredLessons.length)+'选学':'');$('catalog-progress').max=requiredLessons.length;$('catalog-total').textContent=requiredLessons.length;
const index=allLessons.findIndex(item=>item.id===lesson.id);
for(const [direction,offset] of [['previous',-1],['next',1]]){const item=allLessons[index+offset];const link=$(direction+'-lesson');$(direction+'-title').textContent=item?item.title:(offset<0?'已是第一节':'已是最后一节');if(item)link.href=lessonLink(item.id);else{link.removeAttribute('href');link.setAttribute('aria-disabled','true');}}
const playlist=renderVideoPlaylist(lesson,playExternalResource);
function clearPendingSeek(){if(pendingSeek){video.removeEventListener('loadedmetadata',pendingSeek);pendingSeek=null;}}
function playExternalResource(resource){
 if(localUrl){URL.revokeObjectURL(localUrl);localUrl=null;}
 if(resource.localSrc){loadVideo(resource.localSrc,'本地课程视频 · P'+resource.page);activeResource=resource;playlist.highlight(resource);const selectedUrl=new URL(location.href);selectedUrl.searchParams.set('video',resource.id);history.replaceState(null,'',selectedUrl);renderNotes();return;}
 savePlayback();clearPendingSeek();activeResource=null;loadedSource=null;currentExternal=resource;video.pause();video.removeAttribute('src');video.load();video.hidden=true;$('video-empty').hidden=true;$('playback-speed').disabled=true;
 externalVideo.hidden=false;externalVideo.src=bilibiliPlayerUrl(resource);playlist.highlight(resource);$('source-status').textContent='原站播放器 · '+resource.author+' · P'+resource.page;$('note-timestamp').textContent='导学笔记';
 const url=new URL(location.href);url.searchParams.set('video',resource.id);history.replaceState(null,'',url);renderNotes();
}
function loadDefaultVideo(){const resources=lesson.video.resources||[],selected=resources.find(r=>r.id===new URLSearchParams(location.search).get('video'));if(selected){playExternalResource(selected);return;}const local=resources.find(r=>r.localSrc);if(local){playExternalResource(local);return;}const native=record().videoUrl||lesson.video.src;if(native){loadVideo(native,'本节视频');return;}if(resources.length){playExternalResource(resources[0]);return;}loadVideo(null,'等待视频资源');}
function videoEmpty(title='本节视频待接入',description='视频资源关联后，即可在这里开始观看。你也可以先阅读下方导学与关键知识点。'){$('video-empty').hidden=false;video.hidden=true;$('video-empty-title').textContent=title;$('video-empty-description').textContent=description;$('playback-speed').disabled=true;}
function loadVideo(url,label){savePlayback();clearPendingSeek();activeResource=null;currentExternal=null;externalVideo.hidden=true;externalVideo.removeAttribute('src');playlist.highlight(null);const sourceUrl=new URL(location.href);sourceUrl.searchParams.delete('video');history.replaceState(null,'',sourceUrl);loadedSource=null;video.pause();video.removeAttribute('src');video.load();loadedSource=url?new URL(url,location.href).href:null;$('note-timestamp').textContent='导学笔记';if(!url){videoEmpty();$('source-status').innerHTML='<span class="small-dot"></span>等待视频资源';renderNotes();return;}video.hidden=false;$('video-empty').hidden=true;$('playback-speed').disabled=false;video.src=loadedSource;video.load();$('source-status').textContent=label;renderNotes();}
function savePlayback(){if(!loadedSource||video.currentSrc!==loadedSource||!Number.isFinite(video.duration))return;if(localUrl)return;saveChange(fresh=>activeResource?recordResourcePlayback(fresh,lesson.id,activeResource.id,video.currentTime,video.duration):recordPlayback(fresh,lesson.id,video.currentTime,video.duration));}
video.addEventListener('loadedmetadata',()=>{const position=localUrl?0:activeResource?resourceRecord(state,lesson.id,activeResource.id).position:record().position;if(position>0&&position<video.duration-1)video.currentTime=position;$('source-status').textContent=(localUrl?'本地视频预览':activeResource?'本地课程视频 · P'+activeResource.page:'本节视频')+' · '+timeLabel(video.duration);video.playbackRate=Number($('playback-speed').value);savePlayback();});
video.addEventListener('timeupdate',()=>{$('note-timestamp').textContent=loadedSource?'记录时间点 '+timeLabel(video.currentTime):'导学笔记';if(Date.now()-lastSaved>3000){savePlayback();lastSaved=Date.now();}});
video.addEventListener('pause',savePlayback);video.addEventListener('ended',()=>{if(!loadedSource||video.currentSrc!==loadedSource)return;savePlayback();if(localUrl)return;if(saveChange(fresh=>activeResource?markResourceCompleted(fresh,lesson.id,activeResource.id,(lesson.video.resources||[]).map(r=>r.id)):markCompleted(fresh,lesson.id,true))){renderCompletion();toast(activeResource?'当前分集已播放结束':'本节视频已播放结束');}});
video.addEventListener('error',()=>{if(!loadedSource)return;videoEmpty('视频暂时无法播放','请检查视频地址、访问权限或文件格式，重新关联后再试。');$('source-status').textContent='视频载入失败';});
$('playback-speed').onchange=()=>{video.playbackRate=Number($('playback-speed').value);};
$('theater-mode').onclick=()=>{const active=document.body.classList.toggle('theater');$('theater-mode').setAttribute('aria-pressed',String(active));};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('video-stage').requestFullscreen();}catch{toast('当前浏览器无法进入全屏，可以使用剧场模式。');}};
window.addEventListener('pagehide',()=>{savePlayback();if(localUrl)URL.revokeObjectURL(localUrl);});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
window.addEventListener('storage',event=>{if(event.key===storageKey){state=loadState();renderCompletion();renderNotes();}});
renderCompletion();renderNotes();loadDefaultVideo();
// 进入视频页先拉取云端记录：换设备后进度与笔记以服务端为准；失败则明确提示并保留本地内容。
if(signedIn)syncRecords().then(remote=>{
 if(remote){
  state=loadState();renderCompletion();renderNotes();
  // 已加载视频且本机还没开始看（新设备），跳到云端记录的进度位置。
  if(loadedSource&&video.readyState>=1&&video.currentTime<1){const position=record().position;if(position>0&&position<video.duration-1)video.currentTime=position;}
  return;
 }
 const status=recordSyncStatus();
 if(status.error)toast('云端同步失败：'+status.error+'。本地记录已保留。');
}).catch(()=>{});


