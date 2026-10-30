// 原生 SVG / HTML 图表：四口径对比、成绩分布、学生总评、任务权重环、目标达成矩阵、风险概览。
// 全部离线渲染，不引入任何外部库（CSP script-src 'self' 禁止 CDN）。
// 配色沿用 portal.css 的设计令牌：墨色 #172c3e、线色 #e6ebef、主绿 #087f70、藏青 #102536。

const INK='#172c3e',MUTED='#71808e',LINE='#e6ebef',GREEN='#087f70',NAVY='#102536',GOLD='#c99a41',BLUE='#4d8fa6';

// 四种完成口径的固定配色与顺序，图表与表格口径顺序必须一致。
export const calibers=[
 {key:'selfReported',label:'自报已学',color:'#a8bcc7',light:'#cfdce3'},
 {key:'videoEnded',label:'视频结束',color:'#4d8fa6',light:'#9dc2d2'},
 {key:'experimentPassed',label:'实验通过',color:'#c99a41',light:'#e6cd97'},
 {key:'teacherConfirmed',label:'教师确认',color:'#087f70',light:'#79c1b6'},
];

const esc=value=>String(value??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const round=value=>Math.round(Number(value||0)*100)/100;
const truncate=(text,max=8)=>{const s=String(text??'');return s.length>max?s.slice(0,max)+'…':s;};
let uid=0;
const nextId=()=>'cx'+(++uid);

// 渐变定义：同一页面多次调用时 id 不能重复，否则后面的图会串色。
function gradients(id,stops){
 return `<defs>${stops.map((color,index)=>`<linearGradient id="${id}-${index}" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="${color.light||color}" stop-opacity=".75"/><stop offset="1" stop-color="${color.color||color}"/>
 </linearGradient>`).join('')}</defs>`;
}

// ===== 四口径完成对比（横向分组条形图）=====
// 每个任务一组，组内四条分别表示四种口径下的完成人数。四口径互不替代，所以并排展示而不是相加。
export function caliberChart(students,{maxTasks=8}={}){
 const list=students||[];
 if(!list.length)return '<p class="muted small">暂无学生数据。</p>';
 const titles=[];
 list.forEach(s=>(s.tasks||[]).forEach(t=>{if(!titles.includes(t.title))titles.push(t.title);}));
 const shown=titles.slice(0,maxTasks);
 if(!shown.length)return '<p class="muted small">本班尚未下发任务，四种口径暂无可对比的数据。</p>';

 const labelW=176,plotW=400,barH=10,gap=4,groupGap=22;
 const rowH=calibers.length*barH+(calibers.length-1)*gap;
 const height=shown.length*(rowH+groupGap)+34;
 const counts={};
 shown.forEach(title=>{counts[title]=calibers.map(c=>list.filter(s=>(s.tasks||[]).some(t=>t.title===title&&t.statuses&&t.statuses[c.key])).length);});
 const max=Math.max(1,...shown.flatMap(t=>counts[t]));
 // 刻度取整：人数为整数时用整数刻度，避免 0.25 人这种读不通的标注。
 const tickStep=Math.max(1,Math.ceil(max/4));
 const tickMax=Math.ceil(max/tickStep)*tickStep;
 const scale=plotW/tickMax;
 const x0=labelW+10;
 const id=nextId();

 let bars='';
 shown.forEach((title,gi)=>{
  const y=26+gi*(rowH+groupGap);
  bars+=`<text x="${labelW}" y="${y+rowH/2-1}" text-anchor="end" class="cx-tick cx-label">${esc(truncate(title,12))}</text>`;
  calibers.forEach((c,ci)=>{
   const value=counts[title][ci];
   const w=Math.round(value*scale);
   const by=y+ci*(barH+gap);
   bars+=`<rect x="${x0}" y="${by}" width="${plotW}" height="${barH}" rx="5" fill="#f2f5f6"/>`;
   if(w>0)bars+=`<rect x="${x0}" y="${by}" width="${Math.max(w,3)}" height="${barH}" rx="5" fill="url(#${id}-${ci})"><title>${esc(title)} · ${esc(c.label)}：${value} 人</title></rect>`;
   bars+=`<text x="${x0+plotW+9}" y="${by+barH-1}" class="cx-value cx-strong">${value}</text>`;
  });
 });

 const grid=[];
 for(let v=0;v<=tickMax;v+=tickStep){
  const x=x0+Math.round(plotW*(v/tickMax));
  grid.push(`<line x1="${x}" y1="18" x2="${x}" y2="${height-28}" stroke="${LINE}" stroke-dasharray="${v===0?'0':'2 3'}"/><text x="${x}" y="${height-12}" text-anchor="middle" class="cx-tick">${v}</text>`);
 }
 const total=list.length;
 return `<div class="cx-chart">
 <svg viewBox="0 0 ${labelW+plotW+58} ${height}" role="img" aria-label="四种完成口径的完成人数对比">
  ${gradients(id,calibers)}
  ${grid}
  ${bars}
  <text x="${x0}" y="${height-1}" class="cx-tick">人数（全班 ${total} 人）</text>
 </svg>
 <div class="cx-legend">${calibers.map(c=>`<span class="cx-legend-item cx-pill"><i style="background:${c.color}"></i>${esc(c.label)}</span>`).join('')}</div>
 ${titles.length>shown.length?`<p class="small muted">仅显示前 ${shown.length} 项任务，共 ${titles.length} 项。</p>`:''}
 </div>`;
}

// ===== 成绩分布（直方图 + 均分参考线）=====
export function scoreChart(students){
 const list=(students||[]).filter(s=>s.average!=null);
 if(!list.length)return '<p class="muted small">还没有已发布的成绩，暂不生成分布图。</p>';
 const buckets=[
  {label:'0–59',min:0,max:60,count:0},
  {label:'60–69',min:60,max:70,count:0},
  {label:'70–79',min:70,max:80,count:0},
  {label:'80–89',min:80,max:90,count:0},
  {label:'90–100',min:90,max:101,count:0},
 ];
 list.forEach(s=>{const v=Number(s.average);const b=buckets.find(b=>v>=b.min&&v<b.max)||buckets[buckets.length-1];b.count++;});
 const max=Math.max(1,...buckets.map(b=>b.count));
 const plotW=430,plotH=160,padL=36,padB=30,padT=16;
 const width=padL+plotW+18,height=padT+plotH+padB;
 const slot=plotW/buckets.length,barW=Math.min(54,slot-18);
 const tickStep=Math.max(1,Math.ceil(max/2));
 const tickMax=Math.ceil(max/tickStep)*tickStep;
 const grid=[];
 for(let v=0;v<=tickMax;v+=tickStep){
  const y=padT+plotH-plotH*(v/tickMax);
  grid.push(`<line x1="${padL}" y1="${y}" x2="${padL+plotW}" y2="${y}" stroke="${LINE}" stroke-dasharray="${v===0?'0':'2 3'}"/><text x="${padL-8}" y="${y+4}" text-anchor="end" class="cx-tick">${v}</text>`);
 }
 const id=nextId();
 const bars=buckets.map((b,i)=>{
  const h=Math.round(b.count/tickMax*plotH);
  const x=padL+i*slot+(slot-barW)/2,y=padT+plotH-h;
  return `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(h,2)}" rx="6" fill="url(#${id}-0)" opacity="${b.count?1:.35}"><title>${esc(b.label)} 分：${b.count} 人</title></rect>
  <text x="${x+barW/2}" y="${y-7}" text-anchor="middle" class="cx-value cx-strong">${b.count}</text>
  <text x="${x+barW/2}" y="${padT+plotH+18}" text-anchor="middle" class="cx-tick">${esc(b.label)}</text>`;
 }).join('');
 const mean=round(list.reduce((sum,s)=>sum+Number(s.average),0)/list.length);
 const meanX=padL+plotW*(Math.min(100,Math.max(0,mean))/100);
 const meanLine=`<line x1="${meanX}" y1="${padT-4}" x2="${meanX}" y2="${padT+plotH}" stroke="${GOLD}" stroke-width="1.5" stroke-dasharray="4 3"/>
  <rect x="${meanX-26}" y="${padT-18}" width="52" height="15" rx="7" fill="${GOLD}" opacity=".14"/>
  <text x="${meanX}" y="${padT-7}" text-anchor="middle" class="cx-tick" fill="#8a6a24">均分 ${mean}</text>`;
 return `<div class="cx-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="班级成绩分布">
  ${gradients(id,[{color:GREEN,light:'#9fd0c8'}])}${grid}${bars}${meanLine}
  <text x="${padL}" y="${height-4}" class="cx-tick">分数段 · 人数（${list.length} 人有已发布成绩）</text></svg></div>`;
}

// ===== 学生课程总评（横向条形，降序，带名次与及格线）=====
export function studentTotalChart(students){
 const list=(students||[]).filter(s=>s.courseTotal!=null).sort((a,b)=>Number(b.courseTotal)-Number(a.courseTotal));
 if(!list.length)return '<p class="muted small">还没有可计算课程总评的学生（需至少一项任务已发布成绩）。</p>';
 const labelW=112,plotW=372,rowH=28,barH=14;
 const height=list.length*rowH+26;
 const max=Math.max(100,...list.map(s=>Number(s.courseTotal)));
 const x0=labelW+10;
 const id=nextId();
 const rows=list.map((s,i)=>{
  const value=Number(s.courseTotal);
  const w=Math.round(value/max*plotW);
  const y=12+i*rowH;
  const incomplete=s.weightComplete===false;
  const color=incomplete?GOLD:(value>=85?GREEN:value>=60?BLUE:'#b0714a');
  return `<text x="14" y="${y+barH-2}" class="cx-tick cx-rank">${i+1}</text>
  <text x="${labelW}" y="${y+barH-2}" text-anchor="end" class="cx-tick">${esc(truncate(s.name,5))}</text>
  <rect x="${x0}" y="${y}" width="${plotW}" height="${barH}" rx="7" fill="#f2f5f6"/>
  <rect x="${x0}" y="${y}" width="${Math.max(w,3)}" height="${barH}" rx="7" fill="${color}" opacity=".92"><title>${esc(s.name)}：${value} 分${incomplete?'（任务权重合计不足 100%，按已配置部分折算）':''}</title></rect>
  <text x="${x0+plotW+9}" y="${y+barH-2}" class="cx-value cx-strong">${round(value)}</text>`;
 }).join('');
 const passX=x0+Math.round(60/max*plotW);
 return `<div class="cx-chart"><svg viewBox="0 0 ${labelW+plotW+56} ${height}" role="img" aria-label="学生课程总评排行">
  <line x1="${passX}" y1="6" x2="${passX}" y2="${height-12}" stroke="${LINE}" stroke-dasharray="3 3"/>
  <text x="${passX}" y="${height-1}" text-anchor="middle" class="cx-tick">60 分</text>
  ${rows}</svg></div>`;
}

// ===== 任务权重配置（环形图 + 图例）=====
export function weightRing(tasks){
 const list=(tasks||[]).filter(t=>t.status==='published');
 if(!list.length)return '<p class="muted small">尚未下发任务，权重配置为空。</p>';
 const total=list.reduce((s,t)=>s+Number(t.weight||0),0);
 const size=180,r=64,cx=size/2,cy=size/2,C=2*Math.PI*r;
 // 段与段之间留 2px 视觉缝隙，避免同色相邻时分不清边界。
 const gapPx=list.length>1?2.5:0;
 let offset=0;
 const palette=['#087f70','#102536','#4d8fa6','#c99a41','#7d6b9e','#a8bcc7','#3f7d5e','#b0714a'];
 const arcs=list.map((t,i)=>{
  const w=total>0?Number(t.weight||0)/total:0;
  const len=Math.max(0,w*C-gapPx);
  const seg=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${palette[i%palette.length]}" stroke-width="19" stroke-linecap="butt"
   stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})">
   <title>${esc(t.title)}：${t.weight}%</title></circle>`;
  offset+=w*C;
  return seg;
 }).join('');
 const complete=Math.abs(total-100)<0.001;
 return `<div class="cx-chart cx-ring-wrap">
  <svg viewBox="0 0 ${size} ${size}" class="cx-ring" role="img" aria-label="任务权重占比">
   <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f2f5f6" stroke-width="19"/>
   ${arcs}
   <text x="${cx}" y="${cy+1}" text-anchor="middle" class="cx-ring-value">${round(total)}%</text>
   <text x="${cx}" y="${cy+19}" text-anchor="middle" class="cx-ring-label">${complete?'权重已配置完整':'权重合计不足'}</text>
  </svg>
  <ul class="cx-legend-list">${list.map((t,i)=>`<li><i style="background:${palette[i%palette.length]}"></i><span>${esc(t.title)}</span>
   <b class="cx-legend-track"><em style="width:${Math.min(100,Number(t.weight||0))}%;background:${palette[i%palette.length]}"></em></b><strong>${t.weight}%</strong></li>`).join('')}</ul>
 </div>`;
}

// ===== 课程目标达成矩阵（目标 × 任务）=====
// 单元格是任务的平均达成度；未关联任务的目标不填估算值，直接留空。
export function outcomeMatrix(outcomes){
 const list=Array.isArray(outcomes)?outcomes:[];
 if(!list.length)return '<p class="muted small">本课程版本没有登记课程目标，暂不生成达成矩阵。</p>';
 const columns=[];
 list.forEach(o=>(o.tasks||[]).forEach(t=>{if(!columns.some(c=>c.id===t.taskId))columns.push({id:t.taskId,title:t.title});}));
 const tint=value=>{
  const v=Math.max(0,Math.min(100,Number(value)||0));
  const alpha=0.06+v/100*0.34;
  return `background:rgba(8,127,112,${alpha.toFixed(3)});color:${v>=70?'#fff':INK}`;
 };
 const head=`<tr><th class="matrix-goal">课程目标</th>${columns.map(c=>`<th>${esc(truncate(c.title,10))}</th>`).join('')}<th class="num">达成度</th></tr>`;
 const body=list.map(o=>`<tr><th class="matrix-goal"><span class="mono matrix-code">${esc(o.code)}</span><span class="matrix-desc">${esc(truncate(o.description,26))}</span></th>
  ${columns.map(c=>{
   const part=(o.tasks||[]).find(t=>t.taskId===c.id);
   if(!part)return '<td class="matrix-empty">—</td>';
   return `<td class="matrix-cell" style="${tint(part.normalized)}"><strong>${round(part.normalized)}</strong><small>${part.count} 人</small></td>`;
  }).join('')}
  <td class="num">${o.achieved==null?'<span class="muted">未关联</span>':`<span class="matrix-score">${round(o.achieved)}</span>`}</td></tr>`).join('');
 return `<div class="table-scroll"><table class="matrix-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>
 <div class="cx-legend"><span class="cx-legend-item cx-pill"><i style="background:rgba(8,127,112,.12)"></i>达成度低</span><span class="cx-legend-item cx-pill"><i style="background:rgba(8,127,112,.40)"></i>达成度高</span><span class="small muted">单元格数字为该任务的平均达成度（百分制）。</span></div>`;
}

// ===== 风险概览（环形 + 原因分布）=====
export function riskChart(risks,total){
 const list=Array.isArray(risks)?risks:[];
 const all=Math.max(0,Number(total)||0);
 if(!all)return '<p class="muted small">暂无学生数据。</p>';
 const risky=list.length;
 const size=150,r=52,cx=size/2,cy=size/2,C=2*Math.PI*r;
 const ratio=all?Math.min(1,risky/all):0;
 const len=ratio*C;
 const byReason={};
 list.forEach(item=>{const key=item.reason||'其他';byReason[key]=(byReason[key]||0)+1;});
 return `<div class="cx-chart cx-risk-wrap">
  <svg viewBox="0 0 ${size} ${size}" class="cx-ring" role="img" aria-label="需关注学生占比">
   <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f2f5f6" stroke-width="16"/>
   <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${risky?GOLD:'#087f70'}" stroke-width="16" stroke-linecap="round"
    stroke-dasharray="${len} ${C-len}" transform="rotate(-90 ${cx} ${cy})"/>
   <text x="${cx}" y="${cy+1}" text-anchor="middle" class="cx-ring-value">${risky}</text>
   <text x="${cx}" y="${cy+18}" text-anchor="middle" class="cx-ring-label">需关注 / ${all} 人</text>
  </svg>
  <ul class="cx-legend-list">${Object.entries(byReason).length?Object.entries(byReason).map(([reason,count])=>`<li><i style="background:${GOLD}"></i><span>${esc(reason)}</span><strong>${count} 人</strong></li>`).join(''):'<li><span class="muted small">当前没有触发预警规则的学生。</span></li>'}</ul>
 </div>`;
}

// ===== 学生端进度环（单值环形进度）=====
export function progressRing(value,{label='',max=100}={}){
 const pct=Math.max(0,Math.min(100,Number(value)||0));
 const size=140,r=54,cx=size/2,cy=size/2,C=2*Math.PI*r;
 const len=pct/100*C;
 const id=nextId();
 return `<div class="cx-chart cx-progress">
  <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label||'进度')} ${round(pct)}%">
   <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#41a99a"/><stop offset="1" stop-color="${GREEN}"/></linearGradient></defs>
   <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef2f4" stroke-width="10"/>
   <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="10" stroke-linecap="round"
    stroke-dasharray="${len} ${C-len}" transform="rotate(-90 ${cx} ${cy})"/>
   <text x="${cx}" y="${cy+2}" text-anchor="middle" class="cx-ring-value">${round(pct)}%</text>
  </svg>
  ${label?`<p class="cx-progress-label">${esc(label)}</p>`:''}
 </div>`;
}
