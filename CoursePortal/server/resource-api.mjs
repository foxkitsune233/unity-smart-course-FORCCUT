// 课件/素材统一资源库（TC04）。
// 与 tool_items 的 knowledge/cases/videos 分开：这里管课件、素材、讲义等通用资源，
// 额外承担来源与授权审核、发布下架、独立版本号。版本快照表由触发器保证不可变。
// 状态机：draft → pending → approved/rejected → published → offline（可重新 publish）。
// 任何内容编辑都会生成新版本并退回 draft，避免已发布内容被静默替换。
import {randomUUID} from 'node:crypto';
import {requireThat} from './validation.mjs';

export function createResourceApi({q,all,run,transaction,audit,needUser,bodyOf}){
 const stamp=()=>new Date().toISOString();
 const courseDefault='unity-script-2021';
 const kinds=new Set(['courseware','asset','video','handout','other']);
 const kindLabels={courseware:'课件',asset:'素材',video:'视频',handout:'讲义/资料',other:'其他'};
 const statusLabels={draft:'草稿',pending:'待审核',approved:'审核通过',rejected:'已驳回',published:'已发布',offline:'已下架'};
 const text=(v,max=4000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
 const bounded=(v,max=4000)=>typeof v==='string'?v.slice(0,max):'';
 const safeId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
 // 资源地址只允许 http(s) 外链、站内绝对路径、或带扩展名的本地文件名；禁止 javascript:/data:// 协议相对地址与路径穿越。
 const safeUrl=v=>{
  if(typeof v!=='string'||!v.trim()||v.length>500)return false;
  const s=v.trim();
  if(/^https?:\/\//i.test(s))return true;
  if(s.startsWith('/'))return !s.startsWith('//')&&!s.includes('..')&&!s.includes('\\');
  return /^[A-Za-z0-9_.\-/]+\.[A-Za-z0-9]{1,8}$/.test(s)&&!s.includes('..')&&!s.includes('\\');
 };
 const present=r=>({id:r.id,courseId:r.course_id,classId:r.class_id,kind:r.kind,kindLabel:kindLabels[r.kind]||r.kind,
  title:r.title,summary:r.summary,url:r.url,source:r.source,authorization:r.authorization,
  status:r.status,statusLabel:statusLabels[r.status]||r.status,version:r.version,
  ownerId:r.owner_id,createdBy:r.created_by,createdAt:r.created_at,updatedAt:r.updated_at,
  reviewedBy:r.reviewed_by,reviewedAt:r.reviewed_at,reviewNote:r.review_note,
  publishedAt:r.published_at,offlineAt:r.offline_at});
 function getRow(id){requireThat(safeId(id),404,'NOT_FOUND','资源不存在');const r=q('SELECT * FROM resources WHERE id=?',id);requireThat(r,404,'NOT_FOUND','资源不存在');return r;}
 function courseRole(user,courseId){return q('SELECT role FROM course_members WHERE course_id=? AND user_id=?',courseId,user.id)?.role||null;}
 function classStaff(user,classId){
  if(!classId)return false;
  const c=q('SELECT * FROM classes WHERE id=?',classId);
  return Boolean(c&&(c.teacher_id===user.id||q('SELECT 1 FROM class_staff WHERE class_id=? AND user_id=?',classId,user.id)||courseRole(user,c.course_id)==='owner'));
 }
 function isEditor(user,row){
  if(user.global_role==='student')return false;
  return ['owner','teacher'].includes(courseRole(user,row.course_id))||(row.class_id?classStaff(user,row.class_id):false);
 }
 function isReviewer(user,row){return user.global_role!=='student'&&courseRole(user,row.course_id)==='owner';}
 function requireEditor(user,row){requireThat(isEditor(user,row),403,'FORBIDDEN','需要本课程教师权限');}
 function requireReviewer(user,row){requireThat(isReviewer(user,row),403,'FORBIDDEN','来源授权审核与发布需要课程负责人权限');}
 function enrolled(user,courseId,classId){
  if(classId)return Boolean(q("SELECT 1 FROM class_members WHERE class_id=? AND student_id=? AND status!='archived'",classId,user.id));
  return Boolean(q("SELECT 1 FROM class_members m JOIN classes c ON c.id=m.class_id WHERE c.course_id=? AND m.student_id=? AND m.status!='archived'",courseId,user.id));
 }
 function canRead(user,row){
  if(isEditor(user,row)||isReviewer(user,row))return true;
  return row.status==='published'&&enrolled(user,row.course_id,row.class_id);
 }
 function archive(row,user){
  run('INSERT INTO resource_versions(id,resource_id,version,snapshot,actor,at) VALUES(?,?,?,?,?,?)',
   'rver-'+randomUUID(),row.id,row.version,JSON.stringify(present(row)),user.username,stamp());
 }
 function unique(courseId,classId,kind,title,exceptId){
  requireThat(!q("SELECT 1 FROM resources WHERE course_id=? AND COALESCE(class_id,'')=? AND kind=? AND title=? AND id<>?",courseId,classId||'',kind,title,exceptId||''),409,'RESOURCE_EXISTS','同类型下已有同名资源，请改名或编辑原资源');
 }
 function validateClass(courseId,classId){
  if(!classId)return;
  const c=q('SELECT * FROM classes WHERE id=?',classId);
  requireThat(c&&c.course_id===courseId,422,'INVALID_CLASS','教学班不属于本课程');
 }
 function contentOf(row,b){
  const pick=(key,fallback)=>b[key]===undefined?fallback:String(b[key]).trim();
  return {kind:b.kind===undefined?row?.kind:b.kind,title:pick('title',row?.title||''),
   summary:b.summary===undefined?(row?.summary||''):bounded(b.summary,2000),
   url:pick('url',row?.url||''),source:pick('source',row?.source||''),authorization:pick('authorization',row?.authorization||'')};
 }
 function validateContent(c,courseId,classId,exceptId){
  requireThat(kinds.has(c.kind),422,'INVALID_KIND','请选择有效的资源类型');
  requireThat(text(c.title,200),422,'INVALID_TITLE','请填写资源名称');
  requireThat(safeUrl(c.url),422,'INVALID_URL','资源地址须为 http(s) 链接、站内路径或本地文件名');
  requireThat(text(c.source,500),422,'SOURCE_REQUIRED','请填写资源来源（含作者或出处）');
  requireThat(text(c.authorization,500),422,'AUTHORIZATION_REQUIRED','请填写授权说明（许可类型或授权范围）');
  unique(courseId,classId,c.kind,c.title,exceptId);
 }
 // 内容变更统一走这里：归档当前版本 → 写入新版本 → 状态退回草稿 → 清空审核/发布痕迹。
 function revise(row,c,user,action){
  const now=stamp(),version=row.version+1;
  transaction(()=>{
   archive(row,user);
   const result=run(`UPDATE resources SET kind=?,title=?,summary=?,url=?,source=?,authorization=?,status=?,version=?,updated_at=?,reviewed_by=NULL,reviewed_at=NULL,review_note='',published_at=NULL,offline_at=NULL WHERE id=? AND version=?`,
    c.kind,c.title,c.summary,c.url,c.source,c.authorization,'draft',version,now,row.id,row.version);
   requireThat(result.changes===1,409,'VERSION_CONFLICT','资源已被其他人更新，请刷新后重试');
   audit(user,'resource.'+action,row.id+':v'+version);
  });
  return present(getRow(row.id));
 }

 return async ctx=>{
  const base='/api/resources';
  if(ctx.pathname!==base&&!ctx.pathname.startsWith(base+'/'))return false;
  const user=needUser(ctx.session),parts=ctx.pathname.slice('/api/resources/'.length).split('/').filter(Boolean),id=parts[0],action=parts[1],method=ctx.method;
  const b=['POST','PUT','PATCH'].includes(method)?await bodyOf(ctx.req):{};
  const send=(status,data)=>{ctx.json(status,data);return true;};
  const courseId=b.courseId||ctx.url.searchParams.get('courseId')||courseDefault;
  const classId=b.classId||ctx.url.searchParams.get('classId')||null;

  // 列表：教师看全部状态，学生只看已发布且自己所在班可见的资源。
  if(!id&&method==='GET'){
   let rows=all('SELECT * FROM resources WHERE course_id=? ORDER BY updated_at DESC',courseId);
   if(classId)rows=rows.filter(r=>!r.class_id||r.class_id===classId);
   const staff=user.global_role!=='student'&&(['owner','teacher'].includes(courseRole(user,courseId))||classStaff(user,classId));
   if(!staff)rows=rows.filter(r=>r.status==='published'&&enrolled(user,courseId,r.class_id));
   const items=rows.map(present);
   return send(200,{items,summary:{total:items.length,pending:items.filter(x=>x.status==='pending').length,published:items.filter(x=>x.status==='published').length,offline:items.filter(x=>x.status==='offline').length}});
  }
  // 新建：来源与授权必填，初始为草稿 v1。
  if(!id&&method==='POST'){
   requireThat(user.global_role!=='student'&&['owner','teacher'].includes(courseRole(user,courseId)),403,'FORBIDDEN','需要本课程教师权限');
   validateClass(courseId,classId);
   const c=contentOf(null,b);validateContent(c,courseId,classId,null);
   const now=stamp(),rowId='res-'+randomUUID();
   transaction(()=>{
    run(`INSERT INTO resources(id,course_id,class_id,kind,title,summary,url,source,authorization,status,version,owner_id,created_by,created_at,updated_at,review_note)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,rowId,courseId,classId||null,c.kind,c.title,c.summary,c.url,c.source,c.authorization,'draft',1,user.id,user.username,now,now,'');
    audit(user,'resource.created',rowId);
   });
   return send(201,{item:present(getRow(rowId))});
  }

  // 版本历史（含当前版本）。
  if(id&&action==='history'&&method==='GET'){
   const row=getRow(id);requireEditor(user,row);
   const archived=all('SELECT version,snapshot,actor,at FROM resource_versions WHERE resource_id=? ORDER BY version',id)
    .map(x=>({version:x.version,snapshot:JSON.parse(x.snapshot),actor:x.actor,at:x.at}));
   return send(200,{items:[...archived,{version:row.version,snapshot:present(row),actor:row.created_by,at:row.updated_at,current:true}]});
  }
  // 回溯恢复：按指定版本内容生成一个新的更高版本，历史一律保留。
  if(id&&action==='restore'&&method==='POST'){
   const row=getRow(id);requireEditor(user,row);
   const version=Number(b.version);
   const chosen=all('SELECT snapshot FROM resource_versions WHERE resource_id=? AND version=?',id,version)[0]
    ||(version===row.version?{snapshot:JSON.stringify(present(row))}:null);
   requireThat(chosen,404,'VERSION_NOT_FOUND','未找到指定资源版本');
   const snap=JSON.parse(chosen.snapshot);
   const c={kind:snap.kind,title:snap.title,summary:snap.summary||'',url:snap.url,source:snap.source,authorization:snap.authorization};
   validateContent(c,row.course_id,row.class_id,row.id);
   return send(200,{item:revise(row,c,user,'restored'),restoredFrom:version,note:'已按所选版本内容生成新版本，状态为草稿，需重新提交审核。'});
  }
  // 状态流转：提交审核（教师）/ 审核、发布、下架（课程负责人）。
  if(id&&['submit','review','publish','offline'].includes(action)&&method==='POST'){
   const row=getRow(id);
   if(action==='submit')requireEditor(user,row);else requireReviewer(user,row);
   const note=bounded(b.note,1000),now=stamp();
   if(action==='submit'){
    requireThat(['draft','rejected'].includes(row.status),409,'INVALID_STATUS','只有草稿或被驳回的资源可以提交审核');
    run("UPDATE resources SET status='pending',review_note='',updated_at=? WHERE id=?",now,id);
   }else if(action==='review'){
    requireThat(row.status==='pending',409,'INVALID_STATUS','只有待审核资源可以审核');
    requireThat(['approve','reject'].includes(b.decision),422,'INVALID_DECISION','请选择通过或驳回');
    requireThat(b.decision!=='reject'||text(note,1000),422,'REASON_REQUIRED','驳回须填写理由');
    run('UPDATE resources SET status=?,reviewed_by=?,reviewed_at=?,review_note=?,updated_at=? WHERE id=?',
     b.decision==='approve'?'approved':'rejected',user.username,now,note,now,id);
   }else if(action==='publish'){
    requireThat(['approved','offline'].includes(row.status),409,'INVALID_STATUS','只有审核通过或已下架的资源可以发布');
    requireThat(text(row.source,500)&&text(row.authorization,500),422,'AUTHORIZATION_REQUIRED','来源或授权信息缺失，不能发布');
    run("UPDATE resources SET status='published',published_at=?,offline_at=NULL,updated_at=? WHERE id=?",now,now,id);
   }else{
    requireThat(row.status==='published',409,'INVALID_STATUS','只有已发布资源可以下架');
    requireThat(text(note,1000),422,'REASON_REQUIRED','下架须填写原因');
    run("UPDATE resources SET status='offline',offline_at=?,review_note=?,updated_at=? WHERE id=?",now,note,now,id);
   }
   audit(user,'resource.'+action,id);
   return send(200,{item:present(getRow(id))});
  }
  // 编辑内容 → 新版本 + 退回草稿。
  if(id&&!action&&['PUT','PATCH'].includes(method)){
   const row=getRow(id);requireEditor(user,row);
   const c=contentOf(row,b);validateContent(c,row.course_id,row.class_id,row.id);
   return send(200,{item:revise(row,c,user,'revised'),note:'内容已更新并生成新版本，状态回到草稿，需重新提交审核。'});
  }
  // 详情。
  if(id&&!action&&method==='GET'){
   const row=getRow(id);requireThat(canRead(user,row),404,'NOT_FOUND','资源不存在或未发布');
   return send(200,{item:present(row)});
  }
  // 删除：仅草稿/被驳回可删；不可变版本记录保留作为审计留痕。
  if(id&&!action&&method==='DELETE'){
   const row=getRow(id);requireEditor(user,row);
   requireThat(['draft','rejected'].includes(row.status),409,'RESOURCE_IN_USE','已提交审核或已发布的资源不能删除，请先下架');
   transaction(()=>{run('DELETE FROM resources WHERE id=?',id);audit(user,'resource.deleted',id);});
   return send(200,{ok:true});
  }
  return false;
 };
}
