// 任务 → 实验台的入口地址。
// 设计要点：只带 labId 时实验台永远落在默认实验，四个章节的任务会打开同一个场景；
// 因此这里把 lab、task、class 一并写进查询串，实验台按 lab 打开对应模板，
// 任务与班级上下文保留给后续"从实验台一键提交到该任务"使用。
const LAB_PATTERN=/^lab0[1-9][0-9]?$/;

export function labEntryUrl(task){
 if(!task||typeof task.labId!=='string'||!LAB_PATTERN.test(task.labId))return null;
 const query=new URLSearchParams({lab:task.labId});
 if(task.id)query.set('task',task.id);
 if(task.classId)query.set('class',task.classId);
 return '/lab/?'+query.toString();
}
