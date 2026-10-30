// 针对真实运行中的 8090 服务做一次页面可达性验证：
// 确认新页面不再 404、脚本无报错、教师端入口可达。
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const puppeteer=(await import(pathToFileURL('C:\\Users\\HP\\.workbuddy\\binaries\\node\\workspace\\node_modules\\puppeteer-core\\lib\\puppeteer\\puppeteer-core.js').href)).default;
const EDGE='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const base='http://127.0.0.1:8090';

// 从本机账号文件读取教师账号
import fs from 'node:fs';
const accounts=fs.readFileSync('D:\\unity\\.course-portal-data\\local-accounts.txt','utf8');
const teacherLine=accounts.split(/\r?\n/).find(l=>/teacher/i.test(l))||'';
const parts=teacherLine.split(/[\s,:|]+/).filter(Boolean);
const creds={username:parts[parts.length-2],password:parts[parts.length-1]};

const browser=await puppeteer.launch({executablePath:EDGE,headless:'new',args:['--no-sandbox','--disable-dev-shm-usage'],defaultViewport:{width:1440,height:960}});
const context=await browser.createBrowserContext();
const page=await context.newPage();
const errors=[];
page.on('console',m=>{if(m.type()==='error'&&!m.location().url.includes('favicon'))errors.push('console: '+m.text());});
page.on('pageerror',e=>errors.push('pageerror: '+e.message));
page.on('response',r=>{if(r.status()>=400&&!r.url().includes('favicon'))errors.push(`${r.status()}: ${r.url()}`);});

try{
 // 登录
 await page.goto(`${base}/login.html?portal=teacher`,{waitUntil:'networkidle0'});
 await page.evaluate(async(baseUrl,c)=>{await fetch(baseUrl+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...c,portal:'teacher'})});},base,creds);

 // 教师端首页应可达
 await page.goto(`${base}/teacher.html`,{waitUntil:'networkidle0'});
 await page.waitForSelector('a.nav-link[href="teaching.html"]',{timeout:12000});
 const teacherHtml=await page.$eval('body',n=>n.innerHTML);
 assert.ok(/teaching\.html/.test(teacherHtml),'教师端应有教学流程入口');
 await page.screenshot({path:'D:\\unity\\_wb_shots\\live-01-teacher.png',fullPage:true});

 // 教学流程页
 await page.goto(`${base}/teaching.html`,{waitUntil:'networkidle0'});
 await page.waitForSelector('#teaching-view .page-heading, #teaching-view .empty-state',{timeout:15000});
 const text=await page.$eval('#teaching-view',n=>n.textContent);
 assert.ok(/教学班/.test(text),'教学流程页应显示教学班内容');
 await page.screenshot({path:'D:\\unity\\_wb_shots\\live-02-teaching.png',fullPage:true});

 // 图表资源可直接访问
 const chartRes=await page.goto(`${base}/charts.mjs`,{waitUntil:'networkidle0'});
 assert.equal(chartRes.status(),200,'charts.mjs 应可访问');

 assert.ok(!errors.length,`页面错误：${errors.join(' | ')}`);
 console.log('LIVE 8090 verification passed');
}finally{
 await browser.close();
}
