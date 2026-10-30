import {lessonVideoResources} from './video-library.mjs';
import {textbookCourse} from './textbook-course.mjs';
export {textbookCourse};
export const curriculumId='school-unity-2026-48-3d';
const chapter=(number,title,hours,books,lessonIds,description,keypoints)=>({
 id:'school-ch'+String(number).padStart(2,'0'),number,code:'CH'+String(number).padStart(2,'0'),title,hours,textbookChapters:books,knowledgeCode:'GD'+String(number).padStart(2,'0'),description,lessonIds,keypoints,
});
const plans=[
 chapter(1,'环境配置与脚本概览',4,[1],['lesson-01'],'配置Unity2021与工程环境，认识Start/Update、Transform与输入，用3D移动小球和金币拾取实例入门。',['Unity2021环境与工程结构','MonoBehaviour与Start/Update','Transform与输入控制','3D移动小球与金币拾取']),
 chapter(2,'基本概念与脚本编程',4,[2],['lesson-02'],'通过3D射击实例理解游戏物体、组件、预制体、标签与层、生命周期以及协程。',['游戏物体、组件与父子关系','预制体、标签与层','获取物体与组件','Awake/Start/Update/FixedUpdate','协程入门']),
 chapter(3,'物理系统（3D重点）',6,[3],['lesson-03'],'以3D滚球和障碍关卡练习刚体、碰撞体、触发器、施力、射线及落地判断，在三维场景中验证物理行为。',['Rigidbody与休眠','Collider、碰撞与触发器','FixedUpdate中的力与速度','Physics.Raycast与3D射线检测','3D障碍关卡、跳跃与落地判断']),
 chapter(4,'游戏数学基础（3D应用）',2,[4],['lesson-04'],'练习三维局部与世界坐标、Vector3方向和距离、旋转API及四元数基础认知；矩阵推导作为选学延伸。',['局部坐标与世界坐标','Vector3向量运算、方向与距离','旋转与四元数基础；矩阵推导选学']),
 chapter(5,'脚本与UI系统',4,[5],['lesson-05'],'使用UGUI、事件系统和画布适配，完成游戏界面、血条与背包练习。',['UGUI常用控件','事件系统与画布适配','血条与背包实例']),
 chapter(6,'脚本与动画（3D为主）',4,[6],['lesson-06'],'组织3D角色的Animator状态切换、动画参数、事件与混合树基础；IK按需拓展。',['3D角色动画与Animator状态机','动画参数与状态转换','动画事件','混合树基础与IK拓展']),
 chapter(7,'特效与音频',4,[7,8],['lesson-07','lesson-08'],'将视觉反馈与声音反馈放在同一章，分别练习粒子、拖尾、DOTween与音频管理器。',['粒子系统与拖尾','DOTween动效','AudioSource与音效管理器']),
 chapter(8,'数据保存与加载',4,[10],['lesson-10'],'用PlayerPrefs与JSON保存最高分和关卡解锁状态，检验退出后重新加载的结果。',['PlayerPrefs与序列化','JSON读写','最高分存档与关卡解锁']),
 chapter(9,'游戏AI（3D场景）',4,[11],['lesson-11'],'通过有限状态机实现3D敌人巡逻、视觉感知与追击，结合NavMesh入门理解三维场景中的路径跟随。',['有限状态机FSM','3D巡逻与追击','视觉感知与状态转换','NavMesh导航入门']),
 chapter(10,'进阶编程技术',2,[13],['lesson-13'],'使用对象池管理敌人或子弹，结合Unity事件机制组织复用与响应。',['对象池','敌人与子弹复用','Unity事件机制']),
 chapter(11,'打包发布与期末大作业引导',6,[12],['lesson-12'],'完成WebGL或PC导出练习，以教材综合实例作技术参考，明确开放大作业规范与评价量规。',['WebGL与PC打包发布','综合实例技术拆解（参考）','开放大作业规范与Rubric','作品展示与答辩准备']),
];
const lessonTitles={
 'lesson-01':'环境配置、3D移动小球与金币拾取','lesson-02':'从3D射击实例理解组件与脚本','lesson-03':'3D物理、碰撞与射线','lesson-04':'3D坐标、向量与旋转练习','lesson-05':'游戏界面、血条与背包','lesson-06':'3D角色动画状态机','lesson-07':'粒子、拖尾与DOTween动效','lesson-08':'音频管理器与音效反馈','lesson-10':'最高分存档与关卡解锁','lesson-11':'3D敌人巡逻与追击','lesson-13':'对象池与Unity事件','lesson-12':'WebGL/PC导出与开放大作业',
};
const builtInExperiments={
 'lesson-01':{available:true,url:'/lab/?lab=lab01',title:'实验01 · 3D场景搭建与金币拾取'},
 'lesson-02':{available:true,url:'/lab/?lab=lab02',title:'实验02 · 组件、预制体与3D发射器'},
 'lesson-03':{available:true,url:'/lab/?lab=lab03',title:'实验03 · 3D滚球、碰撞触发与落地检测'},
 'lesson-04':{available:true,url:'/lab/?lab=lab04',title:'实验04 · 3D坐标、向量移动与朝向目标'},
 'lesson-05':{available:true,url:'/lab/?lab=lab05',title:'实验05 · UGUI血条、背包与事件系统'},
 'lesson-06':{available:true,url:'/lab/?lab=lab06',title:'实验06 · 3D角色Animator状态机'},
 'lesson-10':{available:true,url:'/lab/?lab=lab08',title:'实验08 · PlayerPrefs与JSON存档'},
 'lesson-12':{available:true,url:'/publish-guide.html',title:'实验11 · Unity2021打包发布与作品提交'},
};
const legacyLessons=new Map(textbookCourse.chapters.flatMap(ch=>ch.lessons.map(l=>[l.id,l])));
const makeLesson=(id,p)=>{
 const old=structuredClone(legacyLessons.get(id));
 const summary=id==='lesson-07'?'观察粒子、拖尾与DOTween形成的视觉反馈。':id==='lesson-08'?'通过音频管理器练习背景音乐与音效播放。':p.description;
 return {...old,video:{...old.video,resources:structuredClone(lessonVideoResources[id]||[])},title:lessonTitles[id]||old.title,summary,keypoints:p.keypoints,objectives:p.keypoints.filter(k=>!k.includes('选学')).slice(0,3).map(k=>'理解并练习'+k),practice:builtInExperiments[id]?structuredClone(builtInExperiments[id]):{available:false,title:lessonTitles[id]+'（实训待配置）',url:null}};
};
export const schoolCourse={...structuredClone(textbookCourse),hours:48,subtitle:'48学时 · 已具备C#基础 · 按章节实例学习，以3D为主，完成自选题材的期末作品。',outcomes:[],ideologicalNote:'',
 chapters:plans.map(p=>{const {lessonIds,keypoints,...meta}=p;return {...meta,lessons:lessonIds.map(id=>makeLesson(id,p))};}),
 curriculum:{id:curriculumId,prerequisites:'已具备C#基础；使用Unity2021编辑器。',teachingMode:'按章教学与独立实例练习，期末开放大作业；学生自选3D游戏题材。',
 assessments:[{id:'midterm',title:'期中上机测验',hours:2,scope:'前5章范围的现场调试任务。'},{id:'final-defense',title:'期末作品答辩',hours:2,scope:'开放大作业展示与答辩；评分办法及Rubric由教师配置。'}],
 optionalChapters:[{id:'optional-resources',code:'OPT01',number:1,title:'资源管理与热更新',hours:2,textbookChapters:[9],knowledgeCode:'OPT01',description:'课后选学专题，面向就业与竞赛；不计入48学时。',lessons:[{...structuredClone(legacyLessons.get('lesson-09')),video:{src:null,resourceId:null,resources:structuredClone(lessonVideoResources['lesson-09']||[])},title:'资源管理与热更新（选学）',summary:'了解资源管理与热更新的用途，作为课后就业与竞赛延伸。',practice:{available:false,title:'资源管理选学练习（待配置）',url:null}}]}]},
};
export function flattenLessons(course,includeOptional=false){
 if(!course)return [];
 const flatten=(chapters,optional)=>chapters.flatMap(ch=>ch.lessons.map(lesson=>({...lesson,chapterId:ch.id,chapterTitle:ch.title,chapterNumber:ch.number,chapterCode:ch.code,chapterHours:ch.hours,knowledgeCode:ch.knowledgeCode,optional})));
 return [...flatten(course.chapters||[],false),...(includeOptional?flatten(course.curriculum?.optionalChapters||[],true):[])];
}
export function alignSchoolCourse(existing){
 const aligned=structuredClone(schoolCourse),oldLessons=new Map(flattenLessons(existing,true).map(l=>[l.id,l]));
 aligned.title=existing.title||aligned.title;aligned.shortTitle=existing.shortTitle||aligned.shortTitle;
 aligned.outcomes=structuredClone(existing.outcomes||[]);aligned.ideologicalNote=existing.ideologicalNote||'';aligned.book=structuredClone(existing.book||aligned.book);
 for(const chapter of [...aligned.chapters,...aligned.curriculum.optionalChapters])for(const lesson of chapter.lessons){const old=oldLessons.get(lesson.id);if(!old)continue;lesson.video={...structuredClone(old.video),resources:structuredClone(old.video.resources??lesson.video.resources??[])};const legacyPractice=legacyLessons.get(lesson.id)?.practice;const unchanged=old.practice&&legacyPractice&&['available','title','url'].every(key=>old.practice[key]===legacyPractice[key]);if(old.practice&&!unchanged){lesson.practice=structuredClone(old.practice);const previousTitles={'lesson-01':'3D小球预备实验（现有）；2D吃金币练习待配置','lesson-03':'2D平台闯关、碰撞与射线（实训待配置）','lesson-04':'2D坐标系与向量练习（实训待配置）','lesson-06':'2D动画状态机（实训待配置）','lesson-11':'2D敌人巡逻与追击（实训待配置）'};if(old.practice.title===previousTitles[lesson.id])lesson.practice.title=schoolCourse.chapters.flatMap(ch=>ch.lessons).find(l=>l.id===lesson.id).practice.title;}}
 const known=new Set(flattenLessons(aligned,true).map(l=>l.id));
 const sourceChapters=[...(existing.chapters||[]),...(existing.curriculum?.optionalChapters||[])];
 for(const source of sourceChapters){const extras=source.lessons.filter(l=>!known.has(l.id));if(!extras.length)continue;const first=source.lessons.find(l=>known.has(l.id));const target=[...aligned.chapters,...aligned.curriculum.optionalChapters].find(ch=>ch.lessons.some(l=>l.id===first?.id))||aligned.chapters.at(-1);target.lessons.push(...structuredClone(extras));extras.forEach(l=>known.add(l.id));}
 return aligned;
}
