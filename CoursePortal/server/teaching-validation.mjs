import {HttpError,requireThat} from './validation.mjs';
import {normalizeRubric,rubricMaxMismatch} from './grading.mjs';
const text=(v,max=5000)=>typeof v==='string'&&v.length<=max;
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)&&!['__proto__','constructor','prototype','toString'].includes(v);
const iso=v=>typeof v==='string'&&v.length<=40&&!Number.isNaN(Date.parse(v));
const num=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;

export function validateClass(input){
 const errors=[];const check=(ok,msg)=>{if(!ok)errors.push(msg);};
 check(input&&typeof input==='object'&&!Array.isArray(input),'班级数据无效');
 if(errors.length)throw new HttpError(422,'INVALID_CLASS','班级信息不完整',errors);
 check(text(input.name,80)&&input.name.trim(),'请填写班级名称');
 check(input.termId===null||input.termId===undefined||id(input.termId),'学期标识无效');
 check(input.teacherUsername===undefined||input.teacherUsername===null||(typeof input.teacherUsername==='string'&&input.teacherUsername.length<=50),'授课教师账号无效');
 check(input.publishedRevision===null||input.publishedRevision===undefined||Number.isInteger(input.publishedRevision),'课程版本无效');
 if(errors.length)throw new HttpError(422,'INVALID_CLASS','请检查班级信息',errors);
 return {name:input.name.trim(),termId:input.termId||null,teacherUsername:input.teacherUsername||null,publishedRevision:input.publishedRevision??null};
}

export function validateTerm(input){
 const errors=[];const check=(ok,msg)=>{if(!ok)errors.push(msg);};
 check(input&&typeof input==='object','学期数据无效');
 check(text(input.name,60)&&input.name.trim(),'请填写学期名称');
 check(input.startDate===null||input.startDate===undefined||iso(input.startDate),'开学日期无效');
 check(input.endDate===null||input.endDate===undefined||iso(input.endDate),'结业日期无效');
 if(input.startDate&&input.endDate)check(Date.parse(input.startDate)<=Date.parse(input.endDate),'结业日期不能早于开学日期');
 if(errors.length)throw new HttpError(422,'INVALID_TERM','请检查学期信息',errors);
 return {name:input.name.trim(),startDate:input.startDate||null,endDate:input.endDate||null};
}

// 名单导入：每行 studentNo/name/username 三者至少提供 username，
// 重复（同一 username 在本班已存在）由导入预览识别，不静默覆盖。
export function validateRoster(input){
 const rows=Array.isArray(input?.rows)?input.rows:[];
 requireThat(rows.length<=500,422,'ROSTER_TOO_LARGE','一次最多导入500行');
 const errors=[],clean=[];
 rows.forEach((raw,index)=>{
  const studentNo=typeof raw?.studentNo==='string'?raw.studentNo.trim().slice(0,40):'';
  const displayName=typeof raw?.name==='string'?raw.name.trim().slice(0,60):'';
  const username=typeof raw?.username==='string'?raw.username.trim().toLowerCase().slice(0,50):'';
  if(!studentNo&&!displayName&&!username){errors.push({row:index+1,message:'该行没有可识别信息'});return;}
  if(!username){errors.push({row:index+1,message:'缺少账号，无法对应登录用户'});return;}
  if(!/^[a-z0-9][a-z0-9_.-]{2,49}$/.test(username)){errors.push({row:index+1,message:'账号格式无效（3—50位小写字母数字）'});return;}
  clean.push({row:index+1,studentNo,displayName:displayName||username,username,groupName:typeof raw?.groupName==='string'?raw.groupName.trim().slice(0,40):null});
 });
 return {rows:clean,errors};
}

export function validateTask(input){
 const errors=[];const check=(ok,msg)=>{if(!ok)errors.push(msg);};
 check(input&&typeof input==='object'&&!Array.isArray(input),'任务数据无效');
 if(errors.length)throw new HttpError(422,'INVALID_TASK','任务内容不完整',errors);
 check(text(input.title,200)&&input.title.trim(),'请填写任务标题');
 check(text(input.description??'',5000),'任务说明过长');
 check(['lab','work','quiz','report'].includes(input.type),'任务类型无效');
 check(input.lessonId===null||input.lessonId===undefined||id(input.lessonId),'关联课时标识无效');
 check(input.labId===null||input.labId===undefined||id(input.labId),'关联实验标识无效');
 check(text(input.ideologicalNote??'',2000),'育人要求过长');
 check(num(Number(input.maxScore),1,1000),'任务满分须为1—1000之间的数值');
 check(num(Number(input.weight),0,100),'任务在总评中的占比须在0—100之间');
 check(input.opensAt===null||input.opensAt===undefined||iso(input.opensAt),'开放时间无效');
 check(input.dueAt===null||input.dueAt===undefined||iso(input.dueAt),'截止时间无效');
 if(input.opensAt&&input.dueAt)check(Date.parse(input.opensAt)<=Date.parse(input.dueAt),'截止时间不能早于开放时间');
 check(typeof input.allowLate==='undefined'||typeof input.allowLate==='boolean','补交设置无效');
 check(typeof input.allowResubmit==='undefined'||typeof input.allowResubmit==='boolean','重做设置无效');
 check(Number.isInteger(input.maxAttempts)&&Number(input.maxAttempts)>=1&&Number(input.maxAttempts)<=20,'重做次数须为1—20之间的整数');
 const rubric=normalizeRubric(input.rubric);
 errors.push(...rubric.errors);
 if(!rubric.errors.length&&rubricMaxMismatch(rubric.rubric,Number(input.maxScore)))errors.push('量规维度满分之和须等于任务满分');
 const outcomeIds=Array.isArray(input.outcomeIds)?input.outcomeIds:[];
 check(outcomeIds.length<=100&&outcomeIds.every(id),'关联课程目标无效');
 // 任务—目标关联带贡献权重：同一任务对不同目标的贡献可以不同，缺省按等权处理。
 const rawLinks=Array.isArray(input.outcomeLinks)?input.outcomeLinks:[];
 check(rawLinks.length<=100,'关联课程目标过多');
 const outcomeLinks=[];
 for(const raw of rawLinks){
  const outcomeId=typeof raw?.outcomeId==='string'?raw.outcomeId.trim():'';
  if(!id(outcomeId)){errors.push('目标关联标识无效');continue;}
  const contribution=raw?.contribution===undefined||raw?.contribution===null?1:Number(raw.contribution);
  if(!num(contribution,0,100)){errors.push('目标贡献须在0—100之间');continue;}
  outcomeLinks.push({outcomeId,contribution});
 }
 if(errors.length)throw new HttpError(422,'INVALID_TASK','请检查任务内容',[...new Set(errors)]);
 return {
  title:input.title.trim(),description:input.description||'',type:input.type,
  lessonId:input.lessonId||null,labId:input.labId||null,ideologicalNote:input.ideologicalNote||'',
  rubric:rubric.rubric,maxScore:Number(input.maxScore),weight:Number(input.weight),
  opensAt:input.opensAt||null,dueAt:input.dueAt||null,
  allowLate:input.allowLate===undefined?true:Boolean(input.allowLate),
  allowResubmit:input.allowResubmit===undefined?true:Boolean(input.allowResubmit),
  maxAttempts:Number(input.maxAttempts),outcomeIds:[...new Set(outcomeIds)],outcomeLinks,
 };
}

export function validateSubmission(input){
 const errors=[];const check=(ok,msg)=>{if(!ok)errors.push(msg);};
 check(input&&typeof input==='object','提交数据无效');
 check(typeof input.idempotencyKey==='string'&&input.idempotencyKey.trim()&&input.idempotencyKey.length<=200,'提交标识无效');
 check(input.sceneJson===null||input.sceneJson===undefined||text(input.sceneJson,400_000),'场景数据过大');
 check(text(input.note??'',5000),'实验说明过长');
 check(input.checkResult===null||input.checkResult===undefined||(typeof input.checkResult==='object'&&!Array.isArray(input.checkResult)&&JSON.stringify(input.checkResult).length<=20000),'检测结果无效');
 check(input.attachmentIds===undefined||(Array.isArray(input.attachmentIds)&&input.attachmentIds.length<=5&&input.attachmentIds.every(id)),'附件标识无效');
 if(errors.length)throw new HttpError(422,'INVALID_SUBMISSION','提交内容不完整',errors);
 return {idempotencyKey:input.idempotencyKey.trim(),sceneJson:input.sceneJson??null,note:input.note||'',checkResult:input.checkResult??null,attachmentIds:[...new Set(input.attachmentIds||[])]};
}

export function validateGrading(input){
 const errors=[];const check=(ok,msg)=>{if(!ok)errors.push(msg);};
 check(input&&typeof input==='object','评分数据无效');
 check(text(input.feedback??'',5000),'评语过长');
 check(input.released===undefined||typeof input.released==='boolean','成绩发布设置无效');
 const scores=input.scores&&typeof input.scores==='object'&&!Array.isArray(input.scores)?input.scores:{};
 for(const key of Object.keys(scores))if(!id(key))errors.push('评分维度标识无效');
 if(errors.length)throw new HttpError(422,'INVALID_GRADING','评分内容不完整',errors);
 return {scores,feedback:input.feedback||'',released:input.released===undefined?false:Boolean(input.released)};
}

export function validateScoreRevision(input){
 const errors=[];const check=(ok,msg)=>{if(!ok)errors.push(msg);};
 check(input&&typeof input==='object','改分数据无效');
 const reason=typeof input.reason==='string'?input.reason.trim():'';
 check(reason.length>0&&reason.length<=500,'改分必须填写理由');
 check(input.score===null||input.score===undefined||num(Number(input.score),0,1000),'改分后的分数无效');
 if(errors.length)throw new HttpError(422,'INVALID_REVISION','请检查改分信息',errors);
 return {reason,score:input.score===null||input.score===undefined?null:Number(input.score)};
}

// 已发布任务的规则调整：只允许改时间与提交规则，不动量规与满分，避免已提交成绩被悄悄改变。
export function validateTaskRules(input){
 const errors=[];const check=(ok,msg)=>{if(!ok)errors.push(msg);};
 check(input&&typeof input==='object'&&!Array.isArray(input),'规则数据无效');
 if(errors.length)throw new HttpError(422,'INVALID_RULES','请检查任务规则',errors);
 check(input.opensAt===undefined||input.opensAt===null||iso(input.opensAt),'开放时间无效');
 check(input.dueAt===undefined||input.dueAt===null||iso(input.dueAt),'截止时间无效');
 check(input.allowLate===undefined||typeof input.allowLate==='boolean','补交设置无效');
 check(input.allowResubmit===undefined||typeof input.allowResubmit==='boolean','重做设置无效');
 check(input.maxAttempts===undefined||(Number.isInteger(Number(input.maxAttempts))&&Number(input.maxAttempts)>=1&&Number(input.maxAttempts)<=20),'重做次数须为1—20之间的整数');
 check(input.note===undefined||text(input.note,500),'调整说明过长');
 if(input.opensAt&&input.dueAt)check(Date.parse(input.opensAt)<=Date.parse(input.dueAt),'截止时间不能早于开放时间');
 if(errors.length)throw new HttpError(422,'INVALID_RULES','请检查任务规则',errors);
 const out={};
 if(input.opensAt!==undefined)out.opensAt=input.opensAt||null;
 if(input.dueAt!==undefined)out.dueAt=input.dueAt||null;
 if(input.allowLate!==undefined)out.allowLate=input.allowLate;
 if(input.allowResubmit!==undefined)out.allowResubmit=input.allowResubmit;
 if(input.maxAttempts!==undefined)out.maxAttempts=Number(input.maxAttempts);
 out.note=typeof input.note==='string'?input.note.trim():'';
 return out;
}

export function validateAppeal(input){
 const errors=[];const check=(ok,msg)=>{if(!ok)errors.push(msg);};
 check(input&&typeof input==='object'&&!Array.isArray(input),'复核申请无效');
 const reason=typeof input.reason==='string'?input.reason.trim():'';
 check(reason.length>=5&&reason.length<=1000,'复核理由需 5—1000 字，写清具体疑点');
 if(errors.length)throw new HttpError(422,'INVALID_APPEAL','请检查复核申请',errors);
 return {reason};
}

// 复核处理：revise 必须给出新分数，uphold 只需说明理由。
export function validateAppealDecision(input){
 const errors=[];const check=(ok,msg)=>{if(!ok)errors.push(msg);};
 check(input&&typeof input==='object'&&!Array.isArray(input),'复核处理无效');
 check(['revise','uphold'].includes(input?.decision),'请选择处理方式');
 check(input?.note===undefined||text(input.note,1000),'处理说明过长');
 if(input?.decision==='revise')check(num(Number(input?.score),0,1000),'改分后的分数无效');
 if(errors.length)throw new HttpError(422,'INVALID_DECISION','请检查复核处理',errors);
 return {decision:input.decision,score:input.decision==='revise'?Number(input.score):null,note:typeof input.note==='string'?input.note.trim():''};
}

export function validateIntervention(input){
 const errors=[];const check=(ok,msg)=>{if(!ok)errors.push(msg);};
 check(input&&typeof input==='object','辅导记录无效');
 check(['remind','tutor','reassign','closed'].includes(input.kind),'辅导类型无效');
 check(text(input.note??'',2000),'辅导记录过长');
 check(input.taskId===null||input.taskId===undefined||id(input.taskId),'关联任务标识无效');
 if(errors.length)throw new HttpError(422,'INVALID_INTERVENTION','请检查辅导记录',errors);
 return {kind:input.kind,note:input.note||'',taskId:input.taskId||null};
}
