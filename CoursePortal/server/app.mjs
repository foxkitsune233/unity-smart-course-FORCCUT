import http from 'node:http';
import {serveLab} from './lab-static.mjs';
import {portalForRole,roleHome} from '../portal-routing.mjs';
import {createLocalMedia} from './local-media.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {createStore,digest,passwordHash,passwordMatches} from './store.mjs';
import {createTeachingApi} from './teaching-api.mjs';
import {HttpError,requireThat,validateCourse,validatePublication} from './validation.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const servedExtensions=new Set(['.html','.css','.mjs','.svg','.png','.jpg','.jpeg','.webp','.ico','.webm','.mp4','.json','.txt']);
// 根目录下的服务端入口与内部脚本不对外暴露；子目录（server/tests/tools/contracts/Evidence）整体不开放。
const blockedRootFiles=new Set(['serve.mjs']);
const types={'.html':'text/html; charset=utf-8','.mjs':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.webm':'video/webm','.mp4':'video/mp4','.json':'application/json; charset=utf-8','.txt':'text/plain; charset=utf-8'};
const publicUser=u=>({id:u.id,username:u.username,name:u.name,globalRole:u.global_role});
export function createApp({dataDir=path.join(root,'..','.course-portal-data'),bootstrap,secureCookies=false,mediaOptions}={}){
 const localMedia=createLocalMedia(mediaOptions);
 const store=createStore(dataDir,bootstrap);const {q,all,run,audit,transaction,getDraft}=store;const failures=new Map();const dummyHash=passwordHash('not-a-real-account');let closed=false;
 const teaching=createTeachingApi({q,all,run,transaction,audit,needUser,membership,bodyOf,json});
 function sessionFor(req){const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('unity_session='))?.slice(14);if(!raw||raw.length>200)return null;const s=q('SELECT s.*,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires>? AND active=1',digest(raw),Date.now());return s||null;}
 const cookie=(value,maxAge)=>'unity_session='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+maxAge+(secureCookies?'; Secure':'');
 function json(res,status,data){if(data.course)data={...data,course:localMedia.decorate(data.course)};res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
 function needUser(session){requireThat(session,401,'AUTH_REQUIRED','请先登录');return session;}
 function membership(user,id){const course=q('SELECT * FROM courses WHERE id=?',id);requireThat(course,404,'NOT_FOUND','课程不存在');const member=q('SELECT role FROM course_members WHERE course_id=? AND user_id=?',id,user.id);requireThat(member,403,'FORBIDDEN','你没有这门课程的管理权限');return {course,role:member.role};}
 const permissions=role=>({edit:['teacher','owner'].includes(role),publish:role==='owner',members:role==='owner'});
 function detail(user,id){const {course,role}=membership(user,id);return {course:getDraft(course),revision:course.revision,publishedRevision:course.published_revision,publishedAt:course.published_at,memberRole:role,permissions:permissions(role)};}
 async function bodyOf(req){requireThat(/^application\/json(?:;|$)/i.test(req.headers['content-type']||''),415,'JSON_REQUIRED','请使用JSON提交数据');let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;requireThat(size<=600_000,413,'BODY_TOO_LARGE','提交内容过大');chunks.push(chunk);}try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));requireThat(value&&typeof value==='object'&&!Array.isArray(value),400,'BAD_JSON','请求内容格式无效');return value;}catch(error){if(error instanceof HttpError)throw error;throw new HttpError(400,'BAD_JSON','请求内容格式无效');}}
 async function storeTaskFile(req,user,taskId){const task=q('SELECT * FROM tasks WHERE id=?',taskId);requireThat(task&&task.status==='published',404,'TASK_NOT_FOUND','任务不存在或未发布');requireThat(user.global_role==='student'&&q("SELECT 1 FROM class_members WHERE class_id=? AND student_id=? AND status!='archived'",task.class_id,user.id),403,'NOT_IN_CLASS','你不在该教学班');const raw=decodeURIComponent(String(req.headers['x-file-name']||''));requireThat(raw&&raw.length<=180&&!/[\\/\0]/.test(raw),422,'INVALID_FILE','文件名无效');const ext=path.extname(raw).toLowerCase();requireThat(new Set(['.zip','.unitypackage','.doc','.docx','.pdf','.png','.jpg','.jpeg','.mp4','.txt','.json']).has(ext),422,'INVALID_FILE','不支持的文件类型');const length=Number(req.headers['content-length']||0);requireThat(!length||length<=200*1024*1024,413,'FILE_TOO_LARGE','单个文件最大200MB');const id='file-'+randomUUID(),dir=path.join(dataDir,'submission-files'),stored=id+ext,target=path.join(dir,stored);fs.mkdirSync(dir,{recursive:true});let bytes=0;const guard=new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;if(bytes>200*1024*1024){callback(new HttpError(413,'FILE_TOO_LARGE','单个文件最大200MB'));return;}callback(null,chunk);}});try{await pipeline(req,guard,fs.createWriteStream(target,{flags:'wx'}));}catch(error){fs.rmSync(target,{force:true});throw error;}requireThat(bytes>0,422,'EMPTY_FILE','不能上传空文件');run('INSERT INTO submission_files VALUES(?,?,?,?,?,?,?,?,?,?)',id,task.id,user.id,null,raw,stored,String(req.headers['content-type']||'application/octet-stream').slice(0,120),bytes,new Date().toISOString());return {id,originalName:raw,bytes};}
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' http: https: blob:; connect-src 'self'; frame-src https://player.bilibili.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  try{
   const url=new URL(req.url,'http://localhost');const pathname=decodeURIComponent(url.pathname);const method=req.method;
   if(localMedia.serve(req,res,pathname))return;
   const session=sessionFor(req);
   if(!pathname.startsWith('/api/')){
    const studentPage=['/','/index.html','/watch.html','/tasks.html','/lab','/lab/','/lab/index.html'].includes(pathname),teacherPage=['/teacher.html','/teaching.html'].includes(pathname),adminPage=pathname==='/admin.html';
    if(studentPage||teacherPage||adminPage){const portal=studentPage?'student':'teacher';const isPreview=studentPage&&url.searchParams.get('preview')==='1'&&portalForRole(session?.global_role)==='teacher';
     if(!session||(teacherPage&&portalForRole(session.global_role)!=='teacher')||(adminPage&&session.global_role!=='admin')){res.writeHead(303,{Location:'/login.html?'+new URLSearchParams({portal,next:pathname+url.search})}).end();return;}
     if(studentPage&&!isPreview&&portalForRole(session.global_role)!=='student'){res.writeHead(303,{Location:pathname.startsWith('/lab')?'/'+roleHome(session.global_role):roleHome(session.global_role)}).end();return;}
    }
    if(serveLab(req,res,pathname))return;
    serveStatic(req,res,pathname);return;
   }
   const writing=!['GET','HEAD'].includes(method);
   if(writing){if(req.headers.origin)requireThat(req.headers.origin===(secureCookies?'https://':'http://')+req.headers.host,403,'ORIGIN_REJECTED','不允许跨站修改数据');if(pathname!=='/api/login'){needUser(session);requireThat(typeof req.headers['x-csrf-token']==='string'&&req.headers['x-csrf-token']===session.csrf,403,'CSRF_REJECTED','会话校验失败，请刷新后重试');}}
   if(pathname==='/api/session'&&method==='GET'){json(res,200,session?{user:publicUser(session),csrfToken:session.csrf}:{user:null,csrfToken:null});return;}
   if(pathname==='/api/login'&&method==='POST'){
    const body=await bodyOf(req);requireThat(typeof body.username==='string'&&body.username.length<=80&&typeof body.password==='string'&&body.password.length<=256,400,'BAD_LOGIN','请输入账号和密码');const name=body.username.trim().toLowerCase();const key=req.socket.remoteAddress+'|'+name;let rate=failures.get(key);if(rate&&Date.now()-rate.at>900_000){failures.delete(key);rate=null;}requireThat(!rate||rate.count<8,429,'LOGIN_RATE_LIMIT','尝试次数过多，请稍后再试');
    const user=q('SELECT * FROM users WHERE username=?',name);const valid=passwordMatches(body.password,user?.password_hash||dummyHash);if(!valid||!user?.active){failures.set(key,{count:(rate?.count||0)+1,at:rate?.at||Date.now()});throw new HttpError(401,'INVALID_CREDENTIALS','账号或密码不正确');}
    if(body.portal!==undefined)requireThat(['student','teacher'].includes(body.portal)&&portalForRole(user.global_role)===body.portal,403,'PORTAL_MISMATCH','当前账号无法进入所选端，请在登录页选择对应入口。');
    failures.delete(key);run('DELETE FROM sessions WHERE expires<=?',Date.now());const token=randomBytes(32).toString('base64url'),csrf=randomBytes(24).toString('base64url');run('INSERT INTO sessions VALUES(?,?,?,?)',digest(token),user.id,csrf,Date.now()+8*3600_000);audit(user,'session.login',user.id);res.setHeader('Set-Cookie',cookie(token,8*3600));json(res,200,{user:publicUser(user),csrfToken:csrf});return;
   }
   if(pathname==='/api/logout'&&method==='POST'){run('DELETE FROM sessions WHERE token_hash=?',session.token_hash);res.setHeader('Set-Cookie',cookie('',0));json(res,200,{ok:true});return;}
   if(pathname==='/api/catalog/current'&&method==='GET'){
    const id=url.searchParams.get('course')||store.seedCourse.id;const row=q('SELECT * FROM courses WHERE id=?',id);requireThat(row,404,'NOT_FOUND','课程不存在');if(url.searchParams.get('preview')==='1'){const user=needUser(session);membership(user,id);json(res,200,{course:getDraft(row),preview:true,revision:row.revision});return;}if(row.published_revision===null){requireThat(id===store.seedCourse.id,404,'NOT_PUBLISHED','课程尚未发布');json(res,200,{course:{...structuredClone(store.seedCourse),outcomes:[],ideologicalNote:''},preview:true,revision:null});}
    else{const snapshot=q('SELECT payload FROM published_versions WHERE course_id=? AND revision=?',id,row.published_revision);json(res,200,{course:JSON.parse(snapshot.payload),preview:false,revision:row.published_revision});}return;
   }
   if(pathname==='/api/manage/courses'&&method==='GET'){
    const user=needUser(session);requireThat(user.global_role!=='student',403,'FORBIDDEN','学生账号没有课程管理权限');const rows=all('SELECT c.*,m.role FROM courses c JOIN course_members m ON m.course_id=c.id WHERE m.user_id=? ORDER BY c.updated_at DESC',user.id);json(res,200,{courses:rows.map(row=>{const course=getDraft(row);return {id:row.id,title:course.title,summary:course.subtitle,revision:row.revision,publishedRevision:row.published_revision,updatedAt:row.updated_at,hours:course.hours,chaptersCount:course.chapters.length,lessonsCount:course.chapters.reduce((n,ch)=>n+ch.lessons.length,0),memberRole:row.role};})});return;
   }
   if(pathname==='/api/manage/courses'&&method==='POST'){
    const user=needUser(session);requireThat(user.global_role==='teacher',403,'FORBIDDEN','只有教师账号可以创建课程');const body=await bodyOf(req);requireThat(typeof body.title==='string'&&body.title.trim()&&body.title.length<=150,422,'INVALID_TITLE','请填写课程名称');const id='course-'+randomUUID();const course={...structuredClone(store.seedCourse),id,title:body.title.trim(),shortTitle:body.title.trim(),subtitle:'',curriculum:undefined,hours:null,ideologicalNote:'',outcomes:[],chapters:[]};transaction(()=>{run('INSERT INTO courses VALUES(?,?,1,NULL,NULL,?)',id,JSON.stringify(course),new Date().toISOString());run('INSERT INTO course_members VALUES(?,?,?)',id,user.id,'owner');audit(user,'course.created',id);});json(res,201,detail(user,id));return;
   }
   const courseMatch=pathname.match(/^\/api\/manage\/courses\/([a-zA-Z0-9_-]+)(?:\/(publish|members))?$/);
   if(courseMatch){
    const user=needUser(session),id=courseMatch[1],action=courseMatch[2];let {course:row,role}=membership(user,id);
    if(!action&&method==='GET'){json(res,200,detail(user,id));return;}
    if(!action&&method==='PUT'){
     requireThat(permissions(role).edit,403,'FORBIDDEN','当前课程角色不能编辑草稿');const body=await bodyOf(req);requireThat(Number.isInteger(body.expectedRevision)&&body.expectedRevision===row.revision,409,'REVISION_CONFLICT','草稿已被其他人更新，请保留输入并重新加载后合并');const course=validateCourse(body.course,id);const revision=row.revision+1;
     transaction(()=>{const result=run('UPDATE courses SET draft_json=?,revision=?,updated_at=? WHERE id=? AND revision=?',JSON.stringify(course),revision,new Date().toISOString(),id,body.expectedRevision);requireThat(result.changes===1,409,'REVISION_CONFLICT','草稿版本已更新');store.putOutcomes(course,revision);audit(user,'course.saved',id+':'+revision);});json(res,200,detail(user,id));return;
    }
    if(action==='publish'&&method==='POST'){
     requireThat(permissions(role).publish,403,'FORBIDDEN','只有课程负责人可以发布');const body=await bodyOf(req);row=q('SELECT * FROM courses WHERE id=?',id);requireThat(body.expectedRevision===row.revision,409,'REVISION_CONFLICT','草稿版本已更新，请刷新后发布');const course=validateCourse(getDraft(row),id);validatePublication(course);const at=new Date().toISOString();transaction(()=>{run('INSERT OR IGNORE INTO published_versions VALUES(?,?,?,?)',id,row.revision,JSON.stringify(course),at);run('UPDATE courses SET published_revision=?,published_at=? WHERE id=?',row.revision,at,id);audit(user,'course.published',id+':'+row.revision);});json(res,200,detail(user,id));return;
    }
    if(action==='members'&&method==='GET'){json(res,200,{members:all('SELECT u.id,u.username,u.name,m.role FROM course_members m JOIN users u ON u.id=m.user_id WHERE m.course_id=? ORDER BY u.username',id)});return;}
    if(action==='members'&&method==='POST'){
     requireThat(permissions(role).members,403,'FORBIDDEN','只有课程负责人可以管理成员');const body=await bodyOf(req);requireThat(typeof body.username==='string'&&['assistant','teacher','owner'].includes(body.role),422,'INVALID_MEMBER','请选择成员账号和角色');const member=q('SELECT * FROM users WHERE username=? AND active=1',body.username.trim().toLowerCase());requireThat(member&&['assistant','teacher'].includes(member.global_role),422,'INVALID_MEMBER','成员须为启用的教师或助教账号');const existing=q('SELECT role FROM course_members WHERE course_id=? AND user_id=?',id,member.id);if(existing?.role==='owner'&&body.role!=='owner')requireThat(q("SELECT COUNT(*) AS n FROM course_members WHERE course_id=? AND role='owner'",id).n>1,409,'LAST_OWNER','不能移除最后一名课程负责人');transaction(()=>{run('INSERT INTO course_members VALUES(?,?,?) ON CONFLICT(course_id,user_id) DO UPDATE SET role=excluded.role',id,member.id,body.role);audit(user,'course.member.changed',id+':'+member.id);});json(res,200,{members:all('SELECT u.id,u.username,u.name,m.role FROM course_members m JOIN users u ON u.id=m.user_id WHERE m.course_id=? ORDER BY u.username',id)});return;
    }
   }
   if(pathname.startsWith('/api/admin/')){
    const user=needUser(session);requireThat(user.global_role==='admin',403,'FORBIDDEN','只有平台管理员可以进行此操作');
    if(pathname==='/api/admin/users'&&method==='GET'){json(res,200,{users:all('SELECT id,username,name,global_role AS globalRole,active FROM users ORDER BY username').map(u=>({...u,active:!!u.active}))});return;}
    if(pathname==='/api/admin/users'&&method==='POST'){
     const body=await bodyOf(req);requireThat(typeof body.username==='string'&&/^[a-z0-9][a-z0-9_.-]{2,49}$/.test(body.username)&&typeof body.name==='string'&&body.name.trim()&&body.name.length<=80&&typeof body.password==='string'&&body.password.length>=12&&body.password.length<=256&&['student','assistant','teacher','admin'].includes(body.globalRole),422,'INVALID_ACCOUNT','账号须为3—50位小写字母数字等，密码至少12位，并填写姓名和角色');requireThat(!q('SELECT id FROM users WHERE username=?',body.username),409,'USERNAME_EXISTS','该账号已存在');const id=randomUUID();transaction(()=>{run('INSERT INTO users VALUES(?,?,?,?,?,1)',id,body.username,body.name.trim(),body.globalRole,passwordHash(body.password));audit(user,'account.created',id);});json(res,201,{user:publicUser(q('SELECT * FROM users WHERE id=?',id))});return;
    }
    const userMatch=pathname.match(/^\/api\/admin\/users\/([a-zA-Z0-9_-]+)$/);if(userMatch&&method==='PATCH'){
     const body=await bodyOf(req),id=userMatch[1];requireThat(typeof body.active==='boolean',422,'INVALID_ACCOUNT','请指定账号状态');requireThat(id!==user.id||body.active,409,'SELF_DISABLE','不能停用当前使用的管理员账号');requireThat(q('SELECT id FROM users WHERE id=?',id),404,'NOT_FOUND','账号不存在');transaction(()=>{run('UPDATE users SET active=? WHERE id=?',body.active?1:0,id);if(!body.active)run('DELETE FROM sessions WHERE user_id=?',id);audit(user,body.active?'account.enabled':'account.disabled',id);});json(res,200,{ok:true});return;
    }
    if(pathname==='/api/admin/audit'&&method==='GET'){json(res,200,{entries:all('SELECT id,at,actor,action,object_id AS objectId FROM audit ORDER BY id DESC LIMIT 200')});return;}
   }
   if(pathname.startsWith('/api/teaching/')){
    const upload=pathname.match(/^\/api\/teaching\/tasks\/([a-zA-Z0-9_-]+)\/files$/);if(upload&&method==='POST'){const user=needUser(session);json(res,201,{file:await storeTaskFile(req,user,upload[1])});return;}
    const download=pathname.match(/^\/api\/teaching\/files\/([a-zA-Z0-9_-]+)$/);if(download&&method==='GET'){const user=needUser(session),file=q('SELECT f.*,t.class_id FROM submission_files f JOIN tasks t ON t.id=f.task_id WHERE f.id=?',download[1]);requireThat(file,404,'FILE_NOT_FOUND','附件不存在');const own=user.global_role==='student'&&file.student_id===user.id&&q("SELECT 1 FROM class_members WHERE class_id=? AND student_id=? AND status!='archived'",file.class_id,user.id);if(!own){const staff=q('SELECT 1 FROM classes c LEFT JOIN class_staff s ON s.class_id=c.id AND s.user_id=? LEFT JOIN course_members m ON m.course_id=c.course_id AND m.user_id=? WHERE c.id=? AND (c.teacher_id=? OR s.user_id IS NOT NULL OR m.role=\'owner\')',user.id,user.id,file.class_id,user.id);requireThat(staff,403,'FILE_FORBIDDEN','无权下载该附件');}const target=path.join(dataDir,'submission-files',file.stored_name);requireThat(fs.existsSync(target),404,'FILE_NOT_FOUND','附件内容不存在');res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':file.bytes,'Content-Disposition':'attachment; filename="download"','Cache-Control':'no-store'});fs.createReadStream(target).pipe(res);return;}
    const handled=await teaching({req,res,method,pathname,url,session,json:(status,data)=>json(res,status,data)});
    if(handled)return;
   }
   throw new HttpError(404,'NOT_FOUND','接口不存在');
  }catch(error){if(res.headersSent){res.end();return;}if(error instanceof HttpError)json(res,error.status,{error:{code:error.code,message:error.message,...(error.details?{details:error.details}:{})}});else{console.error('Request failed:',error.message);json(res,500,{error:{code:'INTERNAL_ERROR',message:'服务暂时无法处理请求，请稍后重试'}});}}
 });
 server.requestTimeout=20_000;server.headersTimeout=15_000;
 return {server,bootstrapPath:store.bootstrapPath,close:async()=>{if(closed)return;closed=true;await new Promise(resolve=>server.close(resolve));store.db.close();}};
}
function isPublicFile(relative){
 // 根目录下的静态资源按扩展名开放，新增页面无需重启服务即可访问。
 if(blockedRootFiles.has(relative))return false;
 if(relative.startsWith('assets/'))return !relative.includes('..')&&Boolean(types[path.extname(relative)]);
 if(relative.includes('/'))return false;
 return servedExtensions.has(path.extname(relative).toLowerCase());
}
function serveStatic(req,res,pathname){
 const relative=pathname==='/'?'index.html':pathname.slice(1);
 if(!isPublicFile(relative)){res.writeHead(404).end('资源未找到');return;}if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
 const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404).end('资源未找到');return;}const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Content-Length':stat.size,'Accept-Ranges':'bytes'};const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),stat.size-1):stat.size-1;if(start>end||start>=stat.size){res.writeHead(416,{'Content-Range':'bytes */'+stat.size}).end();return;}res.writeHead(206,{...headers,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${stat.size}`});if(req.method==='HEAD')res.end();else fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);return;}res.writeHead(200,headers);if(req.method==='HEAD')res.end();else fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);});
}
