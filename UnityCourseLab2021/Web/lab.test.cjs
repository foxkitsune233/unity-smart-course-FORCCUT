const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element {
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.dataset={};this.children=[];this.options=[];this.classList={add(){},toggle(){},remove(){}};this.value='';this.validity={valid:true};this.disabled=false;this.listeners={};this.textContent='';}
 append(...nodes){this.children.push(...nodes);} add(option){this.options.push(option);} replaceChildren(...nodes){this.children=nodes;} addEventListener(name,fn){this.listeners[name]=fn;} setAttribute(){} focus(){} querySelectorAll(){return this.children.flatMap(x=>x.children).filter(x=>['INPUT','SELECT'].includes(x.tagName));} get firstChild(){return this.children[0];}get lastChild(){return this.children.at(-1);} remove(){}
}
async function fixture(lab){
 const elements=new Map(),events={},sent=[],saved=[];const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 const templates=['demo','practice','blank'].map(kind=>{const e=new Element('button');e.dataset.template=kind;return e;});
 const document={getElementById:get,querySelector:selector=>get(selector),querySelectorAll:()=>templates,createElement:tag=>new Element(tag),body:new Element(),addEventListener(){},activeElement:null};
 const context={document,location:{search:'?lab='+lab,pathname:'/lab/',assign(){}},URLSearchParams,Option:class{constructor(text,value){this.text=text;this.value=value;}},console,fetch:async()=>({ok:true,json:async()=>({user:{id:'student A',name:'A'}})}),localStorage:{getItem:key=>{saved.push(key);return null;}},CustomEvent:class{},createUnityInstance:async()=>({SendMessage:(...args)=>sent.push(JSON.parse(args[2]))})};
 context.window=context;context.addEventListener=(name,fn)=>events[name]=fn;
 vm.runInNewContext(fs.readFileSync(__dirname+'/lab.js','utf8'),context);
 const loader=document.body.children.at(-1);loader.onload();events['unity-lab-ready']();await new Promise(resolve=>setImmediate(resolve));
 return {get,events,context,document,sent,saved,templates};
}
function scene(scripts,settings={}){return {selectedId:'actor',mode:'edit',version:'2021',elapsed:0,contacts:0,message:'',scene:{objects:[{id:'actor',kind:'sphere',position:{x:0,y:1,z:0},rotation:{x:0,y:0,z:0},scripts,settings},{id:'target',kind:'target',position:{x:2,y:0,z:0},scripts:[],settings:{}}]}};}
(async()=>{
 for(const lab of ['lab01','lab02','lab03','lab04','lab05','lab06','lab07','lab08']){
  const f=await fixture(lab);assert.equal(f.get('lab-select').value,lab);assert.ok(f.saved[0].endsWith('.'+lab+'.1'));assert.equal(f.sent[0].id,lab);assert.equal(f.sent[0].kind,'demo');f.templates[1].onclick();assert.equal(f.sent.at(-1).kind,'practice');f.templates[2].onclick();assert.equal(f.sent.at(-1).kind,'blank');
 }
 const f=await fixture('lab04'),s=scene(['coordinateMove'],{speed:2,target:'target',parent:'',space:'local',stopDistance:.5});const render=s=>f.events['unity-lab-state']({detail:s});render(s);
 const fields=()=>f.get('settings-fields').querySelectorAll();assert.deepEqual(fields().map(x=>x.dataset.field),['speed','target','parent','space','stopDistance']);
 const speed=fields()[0];f.document.activeElement=speed;speed.value='4.25';const next=JSON.parse(JSON.stringify(s));next.scene.objects[0].settings.target='actor';render(next);assert.equal(fields()[0],speed);assert.equal(speed.value,'4.25');speed.onchange();assert.equal(f.sent.at(-1).settings.target,'actor');assert.equal(f.sent.at(-1).settings.speed,4.25);
 const playing={...next,mode:'play'};render(playing);assert.equal(fields()[0],speed);assert.equal(speed.disabled,true);
 render({...next,errors:[{id:'target',script:'coordinateMove',field:'target',message:'请选择目标'}]});f.get('validation-status').children[0].onclick();assert.equal(f.sent.at(-1).action,'select');assert.equal(f.sent.at(-1).id,'target');
 const physics=await fixture('lab03');physics.events['unity-lab-state']({detail:{...scene(['physicsMove'],{mass:1}),grounded:true,jumps:2,rayHits:5,triggers:1}});assert.match(physics.get('lab-metrics').textContent,/跳跃 2/);assert.deepEqual(physics.get('settings-fields').querySelectorAll().map(x=>x.dataset.field),['speed','mass','friction','bounce','jumpForce']);
 const pending=await fixture('lab99');assert.equal(pending.get('lab-select').value,'lab01');assert.equal(pending.sent[0].id,'lab01');
 const feedback=await fixture('lab07');feedback.events['unity-lab-state']({detail:{...scene(['feedbackController'],{effectSource:'target',interval:1,burstCount:12,trailTime:1,volume:.3}),feedbackBursts:2,particlesEmitted:24,trailPoints:8,audioPlays:2}});assert.match(feedback.get('lab-metrics').textContent,/粒子 24/);assert.match(feedback.get('lab-metrics').textContent,/音效 2/);assert.deepEqual(feedback.get('settings-fields').querySelectorAll().map(x=>x.dataset.field),['interval','effectSource','burstCount','trailTime','volume']);
 const persistence=await fixture('lab08');persistence.events['unity-lab-state']({detail:{...scene(['persistenceController'],{storageSlot:'progress',target:'target'}),mode:'play',persistenceScore:12,persistenceStatus:'loaded',persistenceHasSave:true,persistenceJson:'{"score":12}',persistenceSaves:1,persistenceLoads:1,persistenceClears:0}});assert.match(persistence.get('lab-metrics').textContent,/12/);assert.match(persistence.get('lab-metrics').textContent,/loaded/);assert.deepEqual(persistence.get('settings-fields').querySelectorAll().map(x=>x.dataset.field),['storageSlot','target']);persistence.get('persistence-load').onclick();assert.equal(persistence.sent.at(-1).action,'persistenceAction');assert.equal(persistence.sent.at(-1).behavior,'load');assert.equal(persistence.sent.at(-1).id,'actor');
 for(const action of ['save','clear','addScore']){persistence.get('persistence-'+action).onclick();assert.equal(persistence.sent.at(-1).behavior,action);assert.match(persistence.sent.at(-1).scope,/student%20A\.lab08\.1$/);}
 const initial=await fixture('lab08');initial.events['unity-lab-state']({detail:scene(['persistentState'],{initialData:'{"schemaVersion":1,"playerName":"A","score":0,"level":1}'})});const jsonInput=initial.get('settings-fields').querySelectorAll()[0];assert.equal(jsonInput.dataset.field,'initialData');assert.equal(jsonInput.type,'text');jsonInput.value='{"score":5}';jsonInput.onchange();assert.equal(initial.sent.at(-1).settings.initialData,'{"score":5}');assert.equal(initial.get('persistence-save').disabled,true);
 console.log('Web UI: lab routing, scoped saves, templates, script fields, retained inputs, latest settings, preflight selection, engine metrics passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});

