// 教学流程页共用组件：量规编辑器、权重条、日期转换、成绩导出。
// 权重分两层，这里只负责展示与采集，不做合计判定（判定由服务端 grading.mjs 负责）。
import {escapeHTML as e} from './api-client.mjs';

export const taskTypes={lab:'实验实训',work:'实践作业',quiz:'在线测验',report:'实验报告'};
export const interventionKinds={remind:'提醒',tutor:'辅导',reassign:'调整任务',closed:'结案'};

// 表单里的 datetime-local 值与 ISO 字符串互转，避免手写时区偏移。
export function toLocalInput(iso){
 if(!iso)return '';
 const date=new Date(iso);
 if(Number.isNaN(date.getTime()))return '';
 const pad=n=>String(n).padStart(2,'0');
 return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function toISO(local){
 if(!local)return null;
 const date=new Date(local);
 return Number.isNaN(date.getTime())?null:date.toISOString();
}

// 量规编辑器：同一任务内维度权重合计必须为 100%，维度满分之和须等于任务满分。
export function rubricRows(rubric=[]){
 const rows=rubric.length?rubric:[{id:'d1',title:'',maxScore:50,weight:50},{id:'d2',title:'',maxScore:50,weight:50}];
 return rows.map((row,index)=>`<tr class="rubric-row" data-index="${index}">
  <td><input class="form-input rubric-title" type="text" maxlength="100" placeholder="维度名称，如「场景搭建」" value="${e(row.title||'')}"></td>
  <td style="width:104px"><input class="form-input rubric-max" type="number" min="0.5" step="0.5" value="${e(row.maxScore)}" aria-label="维度满分"></td>
  <td style="width:104px"><input class="form-input rubric-weight" type="number" min="0" max="100" step="1" value="${e(row.weight)}" aria-label="维度权重"></td>
  <td style="width:92px"><button type="button" class="text-button danger" data-action="remove-rubric">删除</button></td>
 </tr>`).join('');
}

export function rubricTable(rubric=[]){
 return `<div class="table-scroll"><table class="data-table rubric-table"><thead><tr><th>评分维度</th><th>维度满分</th><th>维度权重 %</th><th></th></tr></thead><tbody id="rubric-rows">${rubricRows(rubric)}</tbody></table></div>
 <p class="small muted rubric-hint">同一任务内维度权重合计须为 100%；维度满分之和须等于任务满分。服务端会再次校验。</p>`;
}

// 从表单读取量规。返回 {rubric, errors}，不合法时保留原值交给用户修正。
export function readRubric(scope){
 const rows=[...scope.querySelectorAll('.rubric-row')];
 const rubric=[];const errors=[];
 rows.forEach((row,index)=>{
  const title=row.querySelector('.rubric-title').value.trim();
  const maxScore=Number(row.querySelector('.rubric-max').value);
  const weight=Number(row.querySelector('.rubric-weight').value);
  if(!title&&!row.querySelector('.rubric-max').value&&!row.querySelector('.rubric-weight').value)return;
  if(!title){errors.push(`第 ${index+1} 个维度缺少名称`);return;}
  if(!Number.isFinite(maxScore)||maxScore<=0){errors.push(`「${title}」的满分须为大于 0 的数值`);return;}
  if(!Number.isFinite(weight)||weight<0||weight>100){errors.push(`「${title}」的权重须在 0—100 之间`);return;}
  rubric.push({id:`d${index+1}`,title,maxScore,weight});
 });
 if(!rubric.length)errors.push('至少填写一个评分维度');
 return {rubric,errors};
}

// 权重条：第二层权重合计，用于提醒教师"占比未配置完整"，不自动补齐。
export function weightBar(total,{complete}={}){
 const value=Number(total)||0;
 const width=Math.min(100,Math.max(0,value));
 const state=complete===undefined?(Math.abs(value-100)<0.001?'ok':'warn'):(complete?'ok':'warn');
 return `<div class="weight-bar weight-${state}"><div class="weight-bar-track"><span style="width:${width}%"></span></div><div class="weight-bar-text">总评占比合计 <strong>${value}%</strong>${state==='ok'?'':' · 尚未配置完整，课程总评按已配置部分折算并标注'}</div></div>`;
}

export function taskStatusTag(task){
 if(task.status==='published')return `<span class="tag green">已发布</span>`;
 if(task.status==='withdrawn')return `<span class="tag warn-tag">已撤回</span>`;
 return `<span class="tag draft-tag">草稿</span>`;
}

export const appealStatusText={open:'待处理',revised:'已改分',upheld:'维持原判'};

// 复核状态标签：学生端与教师端共用，避免两处文案说法不一致。
export function appealTag(status){
 const text=appealStatusText[status]||status||'—';
 const cls=status==='open'?'draft-tag':status==='revised'?'green':'';
 return `<span class="tag ${cls}">${e(text)}</span>`;
}

// 成绩复核导出：与成绩 CSV 分开，便于单独留档。
export async function downloadReport(classId,filename='report.html'){
 const response=await fetch(`/api/teaching/classes/${encodeURIComponent(classId)}/report/export`,{credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw new Error(`导出失败（${response.status}）`);
 const blob=await response.blob();
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');
 link.href=url;link.download=filename;
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
}

export function submissionStatusTag(status,released=false){
 if(status==='graded')return released?`<span class="tag green">已发布成绩</span>`:`<span class="tag draft-tag">已批阅 · 未发布</span>`;
 if(status==='submitted')return `<span class="tag">待批阅</span>`;
 return `<span class="tag draft-tag">${e(status)}</span>`;
}

// 成绩导出走独立 fetch：接口返回 CSV 而不是 JSON，通用 request 会解析失败。
export async function downloadGrades(classId,filename='grades.csv'){
 const response=await fetch(`/api/teaching/classes/${encodeURIComponent(classId)}/export/grades`,{credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw new Error(`导出失败（${response.status}）`);
 const blob=await response.blob();
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');
 link.href=url;link.download=filename;
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
}
