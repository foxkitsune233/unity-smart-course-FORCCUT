// 生成图表视觉预览（静态 HTML，数据为演示样本，不写入数据库）。
import fs from 'node:fs';
import {caliberChart,scoreChart,studentTotalChart,weightRing,outcomeMatrix,riskChart,progressRing} from './charts.mjs';

const names=['陈一','李二','王三','赵四','孙五','周六','吴七','郑八','冯九','陈十','褚十一','卫十二','蒋十三','沈十四','韩十五','杨十六','朱十七','秦十八','尤十九','许二十','何廿一','吕廿二','施廿三','张廿四','孔廿五','曹廿六','严廿七','华廿八','金廿九','魏三十'];
const tasks=['CH01 场景搭建','CH02 组件与发射器','CH03 物理与落地','CH04 坐标与朝向','CH05 UGUI 血条','CH06 角色动画','CH07 数据存档','CH08 综合实训'];
const students=names.map((name,index)=>{
 const base=52+((index*37)%45);
 return {
  studentId:'s'+index,studentNo:'2026'+String(index+1).padStart(3,'0'),name,groupName:'第'+(index%4+1)+'组',
  average:Math.min(100,base),
  courseTotal:Math.round(Math.min(100,base+3)*10)/10,
  weightComplete:index!==29,
  tasksTotal:tasks.length,submittedCount:4+index%5,confirmedCount:3+index%5,
  tasks:tasks.map((title,ti)=>({taskId:'t'+ti,title,maxScore:100,weight:12.5,
   statuses:{selfReported:(index+ti)%3!==0,videoEnded:(index+ti)%2===0,experimentPassed:(index*3+ti)%4!==0,experimentChecked:true,teacherConfirmed:(index+ti)%5>1}})),
 };
});
const outcomes=[
 {id:'o1',code:'G1',description:'能独立搭建 3D 场景并配置组件',type:'skill',linked:true,achieved:86.4,tasks:[
  {taskId:'t0',title:tasks[0],weight:1,normalized:88.5,count:28},{taskId:'t1',title:tasks[1],weight:1,normalized:82.1,count:26},{taskId:'t2',title:tasks[2],weight:1,normalized:88.6,count:27}]},
 {id:'o2',code:'G2',description:'能编写并调试 C# 脚本控制对象行为',type:'skill',linked:true,achieved:73.8,tasks:[
  {taskId:'t2',title:tasks[2],weight:1,normalized:80.2,count:27},{taskId:'t3',title:tasks[3],weight:1,normalized:68.4,count:24}]},
 {id:'o3',code:'G3',description:'能分析物理参数对运动结果的影响',type:'knowledge',linked:true,achieved:64.2,tasks:[
  {taskId:'t2',title:tasks[2],weight:1,normalized:62.7,count:27},{taskId:'t4',title:tasks[4],weight:1,normalized:65.9,count:25}]},
 {id:'o4',code:'G4',description:'能按工程规范提交可复现的实验记录',type:'literacy',linked:false,achieved:null,tasks:[]},
];
const risks=[
 {studentId:'s3',studentNo:'2026004',name:'赵四',reason:'平均分低于 60',average:52,confirmed:2,tasksTotal:8},
 {studentId:'s7',studentNo:'2026008',name:'郑八',reason:'平均分低于 60',average:56,confirmed:9,tasksTotal:8},
 {studentId:'s11',studentNo:'2026012',name:'卫十二',reason:'已完成任务不足一半',average:71,confirmed:3,tasksTotal:8},
 {studentId:'s17',studentNo:'2026018',name:'秦十八',reason:'已完成任务不足一半',average:66,confirmed:2,tasksTotal:8},
 {studentId:'s23',studentNo:'2026024',name:'张廿四',reason:'平均分低于 60',average:58,confirmed:6,tasksTotal:8},
];

const body=`
<section class="wrap">
 <header class="head"><span class="eyebrow">VISUAL PREVIEW</span><h1>课程平台图表视觉预览</h1>
  <p>样本数据，仅用于确认版式与配色；真实页面读的是数据库里的提交与批阅记录。</p></header>

 <section class="panel"><h2>完成口径对比</h2><p class="desc">同一任务四种口径并排，不相加。胶囊图例、整数刻度、右对齐数值。</p>${caliberChart(students,{maxTasks:6})}</section>

 <section class="panel"><h2>成绩分布与课程总评</h2><p class="desc">分布图带均分参考线；总评条形带名次、及格线与权重不足标记。</p>
  <div class="grid2">${scoreChart(students)}${studentTotalChart(students)}</div></section>

 <section class="panel"><h2>任务权重配置</h2><p class="desc">环图分段留缝，图例内嵌占比条。</p>${weightRing(tasks.map((title,index)=>({id:'t'+index,title,status:'published',weight:index===tasks.length-1?12.5:12.5})))}</section>

 <section class="panel"><h2>课程目标达成矩阵</h2><p class="desc">目标 × 任务，颜色越深达成度越高；未关联任务的目标留空，不填估算值。</p>${outcomeMatrix(outcomes)}</section>

 <section class="panel"><h2>风险概览</h2><p class="desc">需要关注的学生占比，以及触发原因分布。</p>${riskChart(risks,students.length)}</section>

 <section class="panel"><h2>学生端三段进度</h2><p class="desc">提交 / 批阅 / 发布分开统计，避免把「已提交」说成「已完成」。</p>
  <div class="grid3">${progressRing(62,{label:'已提交 5/8 项'})}${progressRing(50,{label:'老师已批阅 4/8 项'})}${progressRing(37.5,{label:'成绩已发布 3/8 项'})}</div></section>
</section>`;

const css=`
:root{--ink:#172c3e;--muted:#71808e;--line:#e6ebef;--green:#087f70;--navy:#102536}
*{box-sizing:border-box}
body{margin:0;background:#f6f8f9;color:var(--ink);font:14px/1.65 "Microsoft YaHei",system-ui,-apple-system,sans-serif}
.wrap{max-width:1040px;margin:0 auto;padding:36px 24px 64px}
.head{margin-bottom:26px}
.eyebrow{font-size:10px;letter-spacing:.16em;color:#8b9aa5;font-weight:700}
.head h1{font-size:26px;margin:6px 0 8px}
.head p{margin:0;color:#5d7385;font-size:12.5px}
.panel{background:#fff;border:1px solid var(--line);border-radius:12px;padding:22px 24px;margin-bottom:18px;box-shadow:0 1px 2px rgba(16,37,54,.04)}
.panel h2{font-size:15px;margin:0 0 4px}
.desc{font-size:12px;color:#7d9099;margin:0 0 14px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:26px;align-items:start}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
@media(max-width:820px){.grid2,.grid3{grid-template-columns:1fr}}
.cx-chart{margin-top:6px}
.cx-chart svg{max-width:100%;height:auto;display:block}
.cx-tick{font-size:10px;fill:var(--muted);font-family:inherit}
.cx-value{font-size:10px;fill:var(--ink);font-variant-numeric:tabular-nums;font-family:inherit}
.cx-legend{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}
.cx-legend-item{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#5d7385}
.cx-legend-item i{width:11px;height:11px;border-radius:3px;flex:none}
.cx-legend-list{list-style:none;margin:0;padding:0;flex:1;min-width:180px;display:flex;flex-direction:column;gap:7px}
.cx-legend-list li{display:flex;align-items:center;gap:8px;font-size:12px;color:#4a6172}
.cx-legend-list i{width:10px;height:10px;border-radius:3px;flex:none}
.cx-legend-list span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cx-legend-list strong{font-variant-numeric:tabular-nums;color:var(--ink)}
.cx-ring-wrap{display:flex;flex-wrap:wrap;gap:28px;align-items:center}
.cx-ring{width:180px;height:180px;flex:none}
.cx-ring-value{font-size:21px;font-weight:700;fill:var(--ink);font-family:inherit}
.cx-ring-label{font-size:10px;fill:var(--muted);font-family:inherit}
.cx-progress{display:flex;flex-direction:column;align-items:center;gap:6px}
.cx-progress svg{width:140px;height:140px}
.cx-progress-label{font-size:11px;color:#5d7385;margin:0;text-align:center}
.cx-label{font-size:10.5px;fill:#42596a}
.cx-strong{font-weight:700;font-size:10.5px}
.cx-rank{font-size:10px;fill:#a8bcc7;font-variant-numeric:tabular-nums}
.cx-pill{padding:5px 10px;border:1px solid var(--line);border-radius:99px;background:#fbfcfd}
.cx-pill i{width:9px;height:9px;border-radius:50%}
.cx-legend-track{display:block;flex:none;width:74px;height:5px;border-radius:99px;background:#eef2f4;overflow:hidden}
.cx-legend-track em{display:block;height:100%;border-radius:99px}
.cx-risk-wrap{display:flex;flex-wrap:wrap;gap:26px;align-items:center}
.cx-risk-wrap .cx-ring{width:150px;height:150px}
.matrix-table{width:100%;border-collapse:separate;border-spacing:3px;font-size:12px}
.matrix-table th,.matrix-table td{padding:8px 9px;text-align:center;border-radius:6px}
.matrix-table thead th{background:#f5f8f9;color:#5b7281;font-size:11px;font-weight:600;white-space:nowrap}
.matrix-table th.matrix-goal{text-align:left;min-width:180px;max-width:260px;background:#f5f8f9}
.matrix-code{display:inline-block;font-size:10px;color:#4f6a7b;margin-right:6px}
.matrix-desc{font-size:11px;color:#4a6172;font-weight:500}
.matrix-cell{font-variant-numeric:tabular-nums}
.matrix-cell strong{display:block;font-size:13px}
.matrix-cell small{display:block;font-size:9px;opacity:.75}
.matrix-empty{background:#fafbfc;color:#c3cfd6}
.matrix-score{font-weight:700;color:var(--ink)}
.small{font-size:11px}.muted{color:#8b9aa5}
.table-scroll{overflow-x:auto}
`;

const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>课程平台图表视觉预览</title><style>${css}</style></head><body>${body}</body></html>`;
fs.writeFileSync('D:/unity/outputs/2026-10-30-图表视觉预览.html',html,'utf8');
console.log('written',html.length);
