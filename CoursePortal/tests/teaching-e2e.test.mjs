// 端到端验证教学闭环（真实浏览器 + 真实服务端）：
// 教师建班 → 导入名单 → 建任务并发布 → 学生提交 → 教师批阅并发布成绩 → 学情与成绩可见。
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createApp} from '../server/app.mjs';

// puppeteer-core 装在 WorkBuddy 的托管 node 工作区里，ESM 不走 NODE_PATH，按绝对路径导入。
const puppeteer=(await import(pathToFileURL('C:\\Users\\HP\\.workbuddy\\binaries\\node\\workspace\\node_modules\\puppeteer-core\\lib\\puppeteer\\puppeteer-core.js').href)).default;

const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const dir=await mkdtemp(path.join(os.tmpdir(),'e2e-teaching-'));
const creds={admin:{username:'admin',password:'Admin-test-923!'},teacher:{username:'teacher',password:'Teacher-test-923!'},student:{username:'student',password:'Student-test-923!'}};
const app=createApp({dataDir:dir,bootstrap:creds});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+app.server.address().port;

// 先用接口准备教师账号与课程，学生账号由 bootstrap 建立。
const api=async(pathname,{method='GET',body,session}={})=>{
 const headers={};if(body!==undefined)headers['Content-Type']='application/json';
 if(session){headers.Cookie=session.cookie;headers['X-CSRF-Token']=session.csrfToken;}
 const r=await fetch(base+pathname,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}
 return {status:r.status,data,setCookie:r.headers.get('set-cookie')};
};
const login=async(role)=>{
 const r=await api('/api/login',{method:'POST',body:creds[role]});
 assert.equal(r.status,200,`${role} 登录失败：${JSON.stringify(r.data)}`);
 return {cookie:(r.setCookie||'').split(';')[0],csrfToken:r.data.csrfToken,user:r.data.user};
};
const teacher=await login('teacher');
const student=await login('student');

// 教师创建课程并发布，作为教学班的绑定课程。
const course=await api('/api/manage/courses',{method:'POST',session:teacher,body:{title:'Unity 脚本编程（闭环验证）'}});
assert.equal(course.status,201);
const courseId=course.data.course.id;
// 发布要求：总学时、至少一个课程目标、每章至少一个课时。先补齐最小可用内容再保存。
const draft=course.data.course;
const filled={
 ...draft,
 hours:48,
 ideologicalNote:'素材仅用于教学演示，引用需注明来源。',
 outcomes:[{id:'goal-1',code:'G1',description:'理解组件与脚本的协作关系',type:'knowledge',assessmentMode:'quantitative'}],
 chapters:[{id:'ch-1',title:'第一章 脚本基础',description:'从对象与组件出发。',lessons:[
  {id:'lesson-e2e-1',title:'脚本与组件',summary:'理解脚本如何驱动对象。',objectives:['说出组件职责'],keypoints:['生命周期'],video:{src:null,resourceId:null},practice:{available:false,title:'',url:null}},
 ]}],
};
const saved=await api(`/api/manage/courses/${courseId}`,{method:'PUT',session:teacher,body:{course:filled,expectedRevision:course.data.revision}});
assert.equal(saved.status,200,`保存课程失败：${JSON.stringify(saved.data)}`);
const published=await api(`/api/manage/courses/${courseId}/publish`,{method:'POST',session:teacher,body:{expectedRevision:saved.data.revision}});
assert.equal(published.status,200,`发布课程失败：${JSON.stringify(published.data)}`);

const browser=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage'],defaultViewport:{width:1440,height:960}});
const errors=[];
const shot=async(page,name)=>{
 await page.screenshot({path:`D:\\unity\\_wb_shots\\${name}.png`,fullPage:true});
};
const loginVia=async(page,role,portal)=>{
 await page.goto(`${base}/login.html?portal=${portal}`,{waitUntil:'networkidle0'});
 await page.evaluate(async(baseUrl,creds,portalName)=>{
  const response=await fetch(baseUrl+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...creds,portal:portalName})});
  return response.status;
 },base,creds[role],portal);
};

try{
 // ---------- 教师：教学流程页 ----------
 // favicon.ico 是浏览器默认请求，与业务无关，不计入脚本错误。
const ignorable=url=>url.includes('favicon.ico');
// 教师与学生各用独立浏览器上下文，避免共用 Cookie 导致后登录者覆盖前一个会话。
const teacherContext=await browser.createBrowserContext();
const studentContext=await browser.createBrowserContext();
const teacherPage=await teacherContext.newPage();
 teacherPage.on('console',message=>{if(message.type()==='error'&&!message.location().url.includes('favicon'))errors.push('teacher console: '+message.text());});
 teacherPage.on('pageerror',error=>errors.push('teacher pageerror: '+error.message));
 teacherPage.on('requestfailed',request=>{if(!ignorable(request.url()))errors.push('teacher requestfailed: '+request.url());});
 teacherPage.on('response',response=>{if(response.status()>=400&&!ignorable(response.url()))errors.push(`teacher ${response.status()}: ${response.url()}`);});
 await loginVia(teacherPage,'teacher','teacher');
 await teacherPage.goto(`${base}/teaching.html`,{waitUntil:'networkidle0'});
 await teacherPage.waitForSelector('.manage-course-grid, .empty-state',{timeout:15000});
 assert.ok(!errors.length,`教师页脚本错误：${errors.join(' | ')}`);
 await shot(teacherPage,'teaching-01-classes');

 // 通过界面新建教学班
 await teacherPage.click('[data-action="new-class"]');
 await teacherPage.waitForSelector('#new-class-dialog[open]',{timeout:8000});
 await teacherPage.select('#new-class-course',courseId);
 await teacherPage.type('#new-class-form input[name="name"]','闭环验证班');
 await teacherPage.click('#new-class-form button[type="submit"]');
 await teacherPage.waitForFunction(()=>location.hash.startsWith('#class/'),{timeout:15000});
 await teacherPage.waitForSelector('.teaching-tabs',{timeout:15000});
 const classUrl=await teacherPage.evaluate(()=>location.hash);
 const classId=decodeURIComponent(classUrl.split('/')[1]);
 assert.ok(classId,'应进入教学班详情');
 await shot(teacherPage,'teaching-02-class-detail');

 // ---------- 导入名单 ----------
 await teacherPage.click('[data-action="import-roster"]');
 await teacherPage.waitForSelector('#roster-dialog[open]',{timeout:8000});
 await teacherPage.type('#roster-text','20260001,验证学生,student,第一组');
 await teacherPage.click('#roster-form button[type="submit"]');
 try{
  await teacherPage.waitForSelector('#roster-preview:not([hidden])',{timeout:10000});
 }catch(error){
  const state=await teacherPage.evaluate(()=>({
   error:document.querySelector('#roster-error')?.textContent||'',
   errorHidden:document.querySelector('#roster-error')?.hidden,
   preview:document.querySelector('#roster-preview')?.innerHTML?.slice(0,400)||'',
   notice:document.querySelector('#page-notice')?.textContent||'',
  }));
  throw new Error(`名单预览未出现：${JSON.stringify(state)}`);
 }
 const previewText=await teacherPage.$eval('#roster-preview',node=>node.textContent);
 assert.match(previewText,/可入班/,'预览应列出可入班学生');
 await teacherPage.click('[data-action="confirm-roster"]');
 await teacherPage.waitForFunction(()=>!document.querySelector('#roster-dialog')?.open,{timeout:10000});
 await teacherPage.waitForSelector('[data-panel="roster"] .data-table',{timeout:10000});
 const rosterText=await teacherPage.$eval('[data-panel="roster"]',node=>node.textContent);
 assert.match(rosterText,/验证学生/,'名单中应出现学生');
 await shot(teacherPage,'teaching-03-roster');

 // ---------- 新建任务并发布 ----------
 await teacherPage.click('[data-tab="tasks"]');
 await teacherPage.click('[data-action="new-task"]');
 await teacherPage.waitForSelector('#task-dialog[open]',{timeout:8000});
 await teacherPage.type('#task-form input[name="title"]','LAB01 场景搭建实训');
 await teacherPage.type('#task-form textarea[name="description"]','完成基础场景搭建并截图说明。');
 await teacherPage.evaluate(()=>{
  const rows=[...document.querySelectorAll('#task-form .rubric-row')];
  const values=[['场景搭建',60,60],['脚本配置',40,40]];
  rows.forEach((row,index)=>{
   const [title,maxScore,weight]=values[index]||['',0,0];
   row.querySelector('.rubric-title').value=title;
   row.querySelector('.rubric-max').value=String(maxScore);
   row.querySelector('.rubric-weight').value=String(weight);
  });
 });
 await teacherPage.click('#task-form button[type="submit"]');
 await teacherPage.waitForFunction(()=>document.querySelector('#task-dialog')?.open===false,{timeout:12000});
 await teacherPage.waitForSelector('[data-panel="tasks"] .data-table',{timeout:10000});
 const taskText=await teacherPage.$eval('[data-panel="tasks"]',node=>node.textContent);
 assert.match(taskText,/LAB01 场景搭建实训/,'任务列表应出现新任务');
 assert.match(taskText,/草稿/,'新任务应为草稿状态');
 await shot(teacherPage,'teaching-04-task-draft');

 await teacherPage.click('[data-action="publish-task"]');
 try{
  await teacherPage.waitForFunction(()=>{
   const panel=document.querySelector('[data-panel="tasks"]');
   return panel&&panel.textContent.includes('已发布');
  },{timeout:12000});
 }catch(error){
  const state=await teacherPage.evaluate(()=>({
   notice:document.querySelector('#page-notice')?.textContent||'',
   panel:(document.querySelector('[data-panel="tasks"]')?.textContent||'').slice(0,500),
   hash:location.hash,
  }));
  throw new Error(`任务未变为已发布：${JSON.stringify(state)}`);
 }
 await shot(teacherPage,'teaching-05-task-published');

 // ---------- 学生：任务页 ----------
 const studentPage=await studentContext.newPage();
 studentPage.on('console',message=>{if(message.type()==='error'&&!message.location().url.includes('favicon'))errors.push('student console: '+message.text());});
 studentPage.on('pageerror',error=>errors.push('student pageerror: '+error.message));
 studentPage.on('requestfailed',request=>{if(!ignorable(request.url()))errors.push('student requestfailed: '+request.url());});
 studentPage.on('response',response=>{if(response.status()>=400&&!ignorable(response.url()))errors.push(`student ${response.status()}: ${response.url()}`);});
 await loginVia(studentPage,'student','student');
 await studentPage.goto(`${base}/tasks.html`,{waitUntil:'networkidle0'});
 await studentPage.waitForSelector('.manage-course-grid, .empty-state',{timeout:15000});
 const studentTaskText=await studentPage.$eval('#tasks-view',node=>node.textContent);
 assert.match(studentTaskText,/LAB01 场景搭建实训/,'学生应看到已发布的任务');
 assert.match(studentTaskText,/提交任务/,'学生应看到提交入口');
 await shot(studentPage,'tasks-01-list');

 // 提交任务
 await studentPage.click('[data-action="open-task"]');
 await studentPage.waitForSelector('#submit-dialog[open]',{timeout:8000});
 const rubricText=await studentPage.$eval('#submit-rubric',node=>node.textContent);
 assert.match(rubricText,/场景搭建/,'提交弹窗应公开量规维度');
 await studentPage.type('#submit-form textarea[name="note"]','已完成场景搭建，脚本绑定在 Player 上。');
 await studentPage.click('#submit-form button[type="submit"]');
 await studentPage.waitForFunction(()=>document.querySelector('#submit-dialog')?.open===false,{timeout:12000});
 await studentPage.waitForFunction(()=>document.querySelector('#tasks-view')?.textContent.includes('待批阅'),{timeout:12000});
 await shot(studentPage,'tasks-02-submitted');

 // ---------- 教师：批阅 ----------
 await teacherPage.goto(`${base}/teaching.html#grading`,{waitUntil:'networkidle0'});
 await teacherPage.waitForSelector('.data-table',{timeout:15000});
 const queueText=await teacherPage.$eval('#teaching-view',node=>node.textContent);
 if(!/LAB01 场景搭建实训/.test(queueText)){
  const detail=await teacherPage.evaluate(()=>({
   notice:document.querySelector('#page-notice')?.textContent||'',
   hash:location.hash,
  }));
  throw new Error(`批阅队列缺少任务：${JSON.stringify(detail)}｜视图：${queueText.slice(0,300)}`);
 }
 await shot(teacherPage,'teaching-06-grading-queue');

 // 进入具体任务的批阅页
 await teacherPage.click('a[href^="#grading/"]');
 await teacherPage.waitForSelector('[data-action="grade"]',{timeout:15000});
 const submissionText=await teacherPage.$eval('#teaching-view',node=>node.textContent);
 assert.match(submissionText,/验证学生/,'批阅页应列出该学生的提交');
 await shot(teacherPage,'teaching-06b-submissions');

 await teacherPage.click('[data-action="grade"]');
 await teacherPage.waitForSelector('#grade-dialog[open]',{timeout:8000});
 await teacherPage.evaluate(()=>{
  document.querySelectorAll('.grade-score').forEach(input=>{
   input.value=String(Math.round(Number(input.max)*0.85));
  });
  document.querySelector('#grade-feedback').value='结构清晰，脚本命名再规范一些。';
  document.querySelector('#grade-released').checked=true;
 });
 await teacherPage.click('[data-action="save-grade"]');
 await teacherPage.waitForFunction(()=>document.querySelector('#grade-dialog')?.open===false,{timeout:12000});
 await teacherPage.waitForFunction(()=>{
  const text=document.querySelector('#teaching-view')?.textContent||'';
  return /已发布/.test(text);
 },{timeout:12000});
 await shot(teacherPage,'teaching-07-graded');

 // ---------- 学生：查看成绩 ----------
 await studentPage.reload({waitUntil:'networkidle0'});
 await studentPage.waitForSelector('.manage-course-grid, .empty-state',{timeout:15000});
 const gradedText=await studentPage.$eval('#tasks-view',node=>node.textContent);
 assert.match(gradedText,/已发布成绩/,'学生应看到已发布成绩状态');
 assert.match(gradedText,/结构清晰/,'学生应看到教师评语');
 assert.match(gradedText,/场景搭建/,'学生应看到量规分项得分');
 await shot(studentPage,'tasks-03-graded');

 // ---------- 教师：班级学情 ----------
 await teacherPage.goto(`${base}/teaching.html#analytics/${classId}`,{waitUntil:'networkidle0'});
 await teacherPage.waitForSelector('.analytics-table',{timeout:15000});
 const analyticsText=await teacherPage.$eval('#teaching-view',node=>node.textContent);
 assert.match(analyticsText,/统计分母/,'学情页应显示分母说明');
 assert.match(analyticsText,/验证学生/,'学情页应列出学生');
 await shot(teacherPage,'teaching-08-analytics');

 // 图表：四口径对比、成绩分布、学生总评、权重环都必须是真实渲染的 SVG，而不是文字占位。
 const chartInfo=await teacherPage.evaluate(()=>({
  caliber:document.querySelectorAll('.cx-chart svg').length,
  caliberLegend:[...document.querySelectorAll('.cx-legend-item')].map(n=>n.textContent.trim()),
  grid:document.querySelectorAll('.cx-grid').length,
  ring:document.querySelectorAll('.cx-ring').length,
  rects:document.querySelectorAll('.cx-chart svg rect').length,
  texts:document.querySelectorAll('.cx-chart svg text').length,
 }));
 assert.ok(chartInfo.caliber>=4,`学情页应渲染至少 4 张图表，实际 ${chartInfo.caliber}`);
 assert.ok(chartInfo.rects>0,'图表内应有实际绘制的图形');
 assert.ok(chartInfo.texts>0,'图表内应有坐标轴与数值标签');
 assert.deepEqual(chartInfo.caliberLegend,['自报已学','视频结束','实验通过','教师确认'],'四口径图例顺序应与口径定义一致');
 assert.ok(chartInfo.ring>=1,'应显示任务权重环形图');
 await shot(teacherPage,'teaching-09-charts');

 // 学生端进度环
 await studentPage.reload({waitUntil:'networkidle0'});
 await studentPage.waitForSelector('.cx-progress svg',{timeout:15000});
 const studentRing=await studentPage.evaluate(()=>({
  rings:document.querySelectorAll('.cx-progress svg').length,
  labels:[...document.querySelectorAll('.cx-progress-label')].map(n=>n.textContent.trim()),
 }));
 assert.ok(studentRing.rings>=3,'学生端应显示提交/批阅/发布三个进度环');
 assert.ok(studentRing.labels.some(t=>/已提交/.test(t)),'进度环应标注已提交口径');
 assert.ok(studentRing.labels.some(t=>/已批阅/.test(t)),'进度环应标注已批阅口径');
 await shot(studentPage,'tasks-04-progress');

 assert.ok(!errors.length,`页面脚本错误：${errors.join(' | ')}`);
 console.log('E2E teaching flow passed; screenshots written to D:\\unity\\_wb_shots');
}finally{
 await browser.close();
 await app.close();
 await rm(dir,{recursive:true,force:true});
}
