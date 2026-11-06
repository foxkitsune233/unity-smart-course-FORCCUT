import {randomUUID} from 'node:crypto';
import {requireThat,HttpError} from './validation.mjs';
import {aiChat,resolveEngine} from './ai-config.mjs';
import {buildPptx} from './pptx-export.mjs';

export function createPreparationApi({db,q,all,run,needUser,bodyOf,audit}){
 db.exec(`CREATE TABLE IF NOT EXISTS preparation_drafts(id TEXT PRIMARY KEY,course_id TEXT NOT NULL,owner_id TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,status TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS preparation_history(draft_id TEXT NOT NULL,revision INTEGER NOT NULL,snapshot TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(draft_id,revision));`);
 const courseId='unity-script-2021',types=['lesson-plan','task-sheet'];
 const text=(x,max)=>typeof x==='string'&&x.trim()&&x.length<=max;
 function course(user){requireThat(user.global_role!=='student'&&q("SELECT 1 FROM course_members WHERE course_id=? AND user_id=? AND role IN ('teacher','owner')",courseId,user.id),403,'FORBIDDEN','需要本课程教师权限');return JSON.parse(q('SELECT draft_json FROM courses WHERE id=?',courseId).draft_json);}
 const payload=row=>({...JSON.parse(row.payload),id:row.id,title:row.title,content:row.content,status:row.status,revision:row.revision,updatedAt:row.updated_at});
 function draft(user,id){const row=q('SELECT * FROM preparation_drafts WHERE id=? AND course_id=?',id,courseId);requireThat(row&&(row.owner_id===user.id||q("SELECT 1 FROM course_members WHERE course_id=? AND user_id=? AND role='owner'",courseId,user.id)),404,'NOT_FOUND','备课草稿不存在');return row;}
 function history(row,user){run('INSERT INTO preparation_history VALUES(?,?,?,?,?)',row.id,row.revision,JSON.stringify(payload(row)),user.username,new Date().toISOString());}
 async function models(){try{const r=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(2000)});return r.ok?(await r.json()).models.map(x=>x.name):[];}catch{return [];}}
 function lessonPlanChapter(title,minutes,objectives,topics){const a=Math.round(minutes*.15),b=Math.round(minutes*.25),c=Math.round(minutes*.4),rem=minutes-a-b-c;return `# ${title} · 教案草稿\n\n授课时长：${minutes}分钟\n环境：Unity 2021，3D项目\n\n## 教学目标\n${objectives.map(x=>'- '+x).join('\n')}\n\n## 教学重点\n${topics.map(x=>'- '+x).join('\n')}\n\n## 教学流程\n1. 导入与前置检查（${a}分钟）：回顾先修知识，确认项目与素材授权。\n2. 演示与讲解（${b}分钟）：围绕本章知识点演示，说明关键参数。\n3. 学生实操（${c}分钟）：完成对应实验，比较一次参数改变的结果，记录错误与验证证据。\n4. 展示与反馈（${rem}分钟）：依据量规讨论实现、问题和改进。\n\n## 评价与反思\n教师根据场景、运行证据和学生说明评价；反馈针对具体实现，不仅依据点击或完成标记。`;}
 function taskSheetChapter(title,minutes,objectives){const a=Math.round(minutes*.15),b=Math.round(minutes*.25),c=Math.round(minutes*.4),rem=minutes-a-b-c;return `# ${title} · 实操任务单草稿\n\n建议时长：${minutes}分钟\n环境：Unity 2021 / 3D\n\n## 任务目标\n${objectives.map(x=>'- '+x).join('\n')}\n\n## 操作步骤\n1. 打开本章实验完整示例，观察对象、组件及参数。\n2. 切换补齐练习，依据运行前检查修复引用与参数。\n3. 运行并记录实际结果，每次只改变一个变量。\n4. 停止并确认编辑场景恢复，保存并提交。\n\n## 提交材料\n- 场景或成果文件\n- 参数与验证说明\n- 素材来源和授权清单\n\n## 评分建议（待教师确认）\n场景结构、脚本配置、运行证据与说明质量；最终量规与权重由教师配置。`;}
 function slidesFromText(text,title,topics){const lines=String(text||'').split(/\n+/);const slides=[{title:title||'备课讲义',points:[]}];let cur=slides[0];for(const raw of lines){const line=raw.trim();if(!line)continue;const h=line.match(/^#+\s+(.*)$/);if(h){if((cur.title&&cur.points.length)||slides.length>1){cur={title:h[1].slice(0,24),points:[]};slides.push(cur);}else cur.title=h[1].slice(0,24);continue;}const bullet=line.match(/^[-*]\s+(.*)$/);if(bullet){cur.points.push(bullet[1].slice(0,60));continue;}if(/^\d+\.\s+/.test(line)){cur.points.push(line.replace(/^\d+\.\s+/,'').slice(0,60));continue;}if(cur.points.length>=6){cur={title:title||'备课讲义',points:[]};slides.push(cur);}cur.points.push(line.slice(0,60));}const out=slides.filter(s=>s.title||s.points.length);return out.length?out:[{title:title||'备课讲义',points:topics&&topics.length?topics.slice(0,6):['（暂无内容）']}];}
 function slidesToText(slides){return (slides||[]).map(s=>'# '+(s.title||'')+'\n'+(s.points||[]).map(p=>'- '+p).join('\n')).join('\n\n');}
 function parseSlides(ans){if(!ans)return null;let raw=String(ans).trim();const fence=raw.match(/```(?:json)?\s*([\s\S]*?)```/i);if(fence)raw=fence[1].trim();try{const data=JSON.parse(raw);if(Array.isArray(data)){const out=data.filter(x=>x&&typeof x.title==='string').map(x=>({title:x.title.slice(0,24),points:Array.isArray(x.points)?x.points.map(p=>String(p)).filter(Boolean).slice(0,8):[],notes:typeof x.notes==='string'?x.notes:undefined}));return out.length?out:null;}}catch{}return null;}
 async function aiText(engine,sources,role,draftText){const prompt=`你是 Unity 2021 课程备课助手。仅依据以下资料完善中文备课草稿，不引入其他课程内容，不编造已完成教学结果，保持教师可审核的草稿状态。资料：${JSON.stringify(sources.slice(0,12))}\n角色：${role}\n草稿：\n${draftText}`;const ans=await aiChat(engine,[{role:'system',content:'你是严谨的 Unity 2021 课程备课助手，输出整洁的中文 Markdown，不添加多余解释。'},{role:'user',content:prompt}],{maxTokens:1600});requireThat(text(ans,40000),503,'MODEL_EMPTY','模型未返回有效内容');return ans;}
 async function aiSlides(engine,sources,title,minutes,topics,lesson='',instructions=''){const prompt=`你是 Unity 2021 课程备课助手。依据资料和当前教案生成课堂幻灯片大纲，仅返回 JSON 数组，每项包含 title、points（字符串数组）和可选 notes。第1页封面，最后一页总结与作业。资料：${JSON.stringify(sources.slice(0,12))}\n标题：${title}，时长${minutes}分钟，重点：${(topics||[]).join('、')}。\n当前教案：${lesson}\n教师要求：${instructions}`;const ans=await aiChat(engine,[{role:'user',content:prompt}],{maxTokens:1800});const slides=parseSlides(ans);requireThat(slides&&slides.length,503,'MODEL_EMPTY','模型未返回有效幻灯片结构');return slides;}
 return async ctx=>{
  if(!ctx.pathname.startsWith('/api/preparation/'))return false;
  const user=needUser(ctx.session),source=course(user),path=ctx.pathname.slice('/api/preparation/'.length).split('/');
  const b=['POST','PUT'].includes(ctx.method)?await bodyOf(ctx.req):{};
  const send=(s,v)=>{ctx.json(s,v);return true;};
  if(path[0]==='catalog'&&ctx.method==='GET')return send(200,{chapters:source.chapters.map(c=>({id:c.id,title:c.title,hours:c.hours,lessonIds:c.lessons.map(l=>l.id),objectives:c.lessons.flatMap(l=>l.objectives||[])})),models:await models(),types});
  if(path[0]==='generate'&&ctx.method==='POST'){
   const mode=b.mode==='free'?'free':'chapter';
   const minutes=Number(b.minutes);
   requireThat(Number.isInteger(minutes)&&minutes>=10&&minutes<=480,422,'INVALID_PREPARATION','课时需为 10–480 分钟之间的整数');
   let sources=[],objectives=[],topics=[],chapterTitle='',chapterId=null;
   if(mode==='chapter'){
    const chapter=source.chapters.find(c=>c.id===b.chapterId);
    requireThat(chapter&&types.includes(b.type||'lesson-plan'),422,'INVALID_PREPARATION','请选择章节与文档类型');
    chapterId=chapter.id;chapterTitle=chapter.title;
    sources=[{id:chapter.id,title:chapter.title,version:q('SELECT revision FROM courses WHERE id=?',courseId).revision,content:chapter.description,lessonIds:chapter.lessons.map(l=>l.id)}];
    for(const row of all("SELECT * FROM tool_items WHERE course_id=? AND class_id IS NULL AND kind IN ('knowledge','cases')",courseId)){const p=JSON.parse(row.payload);if(p.published)sources.push({id:row.id,title:p.title,content:p.content});}
    objectives=[...new Set(chapter.lessons.flatMap(l=>l.objectives||[]))];
    topics=[...new Set(chapter.lessons.flatMap(l=>l.keypoints||[]))];
   }else{
    requireThat(text(b.courseName,150)&&text(b.chapterContent,6000),422,'INVALID_PREPARATION','请填写课程名称与章节内容');
    chapterTitle=b.courseName.trim();
    let kp=[];
    if(Array.isArray(b.knowledgePoints))kp=b.knowledgePoints.map(s=>String(s).trim()).filter(Boolean);
    else if(typeof b.knowledgePoints==='string'&&b.knowledgePoints.trim())kp=b.knowledgePoints.split(/[;；,，\n]/).map(s=>s.trim()).filter(Boolean);
    topics=kp.length?kp:['理解并掌握本章核心内容'];
    objectives=topics;
    sources=[{id:'free',title:b.courseName.trim(),content:b.chapterContent.trim()+(kp.length?'\n知识点：'+kp.join('、'):'')}];
   }
   const outputs=Array.isArray(b.outputs)&&b.outputs.length?b.outputs.filter(x=>['lesson-plan','task-sheet','ppt'].includes(x)):(b.type==='task-sheet'?['task-sheet']:['lesson-plan']);
   requireThat(outputs.length,422,'INVALID_PREPARATION','请选择至少一种生成产物');
   let engine=null;
   if(b.engine){try{engine=await resolveEngine(db,q,b.engine);}catch{engine=null;}}
   let lessonPlan=outputs.includes('lesson-plan')?lessonPlanChapter(chapterTitle,minutes,objectives,topics):'';
   let taskSheet=outputs.includes('task-sheet')?taskSheetChapter(chapterTitle,minutes,objectives):'';
   let slides=null;
   if(b.engine)requireThat(engine,422,'INVALID_ENGINE','所选模型不可用，请检查模型配置或选择课程结构模板');
   if(engine){if(lessonPlan)lessonPlan=await aiText(engine,sources,'完善以下 Unity 2021 课程教案草稿。教师要求：'+(b.instructions||''),lessonPlan);if(taskSheet)taskSheet=await aiText(engine,sources,'完善以下 Unity 2021 课程实操任务单草稿。教师要求：'+(b.instructions||''),taskSheet);if(outputs.includes('ppt'))slides=await aiSlides(engine,sources,chapterTitle,minutes,topics,lessonPlan||taskSheet,b.instructions||'');}
   if(outputs.includes('ppt')&&!slides)slides=slidesFromText(lessonPlan||taskSheet||chapterTitle,chapterTitle,topics);
   if(b.instructions&&text(b.instructions,2000)){if(lessonPlan)lessonPlan+='\n\n## 教师补充要求\n'+b.instructions;if(taskSheet)taskSheet+='\n\n## 教师补充要求\n'+b.instructions;}
   let content=lessonPlan||taskSheet||slidesToText(slides);
   const id='prep-'+randomUUID(),at=new Date().toISOString(),meta={chapterId,mode,minutes,outputs,sources,engine:b.engine||null,review:null,slides,slideGeneration:slides?{method:engine?'ai':'template',sourceContent:content}:null};
   const titleSuffix=outputs.includes('ppt')&&!lessonPlan&&!taskSheet?' PPT大纲':(lessonPlan?' 教案':(taskSheet?' 任务单':' PPT大纲'));
   run('INSERT INTO preparation_drafts VALUES(?,?,?,?,?,?,?,?,?)',id,courseId,user.id,chapterTitle+titleSuffix,content,'draft',1,JSON.stringify(meta),at);
   history(draft(user,id),user);audit(user,'preparation.generated',id);return send(201,{draft:payload(draft(user,id))});
  }
  if(path[0]==='drafts'){
   if(!path[1]&&ctx.method==='GET')return send(200,{drafts:all('SELECT * FROM preparation_drafts WHERE course_id=? AND owner_id=? ORDER BY updated_at DESC',courseId,user.id).map(payload)});
   const row=draft(user,path[1]);
   if(path[2]==='slides'&&ctx.method==='POST'){
    requireThat(b.expectedRevision===row.revision,409,'REVISION_CONFLICT','草稿已更新，请重新加载');
    const meta=JSON.parse(row.payload),instructions=typeof b.instructions==='string'?b.instructions.trim():'';
    requireThat(instructions.length<=2000,422,'INVALID_CONTENT','教学侧重点不能超过 2000 字');
    const chosen=b.engine||'',engine=chosen?await resolveEngine(db,q,chosen):null;
    const slides=engine?await aiSlides(engine,meta.sources||[],row.title,meta.minutes||90,[],row.content,instructions):slidesFromText(row.content,row.title,[]);
    meta.slides=slides;meta.slideGeneration={method:engine?'ai':'template',sourceContent:row.content,instructions,engine:chosen||null};meta.review=null;
    const result=run('UPDATE preparation_drafts SET status=?,revision=revision+1,payload=?,updated_at=? WHERE id=? AND revision=?','draft',JSON.stringify(meta),new Date().toISOString(),row.id,row.revision);
    requireThat(result.changes===1,409,'REVISION_CONFLICT','草稿已更新，请重新加载');history(draft(user,row.id),user);audit(user,'preparation.slides',row.id);return send(200,{draft:payload(draft(user,row.id))});
   }
   if(path[2]==='export'&&ctx.method==='GET'){ctx.res.writeHead(200,{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':'attachment; filename="lesson-plan.md"','Cache-Control':'no-store'});ctx.res.end(row.content+'\n\n来源：\n'+JSON.parse(row.payload).sources.map(x=>'- '+x.title+' ['+x.id+']').join('\n'));return true;}
   if(path[2]==='export-pptx'&&ctx.method==='GET'){const meta=JSON.parse(row.payload);requireThat(Array.isArray(meta.slides)&&meta.slides.length,422,'NO_SLIDES','该草稿尚未生成幻灯片，无法导出 PPT');if(meta.slideGeneration?.sourceContent&&meta.slideGeneration.sourceContent!==row.content)throw new HttpError(409,'SLIDES_STALE','教案已修改，请根据当前教案重新生成 PPT');const buf=await buildPptx({title:row.title},meta.slides);ctx.res.writeHead(200,{'Content-Type':'application/vnd.openxmlformats-officedocument.presentationml.presentation; charset=utf-8','Content-Disposition':'attachment; filename="'+encodeURIComponent(row.title||'lesson')+'.pptx"','Cache-Control':'no-store','Content-Length':buf.length});ctx.res.end(buf);return true;}
   if(path[2]==='history'&&ctx.method==='GET')return send(200,{history:all('SELECT revision,snapshot,actor,at FROM preparation_history WHERE draft_id=? ORDER BY revision DESC',row.id).map(x=>({...x,snapshot:JSON.parse(x.snapshot)}))});
   requireThat(b.expectedRevision===row.revision,409,'REVISION_CONFLICT','草稿已更新，请重新加载');const meta=JSON.parse(row.payload);let title=row.title,content=row.content,status='draft';
   if(ctx.method==='PUT'&&!path[2]){requireThat(text(b.title,200)&&text(b.content,30000),422,'INVALID_CONTENT','标题或内容无效');title=b.title;content=b.content;meta.review=null;}
   else {requireThat(ctx.method==='POST'&&path[2]==='review'&&['approved','draft'].includes(b.decision)&&text(b.note,2000),422,'INVALID_REVIEW','请填写审核决定与说明');status=b.decision;meta.review={actor:user.username,note:b.note,at:new Date().toISOString()};}
   const result=run('UPDATE preparation_drafts SET title=?,content=?,status=?,revision=revision+1,payload=?,updated_at=? WHERE id=? AND revision=?',title,content,status,JSON.stringify(meta),new Date().toISOString(),row.id,row.revision);requireThat(result.changes===1,409,'REVISION_CONFLICT','草稿已更新');history(draft(user,row.id),user);audit(user,'preparation.'+status,row.id);return send(200,{draft:payload(draft(user,row.id))});
  }
  return false;
 };
}
