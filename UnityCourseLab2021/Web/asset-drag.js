(() => {
  'use strict';
  const mime='application/x-unity-course-asset';
  const catalog={
    ground:{type:'prefab',name:'地板'},sphere:{type:'prefab',name:'小球'},
    drop:{type:'script',name:'重力下落',className:'DropBehavior'},
    launch:{type:'script',name:'水平抛出',className:'LaunchBehavior'},
    platform:{type:'script',name:'平台往复移动',className:'PlatformMoveBehavior'},
    spin:{type:'script',name:'自转',className:'SpinBehavior'}
  };
  catalog.playerMove={type:'script',name:'角色移动',className:'PlayerMove'};
catalog.collectible={type:'script',name:'金币拾取',className:'Collectible'};
catalog.scoreReceiver={type:'script',name:'计分接收器',className:'ScoreReceiver'};
catalog.finish={type:'script',name:'终点判定',className:'Finish'};
catalog.spawnEmitter={type:'script',name:'预制体发射器',className:'SpawnEmitter'};
catalog.projectileMove={type:'script',name:'弹丸运动',className:'ProjectileMove'};
catalog.lifecycleProbe={type:'script',name:'生命周期探针',className:'LifecycleProbe'};
catalog.targetHitReceiver={type:'script',name:'目标命中',className:'TargetHitReceiver'};
catalog.player={type:'prefab',name:'角色'};
catalog.coin={type:'prefab',name:'金币'};
catalog.finishObject={type:'prefab',name:'终点'};
catalog.score={type:'prefab',name:'计分器'};
catalog.emitter={type:'prefab',name:'发射器'};
catalog.projectile={type:'prefab',name:'弹丸'};
catalog.target={type:'prefab',name:'靶标'};
  Object.assign(catalog,{
    physicsBody:{type:'prefab',name:'物理球'},triggerZone:{type:'prefab',name:'触发区'},parentFrame:{type:'prefab',name:'旋转父节点'},vectorMover:{type:'prefab',name:'向量移动体'},healthPanel:{type:'prefab',name:'UGUI 生命面板'},inventoryPanel:{type:'prefab',name:'UGUI 背包面板'},
    physicsMove:{type:'script',name:'物理移动与跳跃',className:'PhysicsMove'},triggerProbe:{type:'script',name:'触发探针',className:'TriggerProbe'},coordinateMove:{type:'script',name:'坐标与向量移动',className:'CoordinateMove'},lookAtTarget:{type:'script',name:'朝向目标',className:'LookAtTarget'},healthController:{type:'script',name:'生命控制器',className:'HealthController'},inventoryController:{type:'script',name:'背包控制器',className:'InventoryController'}
  });
  Object.assign(catalog,{feedbackSource:{type:'prefab',name:'反馈源'},feedbackController:{type:'script',name:'反馈控制器',className:'LabFeedbackActor'},effectSource:{type:'script',name:'效果源',className:'EffectSource'}});
  Object.assign(catalog,{persistenceController:{type:'script',name:'持久化控制器',className:'LabPersistenceActor'},persistentState:{type:'script',name:'可保存状态',className:'PersistentState'}});
  const $=id=>document.getElementById(id);
  let state=null,ready=false,active=null,preview=null,previewObject=null;
  const message=(text,error=false)=>window.dispatchEvent(new CustomEvent('unity-lab-ui-message',{detail:{message:text,error}}));
  const command=(action,extra)=>window.unityLab?.command(action,extra);
  const selected=()=>state?.scene.objects.find(item=>item.id===state.selectedId);
  const editing=()=>ready&&state?.mode==='edit';
  const scriptsOf=item=>item?.scripts?.length?item.scripts:item?.behavior&&item.behavior!=='none'?[item.behavior]:[];
  function sourceId(item) {
    const scripts=scriptsOf(item);
    if(item?.id===previewObject&&scripts.includes(preview)) return preview;
    return item?.behavior&&item.behavior!=='none'?item.behavior:scripts[0]||'none';
  }
  function enable() {
    for(const card of document.querySelectorAll('[data-asset-type]')) {card.disabled=!editing();card.draggable=editing();}
  }
  function renderComponents() {
    const item=selected();const scripts=scriptsOf(item);const host=$('attached-scripts');
    const shape=JSON.stringify([item?.id,scripts,state?.mode]);
    if(host.dataset.shape===shape) return;
    host.dataset.shape=shape;host.replaceChildren();
    if(!scripts.length) {
      const empty=document.createElement('p');empty.className='empty-component';empty.textContent=item?'把预设脚本拖到这里，为当前物体添加行为。':'先选择物体，再拖入对应脚本。';host.append(empty);return;
    }
    for(const id of scripts) {
      const asset=catalog[id]||{name:id,className:id};const row=document.createElement('div');row.className='attached-script';row.dataset.scriptId=id;
      const inspect=document.createElement('button');inspect.className='script-preview';inspect.type='button';
      const name=document.createElement('strong');name.textContent='C# '+asset.name;
      const code=document.createElement('small');code.textContent=asset.className+' (Script)';inspect.append(name,code);
      inspect.onclick=()=>{preview=id;previewObject=item.id;window.dispatchEvent(new CustomEvent('unity-lab-script-preview',{detail:id}));};
      const remove=document.createElement('button');remove.type='button';remove.className='remove-script';remove.textContent='×';remove.setAttribute('aria-label','移除'+asset.name);remove.disabled=!editing();
      remove.onclick=()=>command('removeScript',{id:item.id,behavior:id});row.append(inspect,remove);host.append(row);
    }
  }
  const prefabHost=document.querySelector('.prefab-card').parentElement,scriptHost=document.querySelector('.script-card').parentElement;
  for(const [id,asset] of Object.entries(catalog)) {
    if(['healthPanel','inventoryPanel','healthController','inventoryController'].includes(id))continue; // LAB05 is held for the user's chapter-four checkpoint.
    if(document.querySelector('[data-asset-id="'+id+'"]'))continue;
    const card=document.createElement('button');card.className='asset-card '+(asset.type==='script'?'script-card':'prefab-card');card.draggable=true;card.dataset.assetType=asset.type;card.dataset.assetId=id;
    const symbol=document.createElement('span');symbol.className='asset-symbol';symbol.textContent=asset.type==='script'?'C#':'◇';
    const title=document.createElement('strong');title.textContent=asset.name;const note=document.createElement('small');note.textContent=asset.className||id+'.prefab';card.append(symbol,title,note);(asset.type==='script'?scriptHost:prefabHost).append(card);
    if(asset.type==='script')document.getElementById('behavior').add(new Option(asset.name+' · '+asset.className,id));
  }
  const hint=document.createElement('div');hint.className='resource-drop-hint';hint.hidden=true;$('viewport').append(hint);
  function clear() {for(const node of document.querySelectorAll('.drop-ready'))node.classList.remove('drop-ready');hint.hidden=true;}
  function payload(event) {
    if(active) return active;
    try {const value=JSON.parse(event.dataTransfer.getData(mime));return catalog[value.id]?.type===value.type?value:null;}catch{return null;}
  }
  function recognized(event) {return !!active||Array.from(event.dataTransfer?.types||[]).includes(mime);}
  function attach(id,script) {
    if(!id) {message('请先选择脚本要挂载的物体。',true);return;}
    command('attach',{id,behavior:script});
  }
  function target(element,drop) {
    element.addEventListener('dragover',event=>{
      if(!recognized(event)||!editing())return;
      event.preventDefault();event.dataTransfer.dropEffect='copy';
      const row=element.id==='hierarchy'?event.target.closest('[data-object-id]'):null;
      (row||element).classList.add('drop-ready');
      if(element.id==='viewport'){hint.textContent=active?.type==='script'?'松开鼠标，将脚本挂载到物体':'松开鼠标，将预制体放入场景';hint.hidden=false;}
    });
    element.addEventListener('dragleave',event=>{if(!element.contains(event.relatedTarget)) clear();});
    element.addEventListener('drop',event=>{
      if(!recognized(event))return;
      event.preventDefault();event.stopPropagation();const value=payload(event);clear();
      if(!editing()){message('请先停止运行，再拖入物品或脚本。',true);return;}
      if(!value){message('只能拖入项目资源中的预设物品或脚本。',true);return;}
      drop(event,value);active=null;
    });
  }
  for(const card of document.querySelectorAll('[data-asset-type]')) {
    card.addEventListener('dragstart',event=>{
      if(!editing()){event.preventDefault();return;}
      active={type:card.dataset.assetType,id:card.dataset.assetId};
      document.body.classList.add('asset-dragging');
      event.dataTransfer.setData(mime,JSON.stringify(active));event.dataTransfer.effectAllowed='copy';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend',()=>{active=null;document.body.classList.remove('asset-dragging');card.classList.remove('dragging');clear();});
    card.addEventListener('dblclick',()=>{
      if(!editing())return;
      if(card.dataset.assetType==='prefab')command('create',{kind:card.dataset.assetId==='finishObject'?'finish':card.dataset.assetId});
      else attach(state.selectedId,card.dataset.assetId);
    });
  }
  target($('viewport'),(event,value)=>{
    const rect=$('unity-canvas').getBoundingClientRect();
    const coordinates={u:(event.clientX-rect.left)/rect.width,v:(event.clientY-rect.top)/rect.height};
    if(value.type==='prefab')command('place',{kind:value.id==='finishObject'?'finish':value.id,...coordinates});
    else command('attachAt',{behavior:value.id,...coordinates});
  });
  target($('hierarchy'),(event,value)=>{
    if(value.type==='prefab')command('create',{kind:value.id==='finishObject'?'finish':value.id});
    else attach(event.target.closest('[data-object-id]')?.dataset.objectId,value.id);
  });
  target($('script-dropzone'),(event,value)=>{
    if(value.type!=='script'){message('这里用于挂载脚本。请把预制体拖到场景或层级区域。',true);return;}
    attach(state.selectedId,value.id);
  });
  window.addEventListener('unity-lab-state',event=>{state=event.detail;enable();renderComponents();});
  window.assetShelf={setReady(value){ready=value;enable();renderComponents();},sourceId};
})();
