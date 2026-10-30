// 量规与评分计算。
// 权重分两层且不共用字段：
//   第一层 rubric[].weight —— 任务内各评分维度占比，同一任务内合计必须为 100%。
//   第二层 task.weight      —— 该任务在课程总评中的占比，由教师在发布任务时填写。
// 规则检测结果（checkResult）只作为教师批阅的证据，不直接等于最终成绩。
export const RESERVED_KEYS=['__proto__','constructor','prototype','toString'];
const safeId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)&&!RESERVED_KEYS.includes(v);
const round=v=>Math.round(v*100)/100;

export function normalizeRubric(input){
 const list=Array.isArray(input)?input:[];
 const errors=[],seen=new Set(),out=[];
 for(const raw of list.slice(0,20)){
  if(!raw||typeof raw!=='object'){errors.push('量规维度格式无效');continue;}
  const id=typeof raw.id==='string'&&raw.id.trim()?raw.id.trim():'';
  if(!safeId(id)){errors.push('量规维度标识无效');continue;}
  if(seen.has(id)){errors.push('量规维度标识重复');continue;}
  seen.add(id);
  const title=typeof raw.title==='string'?raw.title.trim():'';
  if(!title||title.length>100){errors.push('请填写量规维度名称');}
  const maxScore=Number(raw.maxScore);
  if(!Number.isFinite(maxScore)||maxScore<=0||maxScore>1000){errors.push('量规维度满分须为大于0的数值');}
  const weight=Number(raw.weight);
  if(!Number.isFinite(weight)||weight<0||weight>100){errors.push('量规维度权重须在0—100之间');}
  out.push({id,title,maxScore:round(maxScore),weight:round(weight)});
 }
 if(!out.length)errors.push('至少填写一个量规维度');
 const total=round(out.reduce((sum,d)=>sum+d.weight,0));
 if(out.length&&Math.abs(total-100)>0.001)errors.push('同一任务内的量规维度权重合计须为100%（当前'+total+'%）');
 const maxSum=round(out.reduce((sum,d)=>sum+d.maxScore,0));
 return {rubric:out,weightTotal:total,maxTotal:maxSum,errors};
}

// 校验量规维度满分之和是否等于任务满分（发布任务时）。
export function rubricMaxMismatch(rubric,taskMaxScore){
 return Math.abs(round(rubric.reduce((sum,d)=>sum+d.maxScore,0))-round(taskMaxScore))>0.001;
}

// 教师评分：各维度得分 -> {total 原始分, normalized 任务达成百分比, weighted 维度权重加权达成度}
// total    ：各维度得分之和，即发布给学生的任务得分（满分 = 任务满分）。
// normalized：total / 任务满分 × 100，用于第二层权重加权（课程总评）。
// weighted ：Σ(维度得分/维度满分 × 维度权重)，用于目标达成矩阵（F19）的贡献计算；
//            维度权重不改变任务得分本身，只改变目标贡献口径。
export function scoreRubric(rubric,scores){
 const input=scores&&typeof scores==='object'?scores:{};
 const errors=[],items=[];let total=0,weighted=0;
 for(const d of rubric){
  const raw=input[d.id];
  const value=raw===undefined||raw===null||raw===''?null:Number(raw);
  if(value===null||!Number.isFinite(value)||value<0||value>d.maxScore){errors.push('「'+d.title+'」得分须在0—'+d.maxScore+'之间');continue;}
  const points=round(value);total+=points;weighted+=points/d.maxScore*d.weight;
  items.push({id:d.id,title:d.title,maxScore:d.maxScore,weight:d.weight,score:points,weighted:round(points/d.maxScore*d.weight)});
 }
 const maxTotal=round(rubric.reduce((sum,d)=>sum+d.maxScore,0));
 const normalized=maxTotal>0?round(total/maxTotal*100):0;
 return {items,total:round(total),normalized,weighted:round(weighted),maxTotal,errors};
}

// 改分时同步分项：把原分项按比例缩放到新的总分，并修正舍入误差。
// 目的：改分后「总分 = 各分项之和」，导出与页面对得上，不出现分项仍停在旧值的错位。
export function rescaleRubric(items,newTotal,maxTotal){
 const list=(Array.isArray(items)?items:[]).map(it=>({id:it.id,title:it.title,maxScore:round(Number(it.maxScore)||0),weight:round(Number(it.weight)||0),score:round(Number(it.score)||0)}));
 const limit=round(Number(maxTotal)||list.reduce((sum,it)=>sum+it.maxScore,0));
 const target=round(Number(newTotal));
 if(!Number.isFinite(target)||target<0||target>limit)return {items:list,total:round(list.reduce((sum,it)=>sum+it.score,0)),normalized:0,error:'改分后的分数须在0—'+limit+'之间'};
 if(!list.length)return {items:[],total:target,normalized:limit>0?round(target/limit*100):0};
 const before=round(list.reduce((sum,it)=>sum+it.score,0));
 const next=before>0
  ?list.map(it=>({...it,score:Math.min(it.maxScore,round(it.score*target/before))}))
  :list.map(it=>({...it,score:round(it.maxScore*target/limit)}));
 // 舍入余量落在还有余地的维度上，从后往前吸收，保证合计严格等于目标分。
 let diff=round(target-next.reduce((sum,it)=>sum+it.score,0));
 for(let i=next.length-1;i>=0&&Math.abs(diff)>0.001;i--){
  const room=diff>0?round(next[i].maxScore-next[i].score):round(next[i].score);
  const delta=diff>0?Math.min(room,diff):-Math.min(room,-diff);
  next[i].score=round(next[i].score+delta);
  diff=round(diff-delta);
 }
 const total=round(next.reduce((sum,it)=>sum+it.score,0));
 return {items:next,total,normalized:limit>0?round(total/limit*100):0};
}

// 课程总评：各任务的归一百分制按第二层权重（task.weight）加权。
// 权重合计不足 100% 时返回 weightTotal，由界面显式说明"占比未配置完整"，不擅自补齐。
export function courseTotal(tasks){
 const list=Array.isArray(tasks)?tasks:[];
 const scored=list.filter(t=>t&&Number.isFinite(t.normalized)&&Number.isFinite(t.weight)&&t.weight>0);
 const weightTotal=round(scored.reduce((sum,t)=>sum+t.weight,0));
 const total=round(scored.reduce((sum,t)=>sum+t.normalized*t.weight/100,0));
 return {total,weightTotal,complete:Math.abs(weightTotal-100)<0.001,count:scored.length};
}
