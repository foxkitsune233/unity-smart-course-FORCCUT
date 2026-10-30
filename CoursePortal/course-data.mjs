import {schoolCourse,flattenLessons} from './school-curriculum.mjs';
export let course=structuredClone(schoolCourse);
export let requiredLessons=flattenLessons(course,false);
export let allLessons=flattenLessons(course,true);
export function findLesson(id){return allLessons.find(lesson=>lesson.id===id)||allLessons[0];}

export const catalogStatus={available:false,preview:true,revision:null,error:null};
if(typeof window!=='undefined'){
  const selection=new URLSearchParams(window.location.search);const query=new URLSearchParams();
  for(const key of ['course','preview'])if(selection.has(key))query.set(key,selection.get(key));
  try{
    const response=await fetch('/api/catalog/current'+(query.size?'?'+query:''));
    if(response.ok){const data=await response.json();catalogStatus.available=true;catalogStatus.preview=data.preview;catalogStatus.revision=data.revision;
      const lessons=flattenLessons(data.course,true);
      if(!lessons.length)catalogStatus.error='这门课程的学习内容尚未开放，请稍后查看。';
      else{course=data.course;allLessons=lessons;requiredLessons=flattenLessons(course,false);}
    }else if(response.status===404&&!response.headers.get('content-type')?.includes('application/json')&&!selection.has('preview')&&(!selection.has('course')||selection.get('course')===course.id)){
      // Preserve the original static preview when no API is installed.
    }else{catalogStatus.available=true;catalogStatus.error=response.status===401?'登录状态已失效，请返回登录页重新登录。':response.status===403?'当前账号暂时无法访问此课程内容。':response.status>=500?'课程服务暂时不可用，请稍后重试。':'这门课程尚未发布或不存在。';}
  }catch{if(selection.has('course'))catalogStatus.error='课程服务暂时不可用，请稍后重试。';}
}
