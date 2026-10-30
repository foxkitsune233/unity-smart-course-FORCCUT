import {lessonVideoResources} from '../video-library.mjs';
import {schoolCourse} from '../school-curriculum.mjs';
import {validateCourse} from './validation.mjs';
export function applyCourseVideos(store,{merge=false}={}){
 const row=store.q('SELECT * FROM courses WHERE id=?',schoolCourse.id);if(!row)throw new Error('未找到Unity课程');
 const course=store.getDraft(row);let attached=0,lessons=0;
 for(const lesson of [...course.chapters,...(course.curriculum?.optionalChapters||[])].flatMap(ch=>ch.lessons)){const resources=lessonVideoResources[lesson.id];if(!resources?.length)continue;const current=lesson.video?.resources||[];if(current.length&&!merge)continue;const ids=new Set(current.map(r=>r.id));const additions=resources.filter(r=>!ids.has(r.id));if(!additions.length)continue;lesson.video={...lesson.video,resources:[...current,...structuredClone(additions)]};attached+=additions.length;lessons++;}
 if(!attached)return {changed:false,revision:row.revision,publishedRevision:row.published_revision};
 const next=validateCourse(course,row.id),revision=row.revision+1;
 store.transaction(()=>{const result=store.run('UPDATE courses SET draft_json=?,revision=?,updated_at=? WHERE id=? AND revision=?',JSON.stringify(next),revision,new Date().toISOString(),row.id,row.revision);if(result.changes!==1)throw new Error('课程在视频导入期间发生变化，请重新导入');store.putOutcomes(next,revision);store.audit({username:'system:video-library'},'course.videos.attached',row.id+':'+revision);});
 return {changed:true,revision,publishedRevision:row.published_revision,lessons,attached};
}
