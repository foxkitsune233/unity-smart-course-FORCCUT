const nonnegative=value=>Number.isFinite(value)?Math.max(0,Math.min(value,86400)):0;
const validUrl=value=>{try{return ['http:','https:'].includes(new URL(value).protocol);}catch{return false;}};
export function createState(courseId){return {version:1,courseId,lastLessonId:null,lessons:{}};}export function lessonRecord(state,id){return (Object.hasOwn(state.lessons,id)&&state.lessons[id])||{position:0,duration:0,completed:false,notes:[],videoUrl:null};}
function update(state,id,patch){return {...state,lessons:{...state.lessons,[id]:{...lessonRecord(state,id),...patch}}};}
export function parseState(raw,courseId,lessonIds){
    const clean=createState(courseId);
    try{
        if(!raw||raw.length>8_000_000)return clean;
        const saved=JSON.parse(raw);if(saved.version!==1||saved.courseId!==courseId||!saved.lessons||typeof saved.lessons!=='object')return clean;
        clean.lastLessonId=lessonIds.includes(saved.lastLessonId)?saved.lastLessonId:null;
        // 保留来源标记：记录可能由旧的无账号维度存储迁移而来，需可追溯。
        if(typeof saved.migratedFrom==='string'&&saved.migratedFrom.length<=100)clean.migratedFrom=saved.migratedFrom;
        if(typeof saved.migratedAt==='string'&&!Number.isNaN(Date.parse(saved.migratedAt)))clean.migratedAt=saved.migratedAt;
        if(typeof saved.updatedAt==='string'&&!Number.isNaN(Date.parse(saved.updatedAt)))clean.updatedAt=saved.updatedAt;
    // Keep sanitized records for removed lessons so later publications cannot erase notes.
    for(const id of Object.keys(saved.lessons).filter(id=>/^[a-zA-Z0-9_-]{1,100}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id)).slice(0,1000)){
      const record=saved.lessons[id];if(!record||typeof record!=='object')continue;
      const duration=nonnegative(record.duration);
      const notes=(Array.isArray(record.notes)?record.notes:[]).filter(note=>note&&typeof note.text==='string'&&note.text.trim()).slice(-100).map((note,index)=>({id:typeof note.id==='string'?note.id.slice(0,100):'restored-'+index,text:note.text.trim().slice(0,2000),time:nonnegative(note.time),...(validResourceId(note.resourceId)?{resourceId:note.resourceId}:{}),createdAt:typeof note.createdAt==='string'?note.createdAt:''}));
      clean.lessons[id]={position:Math.min(nonnegative(record.position),duration),duration,completed:record.completed===true,notes,videoUrl:validUrl(record.videoUrl)?record.videoUrl:null,...(record.resourcePlayback?{resourcePlayback:cleanResourcePlayback(record.resourcePlayback)}:{})};
    }
  }catch{return createState(courseId);}
  return clean;
}
export function recordPlayback(state,id,position,duration){
  const safeDuration=nonnegative(duration);
  return {...update(state,id,{position:Math.min(nonnegative(position),safeDuration),duration:safeDuration}),lastLessonId:id};
}
export function markCompleted(state,id,completed){return update(state,id,{completed:completed===true});}
export function addNote(state,id,text,time,resourceId){
  if(typeof text!=='string'||!text.trim())return state;
  const note={id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),text:text.trim().slice(0,2000),time:nonnegative(time),...(validResourceId(resourceId)?{resourceId}:{}),createdAt:new Date().toISOString()};
  return update(state,id,{notes:[...lessonRecord(state,id).notes,note].slice(-100)});
}
export function removeNote(state,id,noteId){return update(state,id,{notes:lessonRecord(state,id).notes.filter(note=>note.id!==noteId)});}
export function setVideoUrl(state,id,url){
  const value=typeof url==='string'?url.trim():'';
  if(value&&!validUrl(value))throw new Error('请填写有效的 HTTP 或 HTTPS 视频地址。');
  return update(state,id,{videoUrl:value||null,position:0,duration:0,completed:false});
}
export function summarize(state,lessonIds){
  const completed=lessonIds.filter(id=>lessonRecord(state,id).completed).length;
  return {completed,total:lessonIds.length,percent:lessonIds.length?Math.round(completed/lessonIds.length*100):0,notes:lessonIds.reduce((sum,id)=>sum+lessonRecord(state,id).notes.length,0)};
}

const validResourceId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id)&&!['__proto__','constructor','prototype'].includes(id);
function cleanResourcePlayback(value){const result={};if(!value||typeof value!=='object')return result;for(const [id,r]of Object.entries(value).slice(0,100)){if(!validResourceId(id)||!r||typeof r!=='object')continue;const duration=nonnegative(r.duration);result[id]={position:Math.min(nonnegative(r.position),duration),duration,completed:r.completed===true};}return result;}
export function resourceRecord(state,lessonId,resourceId){const records=lessonRecord(state,lessonId).resourcePlayback;return records&&Object.hasOwn(records,resourceId)?records[resourceId]:{position:0,duration:0,completed:false};}
export function recordResourcePlayback(state,lessonId,resourceId,position,duration){if(!validResourceId(resourceId))return state;const safe=nonnegative(duration);return {...update(state,lessonId,{resourcePlayback:{...lessonRecord(state,lessonId).resourcePlayback,[resourceId]:{...resourceRecord(state,lessonId,resourceId),position:Math.min(nonnegative(position),safe),duration:safe}}}),lastLessonId:lessonId};}
export function markResourceCompleted(state,lessonId,resourceId,requiredIds){if(!validResourceId(resourceId))return state;let next=update(state,lessonId,{resourcePlayback:{...lessonRecord(state,lessonId).resourcePlayback,[resourceId]:{...resourceRecord(state,lessonId,resourceId),completed:true}}});if(requiredIds.length&&requiredIds.every(id=>resourceRecord(next,lessonId,id).completed))next=markCompleted(next,lessonId,true);return next;}
