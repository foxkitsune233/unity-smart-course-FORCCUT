import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync('D:/unity/.course-portal-data/portal.sqlite',{readOnly:true});
const rows=db.prepare('SELECT course_id,revision,COUNT(*) AS n FROM course_outcomes GROUP BY course_id,revision').all();
const courses=db.prepare('SELECT id,revision,published_revision FROM courses').all();
const drafts=courses.map(c=>{
 try{const d=JSON.parse(db.prepare('SELECT draft_json FROM courses WHERE id=?').get(c.id).draft_json);return {id:c.id,title:d.title,outcomes:(d.outcomes||[]).length,chapters:(d.chapters||[]).length};}catch{return {id:c.id,error:true};}
});
const classes=db.prepare('SELECT id,name,course_id,published_revision FROM classes').all();
const taskOutcomes=db.prepare('SELECT COUNT(*) AS n FROM task_outcomes').get();
const tasks=db.prepare('SELECT id,title,class_id,status FROM tasks').all();
console.log(JSON.stringify({rows,courses,drafts,classes,taskOutcomes,tasks},null,1));
