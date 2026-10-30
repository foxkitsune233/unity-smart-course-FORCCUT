(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const requestedLab=new URLSearchParams(location.search).get('lab');
  const labId=['lab01','lab02','lab03','lab04','lab05','lab06','lab07','lab08'].includes(requestedLab)?requestedLab:'lab01';
  let storageKey='', identityReady=false;
  $('lab-select').value=labId;$('lab-select').onchange=()=>location.assign('?lab='+$('lab-select').value);
  const legacyInfo=labId==='lab01'?['CH01 · 场景搭建与金币拾取','WASD / 方向键移动角色，拾取金币，达到目标分数后进入终点。','任务：搭建地面、角色、金币、计分器与终点，绑定计分器引用。']:['CH02 · 组件与3D发射器','配置弹丸预制体与发射器，观察命中、存活数量与生命周期。','任务：绑定弹丸引用，调整间隔、速度、存活时间；观察 Start / Update / FixedUpdate。'];
  const courseInfo={
    lab03:['CH03 · 3D滚球、碰撞触发与落地检测','WASD / 方向键移动，空格跳跃。对比真实碰撞、触发与落地射线。','任务：搭建球体、地面与触发区；每次只改变质量、摩擦或弹性中的一个变量，验证空中不能连续跳跃。'],
    lab04:['CH04 · 3D坐标、向量移动与朝向目标','旋转父节点，对比局部 / 世界坐标下的运动方向、距离和朝向。','任务：绑定父节点和目标，选择坐标模式，观察世界与局部位置；到达停止距离后应停止。'],
    lab05:['CH05 · UGUI血条、交互与背包','运行后直接点击 Unity 场景中的 UGUI 按钮，观察血条与有限背包。','任务：挂载生命与背包脚本，配置容量和布局；验证一次点击一次事件、生命值边界以及背包已满反馈。'],
    lab08:['CH08 · PlayerPrefs 与 JSON 存档','运行后加分、保存、再次加分、读取并比较 JSON。','任务：绑定状态对象，设置独立存档槽与合法 JSON；验证停止重开后可手动读取已保存分数，清除后读取提示无存档。'],
    lab07:['CH07 · 粒子、拖尾与音效反馈','运行后观察反馈源移动、粒子爆发、拖尾和音效。','任务：引用挂有效果源脚本的对象；调整发射间隔、粒子数量、拖尾时长和音量，观察至少三次真实反馈。'],
    lab06:['CH06 · 3D角色Animator状态机','运行后用 WASD 和空格驱动真实 Animator 的 Idle、Walk、Jump 状态。','任务：挂载 Animator 控制器，调整移动与动画速度；完成三种状态切换并观察动画事件。']
  };
  const info=courseInfo[labId]||legacyInfo;
  document.title='Unity 实验室 · '+info[0];document.querySelector('.brand small').textContent=info[0];$('task-title').textContent=info[0];$('task-description').textContent=info[1];$('task-goals').textContent=info[2];
  document.querySelectorAll('[data-template]').forEach(b=>b.onclick=()=>command('experiment',{id:labId,kind:b.dataset.template}));
  fetch('/api/session',{credentials:'same-origin',cache:'no-store'}).then(r=>{if(!r.ok)throw Error('session');return r.json();}).then(session=>{
    if(!session.user){location.assign('/login.html?next='+encodeURIComponent(location.pathname+location.search));return;}
    storageKey='UnityCourseLab.Scene.v2.'+encodeURIComponent(session.user.id||session.user.username)+'.'+labId+'.1';
    window.unityLabStorageKey=storageKey;identityReady=true;$('account-name').textContent=session.user.name||session.user.username;initialize();
  }).catch(()=>failure('无法确认登录账号，请从课程平台重新进入实验。'));

  const history = [];
  const milestones = {play:false,stop:false,saved:false,restored:false};
  const dirtyPositionAxes = new Set();
  let instance = null, engineReady = false, initialized = false, state = null;
  const behaviorText = {
    none:['静止','对象保持在起始位置，不添加 Rigidbody 运动组件。','// 未挂载运动行为。\n// 小球保持在设置的位置。'],
    drop:['重力下落','添加 Rigidbody，开启重力。观察小球下落并与地面接触。','var body = gameObject\n    .AddComponent<Rigidbody>();\nbody.mass = 1;\nbody.useGravity = true;\nbody.collisionDetectionMode =\n    CollisionDetectionMode\n    .ContinuousDynamic;'],
    launch:['水平抛出','在重力作用下，以固定的初始水平速度运动。','var body = gameObject\n    .AddComponent<Rigidbody>();\nbody.mass = 1;\nbody.useGravity = true;\nbody.collisionDetectionMode =\n    CollisionDetectionMode\n    .ContinuousDynamic;\nbody.velocity =\n    new Vector3(2, 0, 0);'],
    platform:['平台往复移动','地板沿世界X轴往复移动，使用运动学刚体。可叠加自转。','// Begin：记录起点，添加刚体\nbody.isKinematic = true;\nbody.useGravity = false;\n\n// FixedUpdate\nbody.MovePosition(origin +\n    Vector3.right *\n    Mathf.Sin(Time.fixedTime\n        - startTime) * 1.5f);'],
    spin:['自转','在物理更新中绕世界Y轴每秒旋转45度，可与运动脚本组合。','// FixedUpdate\nvar delta = Quaternion.AngleAxis(\n    45f * Time.fixedDeltaTime,\n    Vector3.up);\nif (body != null)\n    body.MoveRotation(\n        delta * body.rotation);\nelse\n    transform.rotation =\n        delta * transform.rotation;']
  };
  Object.assign(behaviorText,{"playerMove":["角色移动","固定时间步读取输入并移动刚体。","var delta = new Vector3(Input.GetAxisRaw(\"Horizontal\"), 0, Input.GetAxisRaw(\"Vertical\")).normalized * Definition.settings.speed * Time.fixedDeltaTime;\nvar p = body.position + delta;\nbody.MovePosition(p);"],"collectible":["金币拾取","触发角色后，向引用的计分器报告拾取。","collected = true;\nOwner.Collect(Definition.settings.scoreTarget);\ngameObject.SetActive(false);"],"scoreReceiver":["计分接收器","LabRuntime.Collect 保存此对象收到的分数。","int value;\nscores.TryGetValue(id, out value);\nscores[id] = value + 1;\nScore++;"],"finish":["终点判定","进入终点时检查引用计分器的目标分数。","if (Definition.scripts.Contains(\"finish\"))\n    Owner.TryFinish(Definition.settings.scoreTarget);\n// TryFinish:\nif (value >= session.Find(id).settings.requiredScore)\n    Completed = true;"],"spawnEmitter":["发射器","定时从引用的场景弹丸原型实例化弹丸。","timer -= Time.deltaTime;\nif (timer <= 0) {\n    timer = Definition.settings.interval;\n    Owner.SpawnProjectile(this);\n}"],"projectileMove":["弹丸运动","发射时设置刚体速度；Update 到达寿命后销毁实例。","rb.velocity = (objects[actor.Target].transform.position - go.transform.position).normalized * def.settings.speed;\n// ExperimentActor.Update:\nif (Spawned && age >= Definition.settings.lifetime) {\n    Owner.RemoveProjectile(this);\n    return;\n}"],"lifecycleProbe":["生命周期探针","分别累计 Start、Update 与 FixedUpdate 回调。","// Start\nOwner.LifecycleStart++;\n// Update\nOwner.LifecycleUpdate++;\n// FixedUpdate\nOwner.LifecycleFixed++;"],"targetHitReceiver":["命中接收","弹丸实际碰撞到引用目标后记录命中。","if (a != null && a.Definition.id == Target &&\n    a.Definition.scripts.Contains(\"targetHitReceiver\")) {\n    Owner.Hit();\n    Owner.RemoveProjectile(this);\n}"]});
  Object.assign(behaviorText,{
    physicsMove:['物理移动与跳跃','Rigidbody 质量与 PhysicMaterial 摩擦 / 弹性；Physics.Raycast 判定落地，只允许落地跳跃。',`// AdvancedActor.Begin / FixedUpdate（实际关键代码）
body.mass = c.mass;
material = new PhysicMaterial("Student physics") {
    dynamicFriction = c.friction, staticFriction = c.friction,
    bounciness = c.bounce,
    frictionCombine = PhysicMaterialCombine.Average,
    bounceCombine = PhysicMaterialCombine.Maximum
};
shape.sharedMaterial = material;
var bounds = shape.bounds;
var origin = new Vector3(bounds.center.x, bounds.min.y + .04f, bounds.center.z);
RaycastHit hit;
bool grounded = Physics.Raycast(origin, Vector3.down, out hit,
    .14f, ~0, QueryTriggerInteraction.Ignore) && hit.collider != shape && body.velocity.y <= .1f;
// Update 在 Space 按下时设置 jumpRequested
if (jumpRequested) {
    jumpRequested = false;
    if (grounded) {
        body.AddForce(Vector3.up * c.jumpForce, ForceMode.Impulse);
        Owner.Jumps++; Owner.Grounded = false;
    } else Owner.RejectedJumps++;
}`],
    triggerProbe:['触发探针','Collider 切换为 Trigger；真实 OnTriggerEnter 回调检查进入对象的物理脚本。',`// AdvancedActor.Begin
shape.isTrigger = true;
// OnTriggerEnter(Collider c)
if (!Owner.Running || !Definition.scripts.Contains("triggerProbe")) return;
var actor = c.GetComponent<AdvancedActor>();
if (actor != null && actor.Definition.scripts.Contains("physicsMove"))
    Owner.Triggers++;`],
    coordinateMove:['坐标与向量移动','键盘按局部 / 世界方向运动；无输入时以限制步长接近目标，在停止距离内停止。',`// AdvancedActor.StepCoordinates
var target = Owner.ObjectFor(c.target);
var difference = target.transform.position - transform.position;
var distance = difference.magnitude;
if (distance > c.stopDistance + .001f) {
    var input = new Vector3(Input.GetAxisRaw("Horizontal"), 0,
        Input.GetAxisRaw("Vertical"));
    if (input.sqrMagnitude > .01f) {
        var direction = c.space == "local" && transform.parent != null
            ? transform.parent.TransformDirection(input.normalized) : input.normalized;
        transform.position += direction * c.speed * Time.deltaTime;
    } else transform.position += difference.normalized *
        Mathf.Min(c.speed * Time.deltaTime, distance - c.stopDistance);
} else { Owner.CoordinateArrived = true; Owner.Completed = true; }`],
    lookAtTarget:['朝向目标','使用 Transform.LookAt，让对象朝向引用目标，忽略零距离朝向。',`// AdvancedActor.Update
var t = Owner.ObjectFor(c.target);
if ((t.transform.position - transform.position).sqrMagnitude > .00001f)
    transform.LookAt(t.transform.position);`],
    healthController:['生命控制器','真实 Unity UGUI Image 显示当前生命比例；伤害 / 治疗按钮只调用白名单事件。',`// LabCanvas.Button
var button = r.gameObject.AddComponent<Button>();
button.onClick.AddListener(() => {
    owner.ApplyUIAction(id, action);
    Refresh();
});
// LabCanvas.Refresh
int value = owner.HealthFor(health.id);
fill.rectTransform.SetSizeWithCurrentAnchors(
    RectTransform.Axis.Horizontal, 280f * value / health.settings.maxHealth);
healthText.text = "Health " + value + " / " + health.settings.maxHealth;`],
    inventoryController:['背包控制器','Unity UGUI 按钮提交增减事件，显示真实背包数量和容量拒绝反馈。',`// LabCanvas.Initialize
Button("Add item", new Vector2(-75, -188), "addItem", inventory.id);
Button("Remove", new Vector2(75, -188), "removeItem", inventory.id);
// LabCanvas.Refresh
inventoryText.text = "Inventory " + owner.InventoryFor(inventory.id)
    + " / " + inventory.settings.capacity;
feedback.text = owner.InventoryRejected > 0
    ? "Inventory full: item rejected"
    : "Click buttons to observe real UGUI events";`]
  });
  Object.assign(behaviorText,{persistenceController:['持久化控制器','引用状态对象，显式保存、读取、清除 PlayerPrefs JSON。','PlayerPrefs.SetString(key, JsonUtility.ToJson(Data));\nPlayerPrefs.Save();\nData = JsonUtility.FromJson<LabSaveData>(PlayerPrefs.GetString(key));\nPlayerPrefs.DeleteKey(key);'],persistentState:['可保存状态','通过 JSON 配置姓名、分数与关卡。','[Serializable] class LabSaveData { public int schemaVersion, score, level; public string playerName; }']});
  Object.assign(behaviorText,{feedbackController:['反馈控制器','引用效果源，周期触发真实粒子、拖尾与音效。','particles.Emit(Definition.settings.burstCount);\ntrail.AddPosition(source.position);\naudio.PlayOneShot(clip, 1);'],effectSource:['效果源','挂载此预设后可被反馈控制器引用，运行时添加 ParticleSystem、TrailRenderer 和 AudioSource。','// Runtime: ParticleSystem + TrailRenderer + AudioSource']});
  function log(message,error=false) {
    const entry = {time:new Date().toISOString(),message,error};
    history.push(entry); if(history.length > 250) history.shift();
    const row = document.createElement('div'); row.className = 'log-line' + (error?' error':'');
    const time = document.createElement('time'); time.textContent = new Date().toLocaleTimeString('zh-CN',{hour12:false});
    const text = document.createElement('span'); text.textContent = message;
    row.append(time,text); $('log').append(row);
    while($('log').children.length>60) $('log').firstChild.remove();
    $('log').scrollTop = $('log').scrollHeight;
  }
  function command(action,extra={}) {
    if(!instance || !initialized) return;
    instance.SendMessage('LabBridge','Dispatch',JSON.stringify({action,scope:storageKey,...extra}));
  }
  function setEnabled() {
    const editing = initialized && state?.mode === 'edit';
    $('add-ground').disabled = !editing; $('add-sphere').disabled = !editing;
    $('play').disabled = !editing || !state?.scene.objects.length;
    $('stop').disabled = !initialized || state?.mode !== 'play';
    document.querySelectorAll('[data-template]').forEach(b=>b.disabled=!editing);
    $('save').disabled = !initialized; $('reset-camera').disabled = !initialized;
    window.assetShelf?.setReady(initialized);
  }
  function updateMilestones() {
    const objects = state?.scene.objects || [];
    const values = {
      create:objects.some(x=>x.kind==='ground')&&objects.length>1,
      behavior:objects.some(x=>(x.scripts||[]).length||x.behavior&&x.behavior!=='none'),
      play:milestones.play,stop:milestones.stop,save:milestones.saved||milestones.restored
    };
    for(const [name,done] of Object.entries(values)) $('step-'+name).classList.toggle('done',done);
  }
  function render(next) {
    const previous = state; state = next;
    if(previous?.selectedId!==next.selectedId) dirtyPositionAxes.clear();
    if(next.mode==='play') milestones.play = true;
    if(previous?.mode==='play' && next.mode==='edit') milestones.stop = true;
    if(next.message.includes('从浏览器存档恢复')) {
      milestones.restored = true; $('save-status').textContent = '已恢复存档';
    }
    $('engine-version').textContent = 'Unity ' + next.version;
    $('mode-label').textContent = next.mode==='play'?'实验运行中':'编辑场景';
    document.querySelector('.scene-label').classList.toggle('playing',next.mode==='play');
    $('elapsed').innerHTML = Number(next.elapsed).toFixed(2)+' <em>s</em>';
    $('contacts').innerHTML = next.contacts+' <em>次</em>';
    $('object-count').textContent = next.scene.objects.length+' 个';
    const item = next.scene.objects.find(x=>x.id===next.selectedId);
    $('height').innerHTML = (item?Number(item.position.y).toFixed(2):'—')+' <em>m</em>';
    const sceneShape = JSON.stringify(next.scene.objects.map(x=>[x.id,x.kind,x.behavior])) + next.selectedId;
    if($('hierarchy').dataset.shape!==sceneShape) {
      $('hierarchy').dataset.shape=sceneShape; $('hierarchy').replaceChildren();
      if(!next.scene.objects.length) {
        const empty=document.createElement('p');empty.className='empty';empty.textContent='场景为空。从 Project 拖入课程预制体搭建实验。';$('hierarchy').append(empty);
      }
      next.scene.objects.forEach((object,index)=>{
        const row=document.createElement('button');row.className='object-row'+(object.id===next.selectedId?' selected':'');row.setAttribute('role','listitem');row.dataset.objectId=object.id;
        const icon=document.createElement('span');icon.className='object-icon '+object.kind;
        const name=document.createElement('span');name.textContent=(object.name||object.kind)+' '+(index+1);
        const note=document.createElement('small');note.textContent=object.kind;
        row.draggable=next.mode==='edit';row.addEventListener('dragstart',event=>{event.dataTransfer.setData('application/x-unity-object',object.id);event.dataTransfer.effectAllowed='link';});row.append(icon,name,note);row.onclick=()=>command('select',{id:object.id});$('hierarchy').append(row);
      });
    }
    $('selected-name').textContent=item?(item.name||item.kind):'尚未选择对象';
    $('selected-type').textContent=item?item.kind+' · Collider'+(item.rigidbody?' · Rigidbody':''):'在场景或对象列表中选择';
    for(const axis of ['x','y','z']) {
      const input=$('pos-'+axis); input.disabled=!item||next.mode==='play';
      if(document.activeElement!==input || previous?.selectedId!==next.selectedId) input.value=item?Number(item.position[axis]).toFixed(2):'';
    }
    $('behavior').disabled=!item||next.mode==='play';
    for(const option of $('behavior').options) option.disabled=false;
    $('behavior').value=item?.behavior||'none';
    const sourceId=window.assetShelf?.sourceId(item)||item?.behavior||'none';
    const preset=behaviorText[sourceId]||[sourceId,'课程预设脚本；参数与引用在下方 Inspector 配置。','// '+sourceId+' (只读课程预设)\n// 使用 Inspector 配置参数及对象引用。'];
    $('behavior-description').textContent=item?preset[1]:'所有预设脚本均可挂载到任意对象；Play 前统一检查依赖、参数与引用。';
    $('source-code').textContent=preset[2];
    $('component-tag').textContent=({drop:'DropBehavior',launch:'LaunchBehavior',platform:'PlatformMoveBehavior',spin:'SpinBehavior'})[sourceId]||(sourceId==='none'?'没有运动组件':sourceId);
    $('observation').textContent=next.mode==='play'?({lab01:'点击场景获取键盘焦点，WASD / 方向键移动角色。',lab02:'观察弹丸命中与生命周期计数。',lab03:'点击场景获取焦点；WASD 移动，空格跳跃。射线落地后才允许再次跳跃。',lab04:'比较父节点旋转后的局部 / 世界移动方向，观察距离与停止位置。',lab05:'直接点击 Unity Canvas 的伤害、治疗与背包按钮，观察真实 UGUI 反馈。',lab08:'选择存储控制器，使用 Inspector 的加分、保存、读取、清除按钮；停止后重新运行，再读取比较已保存分数。',lab07:'点击运行启用浏览器音频；观察粒子、拖尾与周期音效反馈。',lab06:'点击场景获取键盘焦点；WASD 进入 Walk，空格触发 Jump，观察真实 Animator 状态与事件。'}[labId]):'停止恢复编辑快照；保存可保留未通过检查的草稿。';
    if(next.message) log(next.message,next.error);
    renderConfiguration(item); setEnabled(); updateMilestones();
  }

  function renderConfiguration(item) {
    const vector=value=>value?['x','y','z'].map(axis=>Number(value[axis]||0).toFixed(2)).join(', '):'—';
    const metricText={
      lab01:'Score 分数 '+(state.score||0)+' · 终点 '+(state.completed?'已完成':'未到达'),
      lab02:'发射 '+(state.spawned||0)+' · 命中 '+(state.hits||0)+' · 存活 '+(state.alive||0)+' · Start '+(state.lifecycleStart||0)+' / Update '+(state.lifecycleUpdate||0)+' / FixedUpdate '+(state.lifecycleFixed||0),
      lab03:'落地 '+(state.grounded?'是':'否')+' · 碰撞 '+(state.physicsContacts||0)+' · 跳跃 '+(state.jumps||0)+' · 空中拒绝 '+(state.rejectedJumps||0)+' · 射线命中 '+(state.rayHits||0)+' · 触发 '+(state.triggers||0),
      lab04:'目标距离 '+Number(state.coordinateDistance||0).toFixed(2)+' · 世界 ('+vector(state.worldPosition)+') · 局部 ('+vector(state.localPosition)+')',
      lab05:'生命 '+(state.health||0)+' · 生命事件 '+(state.healthChanges||0)+' · 背包 '+(state.inventoryCount||0)+' · 容量拒绝 '+(state.inventoryRejected||0),
      lab08:'状态 '+(state.persistenceStatus||'ready')+' · 分数 '+(state.persistenceScore||0)+' · 关卡 '+(state.persistenceLevel||0)+' · 存档 '+(state.persistenceHasSave?'存在':'无')+' · 保存 '+(state.persistenceSaves||0)+' / 读取 '+(state.persistenceLoads||0)+' / 清除 '+(state.persistenceClears||0),
      lab07:'反馈 '+(state.feedbackBursts||0)+' · 粒子 '+(state.particlesEmitted||0)+' · 拖尾点 '+(state.trailPoints||0)+' · 音效 '+(state.audioPlays||0),
      lab06:'状态 '+(state.animationState||'Idle')+' · 转换 '+(state.animationTransitions||0)+' · 动画事件 '+(state.animationEvents||0)+' · 跳跃 '+(state.animationJumps||0)
    };
    $('lab-metrics').textContent=metricText[labId];
    for(const axis of ['x','y','z']){const input=$('rot-'+axis);input.disabled=!item||state.mode!=='edit';if(document.activeElement!==input)input.value=item?Number(item.rotation?.[axis]||0).toFixed(2):'';}
    const host=$('settings-fields'),shape=JSON.stringify([item?.id,item?.scripts,state.scene.objects.map(x=>x.id)]);
    host.querySelectorAll('input,select').forEach(input=>{input.disabled=!item||state.mode!=='edit';if(document.activeElement!==input){const field=input.dataset.field;input.value=item?.settings?.[field]??(['scoreTarget','projectile','target','parent','effectSource'].includes(field)?'':({space:'world',layout:'compact'}[field]??0));}});
    $('rigidbody').checked=!!item?.rigidbody;$('rigidbody').disabled=!item||state.mode!=='edit';
    $('rigidbody').onchange=()=>command('component',{id:item.id,behavior:'rigidbody',enabled:$('rigidbody').checked});
    if(host.dataset.shape!==shape) {
      host.dataset.shape=shape;host.replaceChildren();
      for(const [field,label] of Object.entries({storageSlot:'Storage Slot 存档槽',initialData:'Initial JSON 初始状态',speed:'Speed 速度',interval:'Interval 间隔 (s)',effectSource:'Effect Source 效果源引用',burstCount:'Burst Count 粒子数量',trailTime:'Trail Time 拖尾时长 (s)',volume:'Volume 音量',lifetime:'Lifetime 存活 (s)',maxAlive:'Max Alive 存活上限',requiredScore:'Required Score 目标分数',scoreTarget:'Score Receiver 计分器',projectile:'Projectile 弹丸原型引用',target:'Target 目标引用',mass:'Mass 质量',friction:'Friction 摩擦',bounce:'Bounce 弹性',jumpForce:'Jump Force 跳跃力',parent:'Parent 父节点',space:'Space 移动坐标',stopDistance:'Stop Distance 停止距离',maxHealth:'Max Health 最大生命',damage:'Damage 伤害',heal:'Heal 治疗',capacity:'Capacity 背包容量',layout:'Layout 布局'})) {
        const fieldsByScript={persistenceController:['storageSlot','target'],persistentState:['initialData'],feedbackController:['interval','effectSource','burstCount','trailTime','volume'],playerMove:['speed'],collectible:['scoreTarget'],finish:['scoreTarget'],scoreReceiver:['requiredScore'],spawnEmitter:['interval','maxAlive','projectile','target'],projectileMove:['speed','lifetime'],physicsMove:['speed','mass','friction','bounce','jumpForce'],coordinateMove:['speed','parent','target','space','stopDistance'],lookAtTarget:['target','speed','space','stopDistance'],healthController:['maxHealth','damage','heal','layout'],inventoryController:['capacity','layout']};
        const fields=new Set((item?.scripts||[]).flatMap(script=>fieldsByScript[script]||[]));if(!fields.has(field))continue;
        const row=document.createElement('label');row.className='field';const title=document.createElement('span');title.textContent=label;
        const reference=['scoreTarget','projectile','target','parent','effectSource'].includes(field),choices=({space:[['world','World 世界'],['local','Local 局部']],layout:[['compact','Compact 紧凑'],['wide','Wide 宽屏']]})[field],input=document.createElement(reference||choices?'select':'input');
        if(reference){input.add(new Option('None (未绑定)',''));for(const object of state.scene.objects)input.add(new Option(object.name||object.kind+' · '+object.id,object.id));}else if(choices){for(const [value,label] of choices)input.add(new Option(label,value));}else if(['storageSlot','initialData'].includes(field)){input.type='text';}else{input.type='number';input.step=['burstCount','capacity','maxHealth','damage','heal','maxAlive','requiredScore'].includes(field)?'1':'any';}
        input.value=item?.settings?.[field]??(reference?'':choices?.[0][0]??0);input.disabled=!item||state.mode!=='edit';input.dataset.field=field;
        if(reference){input.addEventListener('dragover',event=>{if(Array.from(event.dataTransfer.types).includes('application/x-unity-object')&&state.mode==='edit'){event.preventDefault();event.dataTransfer.dropEffect='link';}});input.addEventListener('drop',event=>{const id=event.dataTransfer.getData('application/x-unity-object');if(id&&state.mode==='edit'){event.preventDefault();command('configure',{id:item.id,settings:{...state.scene.objects.find(object=>object.id===item.id)?.settings,[field]:id}});}});input.title='从 Hierarchy 拖入对象，或从列表选择';}
        input.onchange=()=>command('configure',{id:item.id,settings:{...state.scene.objects.find(object=>object.id===item.id)?.settings,[field]:reference||choices||['storageSlot','initialData'].includes(field)?input.value:Number(input.value)}});
        row.append(title,input);host.append(row);
      }
    }
    $('persistence-controls').hidden=!(item?.scripts||[]).includes('persistenceController');
    for(const action of ['addScore','save','load','clear']){const button=$('persistence-'+action);button.disabled=state.mode!=='play'||!(item?.scripts||[]).includes('persistenceController');button.onclick=()=>command('persistenceAction',{id:item.id,behavior:action});}
    $('persistence-json').textContent=state.persistenceJson||'运行后显示当前 JSON；编辑参数不会自动覆盖存档。';
    const errors=state.errors||[],status=$('validation-status');status.replaceChildren();
    for(const error of errors){const row=document.createElement('button');row.className='validation-error';row.textContent=error.script+' · '+error.field+': '+error.message;row.onclick=()=>command('select',{id:error.id});status.append(row);}
    const signature=JSON.stringify(errors);if($('log').dataset.errors!==signature){$('log').dataset.errors=signature;for(const error of errors){log(error.id+' / '+error.script+' / '+error.field+': '+error.message,true);const row=$('log').lastChild;row.tabIndex=0;row.onclick=()=>command('select',{id:error.id});row.onkeydown=e=>{if(e.key==='Enter')row.click();};}}
  }
  window.addEventListener('unity-lab-state',event=>render(event.detail));
  window.addEventListener('unity-lab-script-preview',event=>{
    const preset=behaviorText[event.detail];$('source-code').textContent=preset?preset[2]:'// '+event.detail+' (只读课程预设)\n// 使用 Inspector 配置参数及对象引用。';$('component-tag').textContent=event.detail;
  });
  window.addEventListener('unity-lab-ui-message',event=>log(event.detail.message,!!event.detail.error));
  window.addEventListener('unity-lab-storage',event=>{
    if(event.detail.ok) {
      milestones.saved=true;$('save-status').textContent='已保存 '+new Date().toLocaleTimeString('zh-CN',{hour12:false});
      log(state?.mode==='play'?'已保存运行前的编辑状态。刷新后会恢复该状态。':'已保存实验。刷新页面后会自动重新打开。');updateMilestones();
    } else log('保存失败：浏览器存储不可用。'+event.detail.message,true);
  });
  function initialize() {
    if(!instance || !engineReady || !identityReady || initialized) return;
    initialized=true;$('loading').classList.add('hidden');setEnabled();
    try {
      const saved=localStorage.getItem(storageKey);
      if(saved) instance.SendMessage('LabBridge','LoadSaved',saved); else command('experiment',{id:labId,kind:'demo'});
    } catch(error) { log('浏览器存储不可用，仍可进行实验：'+error.message,true); }
  }
  window.addEventListener('unity-lab-ready',()=>{engineReady=true;initialize();});
  $('add-ground').onclick=()=>command('create',{kind:'ground'});
  $('add-sphere').onclick=()=>command('create',{kind:'sphere'});
  $('play').onclick=()=>{command('play');$('unity-canvas').focus();};$('stop').onclick=()=>command('stop');
  function commitPosition() {
    if(!state?.selectedId || state.mode!=='edit') return true;
    if(!dirtyPositionAxes.size) return true;
    const inputs=['x','y','z'].map(key=>$('pos-'+key));
    if(inputs.some(input=>input.value.trim()==='' || !input.validity.valid)) {
      log('保存前请填写范围内的有效位置数值。',true);return false;
    }
    const item=state.scene.objects.find(object=>object.id===state.selectedId);
    if(!item) return false;
    const position={...item.position};
    for(const axis of dirtyPositionAxes) position[axis]=Number($('pos-'+axis).value);
    if(item && ['x','y','z'].some(axis=>Math.abs(item.position[axis]-position[axis])>0.0001))
      command('position',{id:state.selectedId,position});
    dirtyPositionAxes.clear();
    return true;
  }
  for(const axis of ['x','y','z']) $('rot-'+axis).onchange=()=>{if(!state?.selectedId||state.mode!=='edit')return;const rotation={};for(const key of ['x','y','z']){const input=$('rot-'+key);if(input.value.trim()===''||!input.validity.valid)return;rotation[key]=Number(input.value);}command('rotation',{id:state.selectedId,rotation});};
  function saveExperiment() {if(commitPosition()) command('save');}
  $('save').onclick=saveExperiment;$('reset-camera').onclick=()=>command('camera');
  $('behavior').onchange=()=>{if($('behavior').value!=='none')command('attach',{id:state.selectedId,behavior:$('behavior').value});};
  for(const axis of ['x','y','z']) {
    $('pos-'+axis).addEventListener('input',()=>dirtyPositionAxes.add(axis));
    $('pos-'+axis).onchange=()=>commitPosition();
  }
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();saveExperiment();}});
  $('unity-canvas').addEventListener('contextmenu',event=>event.preventDefault());
  window.unityLab={get state(){return state;},get ready(){return initialized;},get history(){return history;},command,get storageKey(){return storageKey;}};
  setEnabled();
  const loader=document.createElement('script');loader.src='Build/Web.loader.js';
  loader.onload=()=>{
    createUnityInstance($('unity-canvas'),{
      dataUrl:'Build/Web.data',frameworkUrl:'Build/Web.framework.js',codeUrl:'Build/Web.wasm',
      streamingAssetsUrl:'StreamingAssets',companyName:'Course Lab',productName:'Unity Course Lab',productVersion:'1.0',
      showBanner:(message,type)=>{log(message,type==='error');}
    },progress=>{$('load-progress').value=progress;}).then(result=>{instance=result;initialize();}).catch(error=>failure(String(error)));
  };
  loader.onerror=()=>failure('没有找到 Unity WebGL 构建文件。请先运行 Tools/build.ps1。');
  function failure(message) {$('loading-message').textContent=message;$('load-progress').hidden=true;log(message,true);}
  document.body.append(loader);
})();
