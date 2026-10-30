import {schoolCourse,alignSchoolCourse,curriculumId} from '../school-curriculum.mjs';
import {validateCourse} from './validation.mjs';
export function applySchoolAlignment(store){
 const row=store.q('SELECT * FROM courses WHERE id=?',schoolCourse.id);if(!row)throw new Error('未找到Unity课程');
 const previous=store.getDraft(row);
 if(previous.curriculum?.id===curriculumId)return {changed:false,revision:row.revision,publishedRevision:row.published_revision};
 const aligned=validateCourse(alignSchoolCourse(previous),row.id),revision=row.revision+1;
 store.transaction(()=>{
  const result=store.run('UPDATE courses SET draft_json=?,revision=?,updated_at=? WHERE id=? AND revision=?',JSON.stringify(aligned),revision,new Date().toISOString(),row.id,row.revision);
  if(result.changes!==1)throw new Error('课程在迁移过程中已发生变化');
  store.putOutcomes(aligned,revision);store.audit({username:'system:school-alignment'},'course.curriculum.aligned',row.id+':'+revision);
 });
 return {changed:true,revision,publishedRevision:row.published_revision,hours:aligned.hours,chapters:aligned.chapters.length};
}
