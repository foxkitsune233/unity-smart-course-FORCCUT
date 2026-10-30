import {hasLessonVideo} from './video-resources.mjs';
import {curriculumHTML} from './curriculum-view.mjs';
import {course,allLessons,requiredLessons,findLesson,loadState,icon,initCommon,timeLabel,storageKey,lessonLink,persist,syncRecords,recordSyncStatus,signedIn,toast} from './ui.mjs';
import {lessonRecord,summarize,removeNote} from './learning-state.mjs';
initCommon();
let filter='all',state=loadState();
const plan=document.createElement('div');plan.innerHTML=curriculumHTML(course,{lessonUrl:id=>lessonLink(id)});document.querySelector('.learning-overview').after(plan);
const watchUrl=(lesson,tab='')=>lessonLink(lesson.id,tab);
document.getElementById('course-title').textContent=course.title;
document.querySelector('.hero-copy>p').textContent=course.subtitle;
const aboutDialog=document.getElementById('about-dialog');
aboutDialog.querySelector('.tag').textContent=course.shortTitle||course.title;
aboutDialog.querySelector('p').textContent='以《'+course.book.title+'》为教材，结合章节导学、视频学习、随堂笔记与场景实训。';
if(course.outcomes?.length){const heading=document.createElement('h3');heading.textContent='课程教学目标';const list=document.createElement('ul');for(const outcome of course.outcomes){const li=document.createElement('li');li.textContent=outcome.code+' · '+outcome.description;list.append(li);}aboutDialog.append(heading,list);}
if(course.ideologicalNote){const heading=document.createElement('h3');heading.textContent='专业育人';const paragraph=document.createElement('p');paragraph.textContent=course.ideologicalNote;aboutDialog.append(heading,paragraph);}
document.getElementById('chapter-total').textContent=course.chapters.length;
document.getElementById('unit-total').textContent='/ '+requiredLessons.length;
document.querySelector('.section-count').textContent=course.chapters.length+' 个教学章节 · '+requiredLessons.length+' 个必修单元';
const bookFields=document.querySelectorAll('#about-dialog dd');
[course.book.authors.join('、'),course.book.publisher,course.book.isbn,course.hours?course.hours+' 学时':'待公布'].forEach((value,index)=>bookFields[index].textContent=value);
document.querySelector('.overview-item>div>span').textContent='教学章节';
document.querySelector('#directory-title').textContent='按学校教学计划，逐章学习';
document.getElementById('directory-lead').textContent='以3D为主，按章实例练习；视频按学习单元分别关联。';
document.querySelector('.sidebar-foot small').textContent=course.hours?'课程总学时 '+course.hours:'课程学时待公布';
function renderOverview(){
const summary=summarize(state,requiredLessons.map(lesson=>lesson.id));
document.getElementById('completed-count').textContent=summary.completed;
document.getElementById('notes-count').textContent=summarize(state,allLessons.map(l=>l.id)).notes;
document.getElementById('progress-percent').textContent=summary.percent+'%';
document.getElementById('course-progress').value=summary.percent;
const started=requiredLessons.filter(l=>{const r=lessonRecord(state,l.id);return !r.completed&&(r.position>0||r.duration>0);}).length;
const note=document.getElementById('progress-note');
if(note)note.textContent=started?`另有 ${started} 个单元在看、尚未确认完成；进度只记录已确认完成的学习单元。`:'进度只记录已确认完成的学习单元。';
const current=findLesson(state.lastLessonId);
document.getElementById('continue-learning').href=watchUrl(current);
document.getElementById('continue-title').textContent=current.title;
document.getElementById('continue-label').textContent=state.lastLessonId?'继续学习':'开始第一节';
document.getElementById('continue-eyebrow').textContent=state.lastLessonId?(current.optional?'上次查看 · 选学专题':'上次查看 · 第'+current.chapterNumber+'章'):'建议从这里开始';
document.getElementById('all-notes-link').href='#/notes';
}
const tones=['mint','blue','sand','purple'];
function renderChapters(){
  const query=document.getElementById('course-search').value.trim().toLowerCase();
  const chapters=course.chapters.filter(ch=>{const complete=ch.lessons.length>0&&ch.lessons.every(l=>lessonRecord(state,l.id).completed);return (filter==='all'||(filter==='completed'?complete:!complete))&&[ch.title,ch.description,...ch.lessons.flatMap(l=>[l.title,l.summary,...l.keypoints])].join(' ').toLowerCase().includes(query);});
  const grid=document.getElementById('chapter-grid');grid.replaceChildren();
  for(const ch of chapters){
    const completed=ch.lessons.filter(l=>lessonRecord(state,l.id).completed).length,done=ch.lessons.length>0&&completed===ch.lessons.length;
    const card=document.createElement(ch.lessons.length?'a':'article');card.className='chapter-card '+tones[(ch.number-1)%tones.length];if(ch.lessons.length){card.href=watchUrl(ch.lessons[0]);card.dataset.lessonId=ch.lessons[0].id;}else card.setAttribute('aria-disabled','true');card.dataset.chapterId=ch.id;
    const top=document.createElement('div');top.className='chapter-card-top';top.innerHTML='<span class="chapter-number">'+String(ch.number).padStart(2,'0')+'</span><span class="chapter-state '+(done?'done':'')+'">'+(done?'已学习':'待学习')+'</span>';
    const h3=document.createElement('h3');h3.textContent=ch.title;
    const meta=document.createElement('small');meta.textContent=[ch.hours?ch.hours+'学时':'',ch.knowledgeCode,ch.textbookChapters?.length?'教材第'+ch.textbookChapters.join('、')+'章':''].filter(Boolean).join(' · ');
    const p=document.createElement('p');p.textContent=ch.lessons.length?ch.description:'本章学习内容尚未开放。';
    const hasVideo=ch.lessons.some(l=>hasLessonVideo(l,lessonRecord(state,l.id).videoUrl));
    const bottom=document.createElement('div');bottom.className='chapter-card-foot';bottom.innerHTML='<span>'+icon(hasVideo?'play':'clock')+(hasVideo?'已关联视频':'视频待接入')+'</span><small>'+completed+'/'+ch.lessons.length+' 单元已学</small><span class="card-arrow">'+icon('arrow')+'</span>';
    card.append(top,h3,meta,p,bottom);grid.append(card);
  }
  document.getElementById('search-empty').hidden=chapters.length>0;
}
document.getElementById('course-search').addEventListener('input',renderChapters);
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));});renderChapters();}));
document.getElementById('clear-search').onclick=()=>{document.getElementById('course-search').value='';document.querySelector('[data-filter="all"]').click();};
function renderRecentNotes(){
const notes=allLessons.flatMap(lesson=>lessonRecord(state,lesson.id).notes.map(note=>({...note,lesson}))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,3);
const host=document.getElementById('recent-notes-list');
host.replaceChildren();
if(!notes.length){const empty=document.createElement('div');empty.className='notes-empty';empty.innerHTML=icon('note')+'<div><strong>给理解留个位置</strong><p>在视频页记下概念与观察，笔记会出现在这里。</p></div>';host.append(empty);}
for(const note of notes){const link=document.createElement('a');link.className='recent-note';link.href=watchUrl(note.lesson,'notes');const content=document.createElement('p');content.textContent=note.text;const label=document.createElement('span');label.textContent=(note.lesson.optional?'选学专题':'第'+note.lesson.chapterNumber+'章')+' · '+(note.time?timeLabel(note.time):'导学笔记');link.append(content,label);host.append(link);}
}
/* ===== 多视图路由：把功能拆成独立界面，而非页内锚点滚动 ===== */
function routeFromHash(){return (location.hash.match(/^#\/(\w+)/)||[])[1]||'home';}
const ROUTES=['home','directory','notes'];
function applyRoute(){
  const route=ROUTES.includes(routeFromHash())?routeFromHash():'home';
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.dataset.route===route));
  document.querySelectorAll('.nav-link[data-route]').forEach(a=>{const on=a.dataset.route===route;a.classList.toggle('active',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  const crumb=document.getElementById('breadcrumb-current');if(crumb)crumb.textContent={home:'我的学习',directory:'课程目录',notes:'学习笔记'}[route];
  if(route==='directory')renderChapters();
  if(route==='notes')renderAllNotes();
  window.scrollTo(0,0);
}
window.addEventListener('hashchange',applyRoute);

function renderAllNotes(){
  const notes=allLessons.flatMap(lesson=>lessonRecord(state,lesson.id).notes.map(note=>({...note,lesson}))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const host=document.getElementById('all-notes-list');host.replaceChildren();
  document.getElementById('all-notes-count').textContent=notes.length;
  if(!notes.length){const empty=document.createElement('div');empty.className='notes-empty';empty.innerHTML=icon('note')+'<div><strong>还没有笔记</strong><p>在视频页记下概念与观察，笔记会集中显示在这里。</p></div>';host.append(empty);return;}
  for(const note of notes){
    const card=document.createElement('article');card.className='note-row';
    const meta=document.createElement('a');meta.className='note-meta';meta.href=watchUrl(note.lesson,'notes');meta.textContent=(note.lesson.optional?'选学专题':'第'+note.lesson.chapterNumber+'章')+' · '+(note.time?timeLabel(note.time):'导学笔记')+' · '+note.lesson.title;
    const text=document.createElement('p');text.className='note-text';text.textContent=note.text;
    const actions=document.createElement('div');actions.className='note-actions';
    const open=document.createElement('a');open.className='text-button';open.href=watchUrl(note.lesson,'notes');open.innerHTML=icon('external')+'回到该单元';
    const del=document.createElement('button');del.className='text-button danger';del.type='button';del.innerHTML=icon('trash')+'删除';
    del.onclick=()=>{if(confirm('确定删除这条笔记？')){state=persist(removeNote(state,note.lesson.id,note.id));refresh();renderAllNotes();}};
    actions.append(open,del);card.append(meta,text,actions);host.append(card);
  }
}

function refresh(){state=loadState();renderOverview();renderChapters();renderRecentNotes();}
refresh();
applyRoute();
// 登录后拉取云端记录：换设备打开首页即可继续上次进度与笔记。
if(signedIn)syncRecords().then(remote=>{
 if(remote){refresh();renderAllNotes();toast('已同步云端学习记录');return;}
 const status=recordSyncStatus();
 if(status.error)toast('云端同步失败：'+status.error+'。本地记录已保留。');
}).catch(()=>{});
window.addEventListener('pageshow',event=>{if(event.persisted)refresh();});
window.addEventListener('storage',event=>{if(event.key===storageKey)refresh();});
