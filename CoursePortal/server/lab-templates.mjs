// 实验模板：网页可配置的检测规则与提示。
// 原则：模板只描述「学生在实验台里做到了什么」，判定基于实验态真实字段，
// 教师随后按量规评分；检测结果只是证据，不直接等于成绩。
// checks 采用声明式规则（field / op / value），由实验台在浏览器端求值，
// 不在服务端执行任何脚本，避免把配置变成可执行代码。

export const LAB_IDS=['lab01','lab02','lab03','lab04','lab05','lab06'];

export const DEFAULT_LAB_TEMPLATES={
 lab01:{
  title:'CH01 · 场景搭建与金币拾取',
  scene:{objects:['地面 Ground','角色 Player','金币 Collectible','计分器 ScoreReceiver','终点 Finish']},
  scripts:['playerMove','collectible','scoreReceiver','finish'],
  checks:[
   {key:'objects',label:'场景中至少有地面与角色两个对象',field:'scene.objects.length',op:'>=',value:2},
   {key:'score',label:'拾取金币使分数达到目标值',field:'score',op:'>=',value:5},
   {key:'completed',label:'角色进入终点并触发完成判定',field:'completed',op:'===',value:true},
  ],
  hints:['先创建地面，再拖入角色预制体。','计分器要绑定到金币的 Score Receiver 字段上，否则分数不会累加。','终点判定读取计分器的 Required Score，两处数值要一致。'],
 },
 lab02:{
  title:'CH02 · 组件与3D发射器',
  scene:{objects:['发射器 SpawnEmitter','弹丸 Projectile','目标 Target']},
  scripts:['spawnEmitter','projectileMove','lifecycleProbe','targetHitReceiver'],
  checks:[
   {key:'spawned',label:'发射器已生成弹丸',field:'spawned',op:'>=',value:1},
   {key:'hits',label:'弹丸实际命中目标',field:'hits',op:'>=',value:1},
   {key:'lifecycle',label:'生命周期探针记录到 Start 与 Update 回调',field:'lifecycleUpdate',op:'>=',value:1,optional:true},
  ],
  hints:['弹丸预制体必须先做成对象原型，再拖进发射器的 Projectile 字段。','间隔太小会导致存活数量触顶，先观察 Max Alive。'],
 },
 lab03:{
  title:'CH03 · 3D滚球、碰撞触发与落地检测',
  scene:{objects:['球体 Sphere','地面 Ground','触发区 TriggerZone']},
  scripts:['physicsMove','triggerProbe'],
  checks:[
   {key:'grounded',label:'球体落地（射线检测命中地面）',field:'grounded',op:'===',value:true},
   {key:'jumps',label:'完成至少一次有效跳跃',field:'jumps',op:'>=',value:1},
   {key:'rejected',label:'空中再次按跳跃被拒绝',field:'rejectedJumps',op:'>=',value:1},
   {key:'triggers',label:'进入触发区并触发 OnTriggerEnter',field:'triggers',op:'>=',value:1},
  ],
  hints:['射线起点取碰撞体底边，长度 0.14 左右即可判定贴地。','每次只改质量、摩擦、弹性中的一个变量，才能看出差异。'],
 },
 lab04:{
  title:'CH04 · 3D坐标、向量移动与朝向目标',
  scene:{objects:['父节点 Parent','角色 Player','目标 Target']},
  scripts:['coordinateMove','lookAtTarget'],
  checks:[
   {key:'arrived',label:'到达停止距离内并停止',field:'coordinateArrived',op:'===',value:true},
   {key:'distance',label:'剩余距离收敛到停止距离内',field:'coordinateDistance',op:'<=',value:1.2},
   {key:'local',label:'切换过局部坐标模式（观察差异）',field:'worldPosition',op:'!==',value:null,optional:true},
  ],
  hints:['先在世界坐标下走一遍，再旋转父节点切到局部坐标对比方向。','距离用 magnitude 比较，不要用三个轴的差直接相加。'],
 },
 lab05:{
  title:'CH05 · UGUI血条、交互与背包',
  scene:{objects:['Canvas','血条 Image','伤害按钮','治疗按钮','背包控制器']},
  scripts:['healthController','inventoryController'],
  checks:[
   {key:'health',label:'点击按钮改变生命值（生命事件已记录）',field:'healthChanges',op:'>=',value:1},
   {key:'inventory',label:'背包成功加入至少一件物品',field:'inventoryCount',op:'>=',value:1},
   {key:'reject',label:'背包满时拒绝入包（容量边界验证）',field:'inventoryRejected',op:'>=',value:1,optional:true},
  ],
  hints:['血条宽度按 当前生命/最大生命 比例设置，不要写死像素。','一次点击对应一次事件，检查按钮是否被重复绑定。'],
 },
 lab06:{
  title:'CH06 · 3D角色Animator状态机',
  scene:{objects:['角色模型','Animator 控制器']},
  scripts:['animatorDriver'],
  checks:[
   {key:'walk',label:'进入过 Walk 状态',field:'animationWalkSeen',op:'===',value:true},
   {key:'transitions',label:'完成 Idle/Walk/Jump 之间的状态转换',field:'animationTransitions',op:'>=',value:3},
   {key:'jump',label:'触发跳跃动画',field:'animationJumps',op:'>=',value:1},
  ],
  hints:['状态机参数用 Trigger 而不是 Bool，避免连跳卡在过渡里。','动画事件需要在时间轴上实际打点，只在代码里监听不会触发。'],
 },
};

export function defaultTemplate(labId){
 const base=DEFAULT_LAB_TEMPLATES[labId];
 if(!base)return null;
 return {labId,version:1,title:base.title,scene:base.scene,scripts:base.scripts,checks:base.checks,hints:base.hints,customized:false,updatedBy:null,updatedAt:null};
}

// 数据库覆盖值优先；缺字段回落到内置默认，保证旧模板不会因为新增字段失效。
export function mergeTemplate(labId,row){
 const base=defaultTemplate(labId);
 if(!base)return null;
 if(!row)return base;
 const parse=(text,fallback)=>{try{const v=JSON.parse(text);return v??fallback;}catch{return fallback;}};
 const checks=parse(row.checks_json,[]);
 return {
  labId,version:Number(row.version)||1,
  title:row.title||base.title,
  scene:parse(row.scene_json,base.scene),
  scripts:parse(row.scripts_json,base.scripts),
  checks:Array.isArray(checks)&&checks.length?checks:base.checks,
  hints:parse(row.hints_json,base.hints),
  customized:true,updatedBy:row.updated_by,updatedAt:row.updated_at,
 };
}

const OPS=['>=','<=','>','<','===','!=='];

export function validateLabTemplate(labId,input){
 const errors=[];
 if(!LAB_IDS.includes(labId))errors.push('实验标识无效');
 if(!input||typeof input!=='object')errors.push('模板数据无效');
 const version=Number(input?.version);
 if(!Number.isInteger(version)||version<1||version>9999)errors.push('模板版本须为 1—9999 的整数');
 if(typeof input?.title==='string'&&input.title.length>120)errors.push('模板标题过长');
 const checks=Array.isArray(input?.checks)?input.checks:[];
 if(checks.length>30)errors.push('检测规则最多 30 条');
 const cleanChecks=[];
 for(const raw of checks){
  const key=typeof raw?.key==='string'?raw.key.trim():'';
  const field=typeof raw?.field==='string'?raw.field.trim():'';
  const op=typeof raw?.op==='string'?raw.op.trim():'';
  if(!/^[a-zA-Z0-9_-]{1,40}$/.test(key)){errors.push('检测规则标识无效');continue;}
  if(!/^[a-zA-Z0-9_.]{1,80}$/.test(field)){errors.push('检测字段无效：'+field);continue;}
  if(!OPS.includes(op)){errors.push('比较方式无效：'+op);continue;}
  cleanChecks.push({key,label:typeof raw.label==='string'?raw.label.slice(0,120):key,field,op,value:raw.value??null,optional:raw.optional===true});
 }
 const hints=(Array.isArray(input?.hints)?input.hints:[]).filter(h=>typeof h==='string'&&h.trim()).slice(0,10).map(h=>h.trim().slice(0,300));
 return {value:{version,title:typeof input?.title==='string'?input.title.trim():'',scene:input?.scene&&typeof input.scene==='object'?input.scene:{},scripts:Array.isArray(input?.scripts)?input.scripts.filter(s=>typeof s==='string').slice(0,40):[],checks:cleanChecks,hints},errors};
}

// 规则求值：给前端与测试共用的纯函数，实验台只上报结果，服务端不再重算。
export function evaluateChecks(checks,state){
 const read=(path)=>path.split('.').reduce((value,key)=>value==null?undefined:value[key],state);
 const results=(Array.isArray(checks)?checks:[]).map(rule=>{
  const actual=read(rule.field);
  const expected=rule.value;
  let ok=false;
  switch(rule.op){
   case '>=':ok=Number(actual)>=Number(expected);break;
   case '<=':ok=Number(actual)<=Number(expected);break;
   case '>':ok=Number(actual)>Number(expected);break;
   case '<':ok=Number(actual)<Number(expected);break;
   case '===':ok=actual===expected;break;
   case '!==':ok=actual!==expected;break;
   default:ok=false;
  }
  return {key:rule.key,label:rule.label,field:rule.field,op:rule.op,expected,actual:actual??null,ok,optional:!!rule.optional};
 });
 const required=results.filter(item=>!item.optional);
 return {passed:required.length>0&&required.every(item=>item.ok),checks:results,passedCount:results.filter(item=>item.ok).length,total:results.length};
}
