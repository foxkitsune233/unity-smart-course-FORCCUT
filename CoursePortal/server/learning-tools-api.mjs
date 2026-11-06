import {randomUUID} from 'node:crypto';
import {requireThat,HttpError} from './validation.mjs';
import {aiChat,resolveEngine} from './ai-config.mjs';
export function createLearningToolsApi({db,q,all,run,needUser,bodyOf}){
 db.exec(`CREATE TABLE IF NOT EXISTS tool_items(id TEXT PRIMARY KEY,kind TEXT NOT NULL,course_id TEXT NOT NULL,class_id TEXT,owner_id TEXT NOT NULL,payload TEXT NOT NULL,at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS idx_tool_kind ON tool_items(kind,class_id);`);
 const courseDefault='unity-script-2021';
 const versionedResources=new Set(['knowledge','cases','videos']);
 const parse=r=>({...JSON.parse(r.payload),id:r.id,courseId:r.course_id,classId:r.class_id,ownerId:r.owner_id,createdAt:r.at});
 const text=(v,max=10000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
 function access(u,courseId,classId,write=false){
  if(classId){const c=q('SELECT * FROM classes WHERE id=?',classId);requireThat(c&&c.course_id===courseId,404,'CLASS_NOT_FOUND','班级不存在');
   const staff=c.teacher_id===u.id||q("SELECT 1 FROM class_staff WHERE class_id=? AND user_id=?",classId,u.id)||q("SELECT 1 FROM course_members WHERE course_id=? AND user_id=? AND role IN ('owner','teacher')",courseId,u.id);
   if(write){requireThat(staff,403,'FORBIDDEN','需要本班教师权限');return;}
   requireThat(staff||q("SELECT 1 FROM class_members WHERE class_id=? AND student_id=? AND status!='archived'",classId,u.id),403,'FORBIDDEN','无权访问本班内容');return;
  }
  const teacher=q("SELECT 1 FROM course_members WHERE course_id=? AND user_id=? AND role IN ('owner','teacher')",courseId,u.id);
  requireThat(teacher||(!write&&q("SELECT 1 FROM class_members m JOIN classes c ON c.id=m.class_id WHERE c.course_id=? AND m.student_id=? AND m.status!='archived'",courseId,u.id)),403,'FORBIDDEN','无权访问课程资料');
 }
 function rows(kind,courseId,classId){return all('SELECT * FROM tool_items WHERE kind=? AND course_id=? AND class_id IS ? ORDER BY at DESC',kind,courseId,classId||null).map(parse);}
 function save(kind,u,courseId,classId,p,id='tool-'+randomUUID()){run('INSERT INTO tool_items VALUES(?,?,?,?,?,?,?)',id,kind,courseId,classId||null,u.id,JSON.stringify(p),new Date().toISOString());return parse(q('SELECT * FROM tool_items WHERE id=?',id));}
 function history(item){return rows('history',item.courseId,null).filter(x=>x.itemId===item.id);}
 function snapshot(item,u){save('history',u,item.courseId,null,{itemId:item.id,version:item.version||1,snapshot:item});}
 function evidence(classId,studentId){const tasks=all("SELECT id FROM tasks WHERE class_id=? AND status='published'",classId);const submissions=all('SELECT s.id,s.task_id AS taskId,s.score,s.status,s.attempt,s.submitted_at AS submittedAt FROM submissions s JOIN tasks t ON t.id=s.task_id WHERE t.class_id=? AND s.student_id=?',classId,studentId);return {at:new Date().toISOString(),tasksTotal:tasks.length,submittedTasks:new Set(submissions.map(x=>x.taskId)).size,submissions};}
 function profile(classId,studentId){
  const tasks=all("SELECT id,title,due_at AS dueAt FROM tasks WHERE class_id=? AND status='published'",classId);
  const allSubs=all('SELECT s.*,t.max_score AS maxScore FROM submissions s JOIN tasks t ON t.id=s.task_id WHERE t.class_id=? AND s.student_id=? ORDER BY s.attempt DESC',classId,studentId);
  const latest=new Map();for(const s of allSubs)if(!latest.has(s.task_id))latest.set(s.task_id,s);
  const submitted=latest.size,checked=[...latest.values()].filter(s=>{try{return JSON.parse(s.check_result||'null')?.passed===true;}catch{return false;}});
  const overdue=tasks.filter(t=>t.dueAt&&Date.parse(t.dueAt)<Date.now()&&!latest.has(t.id));
  const attempts=rows('attempts',q('SELECT course_id FROM classes WHERE id=?',classId).course_id,classId).filter(x=>x.ownerId===studentId);
  const newest=new Map();for(const a of attempts)if(!newest.has(a.quizId)||Date.parse(newest.get(a.quizId).createdAt||0)<Date.parse(a.createdAt||0))newest.set(a.quizId,a);
  const quizScores=[...newest.values()].map(x=>Number(x.score)).filter(Number.isFinite),quizAverage=quizScores.length?Math.round(quizScores.reduce((a,b)=>a+b,0)/quizScores.length*100)/100:null;
  const pendingAlerts=rows('alert_decisions',q('SELECT course_id FROM classes WHERE id=?',classId).course_id,classId).filter(x=>x.studentId===studentId&&x.status==='confirmed').length;
  const ratio=tasks.length?submitted/tasks.length:1,passRate=tasks.length?checked.length/tasks.length:1;
  const band=(overdue.length||pendingAlerts||ratio<.5)?'intervene':(ratio<.8||passRate<.7||(quizAverage!=null&&quizAverage<70)?'consolidate':'on_track');
  const labels={on_track:'进展良好',consolidate:'需要巩固',intervene:'需要干预'};
  const recommendations=[];if(overdue.length)recommendations.push({type:'task',title:'优先补交逾期任务',items:overdue.map(t=>({id:t.id,title:t.title}))});if(ratio<.8)recommendations.push({type:'task',title:'完成未提交的已下发任务',items:tasks.filter(t=>!latest.has(t.id)).map(t=>({id:t.id,title:t.title}))});if(passRate<.7)recommendations.push({type:'lab',title:'重新练习未通过的实验步骤',items:[]});
  const weakIds=[...new Set([...newest.values()].flatMap(a=>(a.results||[]).filter(r=>!r.correct).flatMap(r=>get(r.questionId,'questions').knowledgeIds||[])))];
  if(quizAverage!=null&&quizAverage<70)recommendations.push({type:'quiz',title:'复习测验失分知识点',items:weakIds.map(id=>{const x=rows('knowledge',q('SELECT course_id FROM classes WHERE id=?',classId).course_id,null).find(k=>k.id===id);return {id,title:x?.title||id};})});
  if(!recommendations.length)recommendations.push({type:'next',title:'保持当前进度，完成下一章节实验',items:[]});
  return {studentId,band,label:labels[band],metrics:{tasksTotal:tasks.length,submitted,submissionRate:Math.round(ratio*100),checked:checked.length,passRate:Math.round(passRate*100),quizAverage,overdue:overdue.length,confirmedAlerts:pendingAlerts},weakKnowledgeIds:weakIds,recommendations};
 }
 // 解析可用模型：优先使用指定引擎；否则回退到首个已启用云模型，再回退本地 Ollama。
 async function resolveAnyEngine(engine){
  if(engine){try{return await resolveEngine(db,q,engine);}catch{return null;}}
  const cloud=all('SELECT * FROM ai_providers WHERE enabled=1 LIMIT 1');
  if(cloud.length)return {type:cloud[0].type,base_url:cloud[0].base_url,model:cloud[0].model,api_key:cloud[0].api_key};
  try{const r=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(2000)});if(r.ok){const m=(await r.json()).models;if(m&&m.length)return {type:'ollama',base_url:'http://127.0.0.1:11434',model:m[0].name};}}catch{}
  return null;
 }
 // 基于学情数据生成 AI 诊断与建议；无可用模型时返回规则化降级说明。
 async function aiSummary(classId,studentId,engine){
  const p=profile(classId,studentId);
  const courseId=q('SELECT course_id FROM classes WHERE id=?',classId).course_id;
  const weakTitles=p.weakKnowledgeIds.map(id=>{const k=rows('knowledge',courseId,null).find(x=>x.id===id);return k?k.title:id;});
  const provider=await resolveAnyEngine(engine||null);
  if(!provider)return {available:false,summary:'当前未配置可用模型（本地 Ollama 或已接入 API Key 的云模型），仅展示规则化建议。',recommendationsText:'',weakKnowledgeTitles:weakTitles};
  const messages=[
   {role:'system',content:'你是高校 Unity 游戏开发课程的学情分析师。基于学生数据，用简体中文输出两部分：\n一、学情诊断（2-4 句，结合具体数据指出优势与短板，不要编造未提供的数据）；\n二、学习建议（3-5 条，具体、可执行，结合薄弱知识点）。\n只输出分析内容，不要使用 Markdown 标题符号。'},
   {role:'user',content:'学生学情数据：'+JSON.stringify({metrics:p.metrics,weakKnowledgeTitles:weakTitles,recommendations:p.recommendations},null,2)}
  ];
  try{const text=await aiChat(provider,messages,{maxTokens:700});return {available:true,summary:text,weakKnowledgeTitles:weakTitles,engine:engine||'default'};}catch{return {available:false,summary:'模型调用失败或超时，请检查模型配置与网络。',recommendationsText:'',weakKnowledgeTitles:weakTitles};}
 }
 function reminders(classId){const courseId=q('SELECT course_id FROM classes WHERE id=?',classId).course_id,members=all("SELECT student_id FROM class_members WHERE class_id=? AND status!='archived'",classId),tasks=all("SELECT id,due_at AS dueAt FROM tasks WHERE class_id=? AND status='published'",classId),pending=all("SELECT s.id FROM submissions s JOIN tasks t ON t.id=s.task_id WHERE t.class_id=? AND s.status!='graded'",classId).length;let overdue=0;for(const m of members)for(const t of tasks)if(t.dueAt&&Date.parse(t.dueAt)<Date.now()&&!q('SELECT 1 FROM submissions WHERE task_id=? AND student_id=?',t.id,m.student_id))overdue++;const decisions=rows('alert_decisions',courseId,classId).filter(x=>x.status==='confirmed').length;const reviews=rows('interventions',courseId,classId).filter(x=>x.status!=='closed'&&Date.parse(x.reviewAt||'')<=Date.now()).length;return {counts:{pendingGrading:pending,overdue,pendingAlerts:decisions,reviewsDue:reviews},items:[{type:'pendingGrading',count:pending,label:'待批阅提交'},{type:'overdue',count:overdue,label:'逾期未交'},{type:'pendingAlerts',count:decisions,label:'待处理预警'},{type:'reviewsDue',count:reviews,label:'到期复查'}].filter(x=>x.count>0)};}
 function associations(list,courseId){requireThat(Array.isArray(list)&&list.length<=100,422,'INVALID_ASSOCIATIONS','关联列表无效');for(const a of list){requireThat(a&&['lesson','lab','question','task','outcome','rubric'].includes(a.type)&&typeof a.id==='string',422,'INVALID_ASSOCIATION','关联类型或标识无效');const course=JSON.parse(q('SELECT draft_json FROM courses WHERE id=?',courseId)?.draft_json||'{}');let ok=false;if(a.type==='lesson')ok=[...(course.chapters||[]),...(course.curriculum?.optionalChapters||[])].some(c=>c.lessons.some(l=>l.id===a.id));if(a.type==='lab')ok=/^lab(0[1-9]|10)$/.test(a.id);if(a.type==='question')ok=q("SELECT 1 FROM tool_items WHERE id=? AND kind='questions' AND course_id=?",a.id,courseId);if(a.type==='task')ok=q('SELECT 1 FROM tasks WHERE id=? AND course_id=?',a.id,courseId);if(a.type==='outcome')ok=(course.outcomes||[]).some(x=>x.id===a.id)||q('SELECT 1 FROM course_outcomes WHERE id=? AND course_id=?',a.id,courseId);if(a.type==='rubric'){const t=q('SELECT rubric_json FROM tasks WHERE id=? AND course_id=?',a.taskId||'',courseId);ok=t&&JSON.parse(t.rubric_json).some(x=>x.id===a.id);}requireThat(ok,422,'INVALID_ASSOCIATION','关联资源不存在或不属于本课程');}return list;}
 function normalize(kind,p,u,courseId,classId,previous){
  p.version=previous?(previous.version||1)+1:1;
  if(['knowledge','cases','videos','threads','notices'].includes(kind))requireThat(text(p.title,200)&&text(p.content),422,'INVALID_CONTENT','请填写有效标题和内容');
  if(kind==='questions'&&p.type==='boolean')requireThat(p.options.length===2,422,'INVALID_QUESTION','判断题只能包含两个选项');
  if(kind==='questions'){p.difficulty=p.difficulty||'medium';requireThat(['easy','medium','hard'].includes(p.difficulty),422,'INVALID_DIFFICULTY','难度无效');p.knowledgeIds=p.knowledgeIds||[];requireThat(Array.isArray(p.knowledgeIds)&&p.knowledgeIds.every(id=>q("SELECT 1 FROM tool_items WHERE id=? AND kind='knowledge' AND course_id=?",id,courseId)),422,'INVALID_KNOWLEDGE','知识点不存在或跨课程');}
  if(kind==='knowledge'){p.associations=associations(p.associations||[],courseId);p.published=p.published===true;if(p.published){p.reviewedBy=u.username;p.reviewedAt=new Date().toISOString();}}
  if(kind==='threads'){p.category=p.category||'question';p.status=p.status||'open';requireThat(['question','discussion','issue'].includes(p.category)&&['open','resolved'].includes(p.status),422,'INVALID_THREAD','问题类别或状态无效');p.authorName=p.authorName||u.name||u.username;p.authorRole=p.authorRole||u.global_role;}
  if(kind==='notices'&&p.taskId){const t=q('SELECT * FROM tasks WHERE id=? AND class_id=? AND course_id=?',p.taskId,classId,courseId);requireThat(t,422,'INVALID_TASK','提醒任务不属于本班');p.courseRevision=t.course_revision;p.taskVersion=t.updated_at;}
  if(kind==='interventions'){if(!previous){p.windowDays=[7,14].includes(p.windowDays)?p.windowDays:7;p.beforeEvidence=evidence(classId,p.studentId);p.reviewAt=new Date(Date.now()+p.windowDays*86400000).toISOString();}else if(p.status==='closed'){requireThat(text(p.observation,5000),422,'OBSERVATION_REQUIRED','结案须填写观测说明');p.afterEvidence=evidence(classId,p.studentId);p.closedAt=new Date().toISOString();}}
  return p;
 }
 function get(id,kind){const r=q('SELECT * FROM tool_items WHERE id=? AND kind=?',id,kind);requireThat(r,404,'NOT_FOUND','内容不存在');return parse(r);}
  const cleanQuestion=x=>{const {answer,explanation,...rest}=x;return rest;};
 function validateQuestion(b){requireThat(text(b.title,2000)&&['single','multiple','boolean'].includes(b.type)&&Array.isArray(b.options)&&b.options.length>=2&&b.options.length<=8&&b.options.every(x=>text(x,1000))&&Array.isArray(b.answer)&&b.answer.length>0&&b.answer.every(x=>Number.isInteger(x)&&x>=0&&x<b.options.length)&&new Set(b.answer).size===b.answer.length&&(b.type==='multiple'||b.answer.length===1),422,'INVALID_QUESTION','题目、选项或答案无效');return {title:b.title,type:b.type,options:b.options,answer:b.answer,explanation:typeof b.explanation==='string'?b.explanation.slice(0,5000):''};}
 return async ctx=>{
  if(!ctx.pathname.startsWith('/api/tools/'))return false;
  const u=needUser(ctx.session),parts=ctx.pathname.slice('/api/tools/'.length).split('/'),kind=parts[0],id=parts[1],action=parts[2],method=ctx.method;
  const b=['POST','PUT','PATCH'].includes(method)?await bodyOf(ctx.req):{};
  const courseId=b.courseId||ctx.url.searchParams.get('courseId')||courseDefault,classId=['knowledge','cases','videos','questions'].includes(kind)?null:b.classId||ctx.url.searchParams.get('classId')||null;
  const send=(status,data)=>{ctx.json(status,data);return true;};
  if(kind==='profiles'&&method==='GET'){
   requireThat(classId,422,'CLASS_REQUIRED','请选择教学班');
   const courseId=q('SELECT course_id FROM classes WHERE id=?',classId).course_id;requireThat(courseId,404,'CLASS_NOT_FOUND','班级不存在');
   const members=all("SELECT student_id FROM class_members WHERE class_id=? AND status!='archived'",classId);
   access(u,courseId,classId,false);
   if(id==='ai-summary'){
    const sid=ctx.url.searchParams.get('studentId')||'me';let targetId;
    if(sid==='me'){requireThat(u.global_role==='student',403,'FORBIDDEN','该接口仅供学生使用');requireThat(members.some(x=>x.student_id===u.id),403,'FORBIDDEN','你不在本教学班');targetId=u.id;}
    else{requireThat(u.global_role!=='student',403,'FORBIDDEN','仅教师可查看他人学情');requireThat(members.some(x=>x.student_id===sid),422,'INVALID_STUDENT','该学生不属于本班');targetId=sid;}
    const engine=ctx.url.searchParams.get('engine')||null;
    const ai=await aiSummary(classId,targetId,engine);
    return send(200,{profile:profile(classId,targetId),ai});
   }
   if(id==='me'){requireThat(u.global_role==='student',403,'FORBIDDEN','该接口仅供学生使用');requireThat(members.some(x=>x.student_id===u.id),403,'FORBIDDEN','你不在本教学班');return send(200,{item:profile(classId,u.id)});}
   requireThat(u.global_role!=='student',403,'FORBIDDEN','学生只能查看自己的学习建议');
   return send(200,{items:members.map(x=>profile(classId,x.student_id))});
  }
  if(kind==='reminders'&&method==='GET'){requireThat(classId,422,'CLASS_REQUIRED','请选择教学班');access(u,courseId,classId,true);return send(200,reminders(classId));}
  if(versionedResources.has(kind)&&id&&action==='history'&&method==='GET'){const item=get(id,kind);access(u,item.courseId,null,true);return send(200,{items:[...history(item),{version:item.version||1,snapshot:item}]});}
  if(versionedResources.has(kind)&&id&&action==='restore'&&method==='POST'){const item=get(id,kind);access(u,item.courseId,null,true);const chosen=[...history(item),{version:item.version||1,snapshot:item}].find(x=>Number(x.version)===Number(b.version));requireThat(chosen?.snapshot,404,'VERSION_NOT_FOUND','未找到指定资源版本');snapshot(item,u);const next={...chosen.snapshot,id:item.id,courseId:item.courseId,classId:null,ownerId:item.ownerId};normalize(kind,next,u,item.courseId,null,item);run('UPDATE tool_items SET payload=? WHERE id=?',JSON.stringify(next),id);return send(200,{item:next,restoredFrom:Number(b.version)});}
  if(kind==='questions'&&id&&action==='history'&&method==='GET'){const item=get(id,'questions');access(u,item.courseId,null,true);return send(200,{items:[...history(item),{version:item.version||1,snapshot:item}]});}
  if(kind==='alerts'&&id==='decision'&&method==='POST'){access(u,courseId,classId,true);requireThat(['confirmed','dismissed'].includes(b.status)&&text(b.reason,1000),422,'INVALID_DECISION','确认或关闭须说明理由');requireThat(q('SELECT 1 FROM class_members WHERE class_id=? AND student_id=?',classId,b.studentId),422,'INVALID_STUDENT','学生不属于本班');const rule=get(b.ruleId,'rules');requireThat(rule.classId===classId,422,'INVALID_RULE','规则不属于本班');return send(201,{item:save('alert_decisions',u,courseId,classId,{studentId:b.studentId,ruleId:b.ruleId,status:b.status,reason:b.reason})});}
  if(kind==='notices'&&id&&action==='read'&&method==='POST'){const n=get(id,'notices');access(u,n.courseId,n.classId);const previous=rows('notice_reads',n.courseId,n.classId).find(x=>x.noticeId===id&&x.ownerId===u.id);return send(200,{item:previous||save('notice_reads',u,n.courseId,n.classId,{noticeId:id})});}

  if(kind==='ai'){
   if(id==='drafts'&&method==='GET'){access(u,courseId,null,true);return send(200,{items:rows('ai_drafts',courseId,null).filter(x=>x.ownerId===u.id)});}
   if(id==='models'&&method==='GET'){
    const engines=[];
    try{const r=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(2000)});if(r.ok)for(const m of (await r.json()).models||[])engines.push({id:'ollama:'+m.name,kind:'ollama',label:'本地 · '+m.name});}catch{}
    for(const row of all('SELECT * FROM ai_providers WHERE enabled=1'))engines.push({id:'cloud:'+row.id,kind:'cloud',label:row.name+' · '+row.model});
    return send(200,{engines});
   }
   access(u,courseId,null,action==='draft'||id==='draft');
   requireThat(method==='POST'&&['ask','draft'].includes(id)&&text(b.question,2000),422,'INVALID_AI','请填写问题');
   const sources=[...rows('knowledge',courseId,null),...rows('cases',courseId,null)].filter(x=>x.published).slice(0,15).map(x=>({id:x.id,title:x.title,content:x.content}));
   requireThat(sources.length>0,422,'NO_SOURCES','请先发布经过审核的课程知识或案例');
   const provider=await resolveAnyEngine(b.engine||(b.model?('ollama:'+b.model):null));
   requireThat(provider,503,'AI_UNAVAILABLE','未找到可用模型，请在「智能备课 → 模型配置」中添加本地 Ollama 或云模型（API Key）。');
   const messages=[{role:'system',content:'你是Unity2021课程助手，仅依据以下编号资料回答，使用[资料ID]引用；无依据明确说明。生成内容为草稿，不能代交作业。'},{role:'user',content:'资料：'+JSON.stringify(sources)+'\n问题：'+b.question}];
   try{const answer=await aiChat(provider,messages,{maxTokens:600});const saved=id==='draft'?save('ai_drafts',u,courseId,null,{title:b.question,answer,sources,status:'draft'}):null;return send(200,{answer,sources,draft:id==='draft',savedId:saved?.id});}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(503,'AI_FAILED','模型调用超时或不可用');}
  }
  if(kind==='alerts'){
   access(u,courseId,classId,true);const rules=rows('rules',courseId,classId),members=all("SELECT student_id FROM class_members WHERE class_id=? AND status!='archived'",classId),tasks=all("SELECT id FROM tasks WHERE class_id=? AND status='published'",classId),items=[];
   for(const m of members)for(const r of rules){
    const cutoff=Date.now()-(r.windowDays||7)*86400000;
    const subs=all("SELECT s.*,t.max_score AS maxScore FROM submissions s JOIN tasks t ON t.id=s.task_id WHERE s.student_id=? AND t.class_id=? AND t.status='published' ORDER BY s.attempt DESC",m.student_id,classId);
    const recent=subs.filter(s=>Date.parse(s.submitted_at)>=cutoff);let value=0;
    if(r.type==='missing')value=tasks.filter(t=>!subs.some(s=>s.task_id===t.id)).length;
    if(r.type==='low_score'){const seen=new Set(),g=recent.filter(s=>{if(s.score==null||seen.has(s.task_id))return false;seen.add(s.task_id);return true;});value=g.length?g.reduce((a,s)=>a+s.score/s.maxScore*100,0)/g.length:null;}
    if(r.type==='repeated_failure')value=recent.filter(s=>{try{return JSON.parse(s.check_result)?.passed===false;}catch{return false;}}).length;
    if(value!==null&&(r.type==='low_score'?value<r.threshold:value>=r.threshold))items.push({studentId:m.student_id,ruleId:r.id,title:r.title,type:r.type,value,threshold:r.threshold,windowDays:r.windowDays||7});
   }
   return send(200,{items:items.map(item=>({...item,decision:rows('alert_decisions',courseId,classId).find(x=>x.studentId===item.studentId&&x.ruleId===item.ruleId)||null}))});
  }
  if(kind==='quizzes'&&id){const quiz=get(id,'quizzes');access(u,quiz.courseId,quiz.classId);const teacher=u.global_role!=='student';
   if(!action&&method==='GET')return send(200,{quiz:{...quiz,questions:teacher?quiz.questions:quiz.questions.map(cleanQuestion)}});
   if(action==='attempts'){
    if(method==='GET')return send(200,{items:rows('attempts',quiz.courseId,quiz.classId).filter(x=>x.quizId===id&&(teacher||x.ownerId===u.id))});
    requireThat(method==='POST'&&!teacher&&text(b.idempotencyKey,200),422,'INVALID_ATTEMPT','提交标识无效');const old=rows('attempts',quiz.courseId,quiz.classId).find(x=>x.quizId===id&&x.ownerId===u.id&&x.idempotencyKey===b.idempotencyKey);if(old)return send(200,{attempt:old,duplicate:true});
    const results=quiz.questions.map(x=>{const answer=b.answers?.[x.id];requireThat(Array.isArray(answer)&&answer.every(v=>Number.isInteger(v)&&v>=0&&v<x.options.length)&&new Set(answer).size===answer.length,422,'INVALID_ANSWER','答案格式无效');return {questionId:x.id,correct:JSON.stringify([...answer].sort())===JSON.stringify([...x.answer].sort()),answer:x.answer,explanation:x.explanation};});
    const attempt=save('attempts',u,quiz.courseId,quiz.classId,{quizId:id,idempotencyKey:b.idempotencyKey,answers:b.answers,score:Math.round(results.filter(x=>x.correct).length/results.length*100),results});return send(201,{attempt});
   }
  }
  if(kind==='threads'&&id&&action==='replies'&&method==='POST'){const thread=get(id,'threads');access(u,thread.courseId,thread.classId);requireThat(text(b.content,5000),422,'INVALID_CONTENT','请填写回复');thread.replies=[...(thread.replies||[]),{id:randomUUID(),author:u.name||u.username,authorName:u.name||u.username,role:u.global_role,content:b.content,at:new Date().toISOString()}];run('UPDATE tool_items SET payload=? WHERE id=?',JSON.stringify(thread),id);return send(201,{item:thread});}
  requireThat(['knowledge','cases','videos','questions','quizzes','notices','threads','rules','interventions'].includes(kind),404,'NOT_FOUND','接口不存在');
  if(id){const item=get(id,kind);access(u,item.courseId,item.classId,true);if(method==='DELETE'){requireThat(!['knowledge'].includes(kind)||!rows('knowledge',item.courseId,null).some(x=>(x.prerequisites||[]).includes(id)),409,'REFERENCED','该知识点仍被引用');run('DELETE FROM tool_items WHERE id=?',id);return send(200,{ok:true});}requireThat(['PUT','PATCH'].includes(method)&&kind!=='quizzes',405,'METHOD','已发布测验不可修改');const next={...item,...b,id:item.id,courseId:item.courseId,classId:item.classId,ownerId:item.ownerId};if(kind==='questions')Object.assign(next,validateQuestion(next));normalize(kind,next,u,item.courseId,item.classId,item);if(kind==='knowledge'){requireThat(Array.isArray(next.prerequisites||[]),422,'INVALID_REFERENCE','先修关系格式错误');const graph=rows('knowledge',item.courseId,null),seen=new Set();function walk(key){requireThat(key!==id,422,'CYCLE','先修关系不能形成循环');if(seen.has(key))return;seen.add(key);const node=graph.find(x=>x.id===key);requireThat(node,422,'INVALID_REFERENCE','先修知识点不存在');for(const p of node.prerequisites||[])walk(p);}for(const p of next.prerequisites||[])walk(p);}if(kind==='interventions')requireThat(['open','closed'].includes(next.status)&&text(next.note,5000),422,'INVALID_INTERVENTION','状态或辅导记录无效');snapshot(item,u);run('UPDATE tool_items SET payload=? WHERE id=?',JSON.stringify(next),id);return send(200,{item:next});}
  const classRequired=['quizzes','notices','threads','rules','interventions'].includes(kind);requireThat(!classRequired||classId,422,'CLASS_REQUIRED','请选择班级');access(u,courseId,classId,['questions','rules','interventions'].includes(kind)||(method!=='GET'&&kind!=='threads'));
  if(method==='GET'){let items=rows(kind,courseId,classId);if(kind==='notices')items=items.map(x=>({...x,read:rows('notice_reads',courseId,classId).some(r=>r.noticeId===x.id&&r.ownerId===u.id)}));if(kind==='interventions')items=items.map(x=>({...x,currentEvidence:evidence(classId,x.studentId),reviewDue:x.status!=='closed'&&Date.parse(x.reviewAt||'')<=Date.now()}));if(u.global_role==='student'){items=items.filter(x=>!['knowledge','cases','videos'].includes(kind)||x.published);if(kind==='quizzes')items=items.map(x=>({...x,questions:x.questions.map(cleanQuestion)}));}return send(200,{items});}
  requireThat(method==='POST',405,'METHOD','方法不支持');let payload={...b};
  if(kind==='questions')payload={...validateQuestion(b),difficulty:b.difficulty,knowledgeIds:b.knowledgeIds};
  else if(kind==='quizzes'){requireThat(text(b.title,200)&&Array.isArray(b.questionIds)&&b.questionIds.length>0&&b.questionIds.length<=100,422,'INVALID_QUIZ','请选择试题');const questions=[...new Set(b.questionIds)].map(x=>{const q=get(x,'questions');return {...q,questionVersion:q.version||1};});requireThat(questions.every(x=>x.courseId===courseId),422,'INVALID_QUESTION','题目不属于本课程');payload={title:b.title,questions};}
  else if(kind==='rules'){requireThat(text(b.title,200)&&['missing','low_score','repeated_failure'].includes(b.type)&&Number.isFinite(b.threshold)&&b.threshold>=0&&b.threshold<=100,422,'INVALID_RULE','预警规则无效');payload.windowDays=[7,14].includes(b.windowDays)?b.windowDays:7;}
  else if(kind==='interventions'){requireThat(q("SELECT 1 FROM class_members WHERE class_id=? AND student_id=?",classId,b.studentId)&&text(b.note,5000),422,'INVALID_INTERVENTION','请选择本班学生并填写辅导内容');payload.status='open';}
  else {requireThat(text(b.title,200)&&text(b.content),422,'INVALID_CONTENT','请填写标题和内容');if(['knowledge','cases','videos'].includes(kind)){payload.published=b.published===true;payload.links=Array.isArray(b.links)?b.links.slice(0,30):[];payload.prerequisites=Array.isArray(b.prerequisites)?[...new Set(b.prerequisites)]:[];requireThat(payload.prerequisites.every(x=>rows('knowledge',courseId,null).some(y=>y.id===x)),422,'INVALID_REFERENCE','先修知识点不存在');}if(kind==='threads')payload.replies=[];}
  normalize(kind,payload,u,courseId,classId);return send(201,{item:save(kind,u,courseId,classId,payload)});
 };
}
