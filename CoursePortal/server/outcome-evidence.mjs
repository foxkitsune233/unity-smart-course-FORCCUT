import {requireThat} from './validation.mjs';
export function createOutcomeEvidence({q,all,run}){
 run('CREATE TABLE IF NOT EXISTS outcome_matrices(class_id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL,actor_id TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(class_id,version))');
 const algorithm='rubric-point-weighted-v1';
 function read(classId){const r=q('SELECT * FROM outcome_matrices WHERE class_id=? ORDER BY version DESC LIMIT 1',classId);return {version:r?.version||0,algorithm,minSamples:r?JSON.parse(r.payload).minSamples:1,links:r?JSON.parse(r.payload).links:[]};}
 function write(cls,outcomes,user,b){const before=read(cls.id);requireThat(b.expectedVersion===before.version,409,'MATRIX_CONFLICT','矩阵已更新，请刷新');requireThat(Number.isInteger(b.minSamples)&&b.minSamples>=1&&b.minSamples<=1000&&Array.isArray(b.links)&&b.links.length<=500,422,'INVALID_MATRIX','矩阵配置无效');const seen=new Set();
  for(const l of b.links){const task=q('SELECT * FROM tasks WHERE id=? AND class_id=?',l.taskId,cls.id);const rubric=task?JSON.parse(task.rubric_json):[];const key=[l.outcomeId,l.taskId,l.rubricId].join(':');requireThat(outcomes.some(o=>o.id===l.outcomeId)&&rubric.some(d=>d.id===l.rubricId)&&Number.isFinite(l.weight)&&l.weight>0&&l.weight<=100&&!seen.has(key),422,'INVALID_MATRIX','目标、任务评分点或贡献无效');seen.add(key);}
  run('INSERT INTO outcome_matrices VALUES(?,?,?,?,?)',cls.id,before.version+1,JSON.stringify({minSamples:b.minSamples,links:b.links}),user.id,new Date().toISOString());return read(cls.id);
 }
 function calculate(classId,outcomes,url){const matrix=read(classId),from=url.searchParams.get('from')||null,to=url.searchParams.get('to')||null;
  requireThat((!from||!Number.isNaN(Date.parse(from)))&&(!to||!Number.isNaN(Date.parse(to)))&&(!from||!to||Date.parse(from)<=Date.parse(to)),422,'INVALID_RANGE','日期范围无效');const upper=to&&to.length===10?Date.parse(to)+86400000-1:to?Date.parse(to):Infinity;
  const inRange=at=>(!from||Date.parse(at)>=Date.parse(from))&&Date.parse(at)<=upper;
  const tasks=all("SELECT * FROM tasks WHERE class_id=? AND status='published'",classId);
  const submissions=all("SELECT s.* FROM submissions s JOIN tasks t ON t.id=s.task_id WHERE t.class_id=? AND t.status='published' AND s.status<>'draft' ORDER BY s.attempt DESC",classId).filter(s=>inRange(s.submitted_at));
  const latest=new Map();for(const s of submissions){const key=s.task_id+':'+s.student_id;if(!latest.has(key))latest.set(key,s);}const graded=[...latest.values()].filter(s=>s.status==='graded'&&s.released===1);
  const evidence=[];
  const rows=outcomes.map(o=>{const related=matrix.links.filter(l=>l.outcomeId===o.id);let numerator=0,denominator=0;const students=new Set();const parts=[];
   for(const l of related){const t=tasks.find(t=>t.id===l.taskId);if(!t)continue;const dim=JSON.parse(t.rubric_json).find(d=>d.id===l.rubricId);if(!dim)continue;const points=[];for(const s of graded.filter(s=>s.task_id===t.id)){let values;try{values=JSON.parse(s.rubric_scores_json||'[]');}catch{continue;}const score=values.find(v=>v.id===l.rubricId);if(!score||!Number.isFinite(score.score)||dim.maxScore<=0)continue;const normalized=score.score/dim.maxScore*100;points.push(normalized);students.add(s.student_id);evidence.push({outcomeId:o.id,taskId:t.id,taskTitle:t.title,courseRevision:t.course_revision,submissionId:s.id,studentId:s.student_id,attempt:s.attempt,rubricId:dim.id,rubricTitle:dim.title,score:score.score,maxScore:dim.maxScore,weight:l.weight,submittedAt:s.submitted_at});}if(points.length){const avg=points.reduce((a,b)=>a+b,0)/points.length;numerator+=avg*l.weight;denominator+=l.weight;parts.push({taskId:t.id,title:t.title,weight:l.weight,normalized:avg,count:points.length,rubricId:dim.id});}}
   const sufficient=students.size>=matrix.minSamples;return {...o,linked:related.length>0,achieved:denominator&&sufficient?Math.round(numerator/denominator*100)/100:null,tasks:parts,sampleCount:students.size,evidenceStatus:!related.length?'未关联评分点':!denominator?'未评分或没有有效证据':!sufficient?'证据不足':'有效'};});
  return {matrix,algorithm,range:{from,to},outcomes:rows,submissionEvidence:evidence,submissions,graded,tasks,inRange};
 }
 return {read,write,calculate};
}
