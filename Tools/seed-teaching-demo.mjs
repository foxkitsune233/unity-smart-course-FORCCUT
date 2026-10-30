import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
import {DatabaseSync,backup} from 'node:sqlite';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const qa=process.argv.includes('--qa'),preview=process.argv.includes('--preview');
const base='http://127.0.0.1:'+(qa?'8091':'8090'),dataset='unity-demo-20261030',courseId='unity-script-2021';
const dataDir=qa?path.join(root,'outputs','update-qa-seed'):path.join(root,'.course-portal-data');
const manifestFile=path.join(dataDir,dataset+'.json'),csvFile=path.join(dataDir,dataset+'-accounts.csv');
const templates=JSON.parse(fs.readFileSync(path.join(root,'CoursePortal/Evidence/demo-experiment-templates.json'),'utf8'));
const state=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8')):{dataset,students:[],classes:[],createdAt:new Date().toISOString(),synthetic:true};
const sessions=[];
function persist(){fs.mkdirSync(dataDir,{recursive:true});fs.writeFileSync(manifestFile,JSON.stringify(state,null,2),{mode:0o600});}
function credential(role){if(qa)return{username:role,password:role[0].toUpperCase()+role.slice(1)+'-browser-923!'};const lines=fs.readFileSync(path.join(root,'.course-portal-data/local-accounts.txt'),'utf8').split(/\r?\n/);for(const line of lines){const p=line.split(/\s*\/\s*/);if(p[0]===role&&p.length===3)return{username:p[1],password:p[2]};}throw Error('Local '+role+' credential unavailable');}
async function call(p,method='GET',body,session){const headers={...(body!==undefined?{'Content-Type':'application/json'}:{}),...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}: {})};const r=await fetch(base+p,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}if(!r.ok)throw Error(method+' '+p+' '+r.status+' '+JSON.stringify(data));return{data,response:r};}
async function login(c){const {data,response}=await call('/api/login','POST',c);const s={cookie:response.headers.get('set-cookie').split(';')[0],csrf:data.csrfToken,user:data.user};sessions.push(s);return s;}
async function get(p,s){return(await call(p,'GET',undefined,s)).data;}
async function post(p,b,s){return(await call(p,'POST',b,s)).data;}
const names=['场景搭建与金币拾取','组件与3D发射器','3D碰撞、触发与落地检测','坐标、向量与朝向目标'];
const rubric=[{id:'scene',title:'场景与组件配置（测试）',maxScore:40,weight:40},{id:'behavior',title:'行为与结果说明（测试）',maxScore:40,weight:40},{id:'report',title:'实验报告（测试）',maxScore:20,weight:20}];
if(preview){console.log(JSON.stringify({dataset,base,students:72,classes:2,studentsPerClass:36,tasksPerClass:4,synthetic:true,changesOfficialCourse:false,accountsFile:csvFile},null,2));process.exit(0);}
if(!qa&&!state.backup){const backupDir=path.join(dataDir,'backups');fs.mkdirSync(backupDir,{recursive:true});state.backup=path.join(backupDir,'before-'+dataset+'-'+Date.now()+'.sqlite');const db=new DatabaseSync(path.join(dataDir,'portal.sqlite'),{readOnly:true});try{await backup(db,state.backup);}finally{db.close();}persist();}
try{
 const admin=await login(credential('admin')),teacher=await login(credential('teacher'));
 const course=await get('/api/manage/courses/'+courseId,teacher);state.originalCourseRevision=state.originalCourseRevision??course.revision;state.originalPublishedRevision=state.originalPublishedRevision??course.publishedRevision;
 const existing=(await get('/api/admin/users',admin)).users;
 for(let i=1;i<=72;i++){
  const username='unity_test_'+String(i).padStart(3,'0'),name='测试学生'+String(i).padStart(3,'0');
  let person=state.students.find(x=>x.username===username);const prior=existing.find(x=>x.username===username);
  if(prior&&!person)throw Error('Unmanaged account collision: '+username);
  if(!person){person={username,name,password:randomBytes(12).toString('base64url'),classIndex:i<=36?0:1,studentNo:'TEST2026'+String(i).padStart(3,'0'),groupName:'测试第'+(Math.floor(((i-1)%36)/6)+1)+'组'};state.students.push(person);persist();}
  if(prior){assert.equal(prior.name,name);assert.equal(prior.globalRole,'student');person.id=prior.id;}
  else{const created=await post('/api/admin/users',{username,name,password:person.password,globalRole:'student'},admin);person.id=created.user.id;existing.push({...created.user,globalRole:'student'});}
  persist();
 }
 let term=(await get('/api/teaching/terms',teacher)).terms.find(t=>t.name==='【测试数据】2026秋季演示');
 if(!term)term=(await post('/api/teaching/terms',{name:'【测试数据】2026秋季演示',startDate:'2026-09-01',endDate:'2027-01-31'},teacher)).term;
 for(let ci=0;ci<2;ci++){
  const name='【测试数据】Unity2021实训'+(ci+1)+'班（36人）';let cls=(await get('/api/teaching/classes',teacher)).classes.find(c=>c.name===name);
  if(!cls)cls=(await post('/api/teaching/classes',{name,courseId,termId:term.id,publishedRevision:course.publishedRevision},teacher)).class;
  let meta=state.classes.find(c=>c.id===cls.id);if(!meta){meta={id:cls.id,name,tasks:[]};state.classes.push(meta);persist();}
  const members=state.students.filter(p=>p.classIndex===ci);
  const imported=await post('/api/teaching/classes/'+cls.id+'/roster',{rows:members.map(p=>({studentNo:p.studentNo,name:p.name,username:p.username,groupName:p.groupName}))},teacher);
  const detail=await get('/api/teaching/classes/'+cls.id,teacher);assert.equal(detail.members.length,36);
  for(let j=0;j<4;j++){
   const title='【测试数据】CH0'+(j+1)+' '+names[j];let task=detail.tasks.find(t=>t.title===title);
   if(!task){const made=await post('/api/teaching/classes/'+cls.id+'/tasks',{title,description:'[SYNTHETIC DEMO '+dataset+'] 仅用于界面及流程演示。场景来自真实Unity默认模板，学习行为、提交和成绩均为模拟，不代表真实学生表现；25%权重仅为测试，不是正式评分方案。',type:'lab',lessonId:'lesson-0'+(j+1),labId:'lab0'+(j+1),ideologicalNote:'测试示例：实验报告注明素材来源并如实说明测试过程。',rubric,maxScore:100,weight:25,maxAttempts:3,allowLate:true,allowResubmit:true,opensAt:null,dueAt:new Date(Date.now()+(j+2)*86400000).toISOString(),outcomeIds:[]},teacher);task=made.task;}
   assert.ok(task.description.includes(dataset),'Only manage tagged demo tasks');
   if(task.status==='draft')task=(await post('/api/teaching/tasks/'+task.id+'/publish',{},teacher)).task;
   if(!meta.tasks.some(t=>t.id===task.id))meta.tasks.push({id:task.id,title,labId:task.labId});persist();
  }
  console.log('Prepared test class '+(ci+1)+':36 students,4 published test tasks.');
 }
 for(let i=0;i<72;i++){
  const p=state.students[i],local=i%36+1,meta=state.classes.find(c=>c.name==='【测试数据】Unity2021实训'+(p.classIndex+1)+'班（36人）'),student=await login({username:p.username,password:p.password});
  const taskCount=local<=20?4:local<=26?3:local<=31?2:local<=34?1:0,gradedCount=local<=20?4:local<=26?2:local<=31?1:0;
  const tasks=(await get('/api/teaching/student/tasks',student)).tasks;
  const events=[];const lessons={};
  for(let j=0;j<4;j++){
   const key='lesson-0'+(j+1),finished=j<taskCount;
   lessons[key]={position:finished?600:local>34?45:120,duration:600,completed:finished,notes:[{id:'demo-note-'+j,text:'【模拟测试笔记】'+names[j]+'：用于测试账号隔离与记录同步。',time:60,createdAt:state.createdAt}],videoUrl:null};
   if(finished){for(const [verb,objectType,objectId] of [['self_reported','task',meta.tasks[j].id],['ended','lesson',key]])events.push({eventId:randomUUID(),idempotencyKey:dataset+':'+p.username+':'+j+':'+verb,verb,objectType,objectId,classId:meta.id,taskId:meta.tasks[j].id,courseVersionId:String(course.revision),occurredAt:new Date().toISOString(),payload:{synthetic:true,dataset}});}
   if(j>=taskCount)continue;
   const task=tasks.find(t=>t.id===meta.tasks[j].id);assert.ok(task);
   const keyId=dataset+':'+p.username+':task'+j+':v1';let sub=task.mySubmissions?.find(s=>s.idempotencyKey===keyId)||task.mySubmissions?.[0];
   if(!sub)sub=(await post('/api/teaching/tasks/'+task.id+'/submissions',{idempotencyKey:keyId,sceneJson:JSON.stringify(templates['lab0'+(j+1)]),note:'【模拟测试提交】'+p.name+'：'+names[j]+'。测试数据用于批阅、反馈、重做和统计演示，不表示该学生真实运行过实验。',checkResult:{synthetic:true,dataset,passed:local<=26,source:'synthetic_demo',message:local<=26?'模拟：规则检查通过':'模拟：需要检查脚本引用或依赖'}},student)).submission;
   if(j<gradedCount&&sub.status!=='graded'){
    const factor=.6+((local*7+j*3+p.classIndex*11)%35)/100;
    const scores=Object.fromEntries(rubric.map(r=>[r.id,Math.round(r.maxScore*factor*2)/2]));
    await post('/api/teaching/submissions/'+sub.id+'/grade',{scores,feedback:'【模拟教师反馈】'+(local<=20?'结果较完整，注意说明组件依赖。':'请补充过程说明并按反馈重做。'),released:!(local>=19&&local<=20&&j===3)},teacher);
   }
   if(local<=3&&j===0){
    const sub2=(await post('/api/teaching/tasks/'+task.id+'/submissions',{idempotencyKey:dataset+':'+p.username+':task0:v2',sceneJson:JSON.stringify(templates.lab01),note:'【模拟重做】补充场景与脚本引用说明，原提交保留。',checkResult:{synthetic:true,dataset,passed:true,source:'synthetic_demo'}},student)).submission;
    if(sub2.status!=='graded')await post('/api/teaching/submissions/'+sub2.id+'/grade',{scores:{scene:38,behavior:37,report:19},feedback:'【模拟重做反馈】已按反馈改进。',released:true},teacher);
   }
  }
  if(events.length)await post('/api/teaching/events',{events},student);
  await call('/api/teaching/student/records','PUT',{courseId,state:{version:1,courseId,lastLessonId:'lesson-0'+Math.max(1,taskCount),lessons,synthetic:true,dataset}},student);
  await post('/api/logout',{},student);sessions.splice(sessions.indexOf(student),1);p.seeded=true;persist();
  if((i+1)%12===0)console.log('Seeded student records '+(i+1)+'/72.');
 }
 for(const meta of state.classes){
  const members=(await get('/api/teaching/classes/'+meta.id,teacher)).members;
  const existing=(await get('/api/teaching/classes/'+meta.id+'/interventions',teacher)).interventions||[];
  for(const offset of [31,34,35]){const p=state.students.filter(s=>s.classIndex===(meta===state.classes[0]?0:1))[offset];const note='【模拟辅导 '+dataset+'】存在未交任务，建议先完成基础场景并检查脚本依赖；仅为演示记录，不发送外部消息。';if(!existing.some(x=>x.studentNo===p.studentNo&&x.note===note))await post('/api/teaching/classes/'+meta.id+'/interventions',{studentId:p.id,taskId:meta.tasks[0].id,kind:'remind',note},teacher);}
  meta.analytics=await get('/api/teaching/classes/'+meta.id+'/analytics',teacher);
 }
 const current=await get('/api/manage/courses/'+courseId,teacher);assert.equal(current.revision,state.originalCourseRevision);assert.equal(current.publishedRevision,state.originalPublishedRevision);
 fs.writeFileSync(csvFile,'\ufeff班级,学号,姓名,账号,密码,分组,说明\r\n'+state.students.map(p=>[p.classIndex+1,p.studentNo,p.name,p.username,p.password,p.groupName,'仅模拟测试'].join(',')).join('\r\n'),{mode:0o600});
 state.completedAt=new Date().toISOString();state.accountsFile=csvFile;persist();console.log(JSON.stringify({dataset,classes:state.classes.map(c=>({id:c.id,name:c.name,students:c.analytics.students.length,publishedTasks:c.analytics.denominator})),students:state.students.length,accountsFile:csvFile,backup:state.backup||null,courseUnchanged:true},null,2));
}finally{for(const s of sessions){try{await post('/api/logout',{},s);}catch{}}}
