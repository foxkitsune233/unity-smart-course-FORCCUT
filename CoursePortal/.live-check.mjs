// 用真实数据库起一个临时实例做只读核验（沙箱里常驻进程会被回收，所以用完即关）。
import fs from 'node:fs';
import {createApp} from './server/app.mjs';

const app=createApp({dataDir:'D:/unity/.course-portal-data'});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const BASE='http://127.0.0.1:'+app.server.address().port;
const out={at:new Date().toISOString(),base:BASE,checks:[]};
async function login(username,password){
 const r=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
 const data=await r.json();
 return {status:r.status,data,cookie:(r.headers.get('set-cookie')||'').split(';')[0]};
}
async function get(path,cookie){
 const r=await fetch(BASE+path,{headers:{Cookie:cookie}});
 let data=null;try{data=await r.json();}catch{}
 return {status:r.status,data};
}
try{
 const teacher=await login('teacher','78LPHa42jXYus2KKKZBj');
 out.checks.push({name:'teacher login',status:teacher.status});
 const labs=await get('/api/teaching/labs',teacher.cookie);
 out.checks.push({name:'GET /api/teaching/labs',status:labs.status,count:labs.data?.labs?.length,canEdit:labs.data?.canEdit,
  firstVersion:labs.data?.labs?.[0]?.version,checksOnLab03:labs.data?.labs?.find(l=>l.labId==='lab03')?.checks?.length});
 const tpl=await get('/api/teaching/labs/lab03/template',teacher.cookie);
 out.checks.push({name:'GET lab03 template',status:tpl.status,source:tpl.data?.source,checks:tpl.data?.template?.checks?.length});
 const classes=await get('/api/teaching/classes',teacher.cookie);
 const first=classes.data?.classes?.[0];
 out.checks.push({name:'GET classes',status:classes.status,count:classes.data?.classes?.length,first:first?.name});
 if(first){
  const report=await get(`/api/teaching/classes/${first.id}/report`,teacher.cookie);
  out.checks.push({name:'GET class report',status:report.status,
   students:report.data?.totals?.students,tasks:report.data?.totals?.tasks,
   evidence:report.data?.evidence?.map(e=>e.kind+':'+e.count).join(','),
   outcomes:report.data?.outcomes?.length,risks:report.data?.risks?.length});
  const appeals=await get(`/api/teaching/classes/${first.id}/appeals`,teacher.cookie);
  out.checks.push({name:'GET class appeals',status:appeals.status,count:appeals.data?.appeals?.length,open:appeals.data?.appeals?.filter(a=>a.status==='open').length});
  const htmlResp=await fetch(BASE+`/api/teaching/classes/${first.id}/report/export`,{headers:{Cookie:teacher.cookie}});
  const html=await htmlResp.text();
  out.checks.push({name:'GET report export',status:htmlResp.status,bytes:html.length,hasTitle:html.includes('课程质量报告'),hasEvidence:html.includes('过程证据材料')});
 }
 const student=await login('student','LXx_7dY2YLeG6LCjdxcO');
 out.checks.push({name:'student login',status:student.status});
 const tasks=await get('/api/teaching/student/tasks',student.cookie);
 out.checks.push({name:'GET student tasks',status:tasks.status,count:tasks.data?.tasks?.length});
 const subs=await get('/api/teaching/student/submissions',student.cookie);
 out.checks.push({name:'GET student submissions',status:subs.status,count:subs.data?.submissions?.length,
  appealFieldPresent:subs.data?.submissions?.every(s=>'appeal' in s)});
 const appeals=await get('/api/teaching/student/appeals',student.cookie);
 out.checks.push({name:'GET student appeals',status:appeals.status,count:appeals.data?.appeals?.length});
}catch(error){
 out.error=String(error&&error.stack||error);
}finally{
 await app.close();
}
fs.writeFileSync('D:/unity/CoursePortal/Evidence/2026-10-30-feature-batch-live.json',JSON.stringify(out,null,1),'utf8');
console.log(JSON.stringify(out,null,1));

