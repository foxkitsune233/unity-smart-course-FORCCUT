// 学习记录（进度与笔记）的账号隔离存储。
// 设计要点：
//  1. 本地存储键带账号维度，同一浏览器切换账号不会互相看到进度与笔记。
//  2. 登录后以服务端记录为准（服务端按 user_id + course_id 存储），实现"登录后同步本人记录"。
//  3. 旧版本（无账号维度）的记录不能静默归到当前账号：迁移时打上来源标记，并在界面提示。
//  4. 私人记录（笔记）只对本人可见；同步失败时保留本地输入，不丢内容。
import {parseState,createState} from './learning-state.mjs';

const LEGACY_PREFIX='CoursePortal.v1:';
const LOCAL_PREFIX='CoursePortal.v2:';
const SOURCE_KEY='CoursePortal.v2.sources';
const CLAIM_PREFIX='CoursePortal.v2.legacyClaimed:';

// 每次调用时判断运行环境，而不是在模块加载时固化，避免在非浏览器环境（如测试）下失效。
const hasStorage=()=>typeof localStorage!=='undefined'&&localStorage!==null;

// 会话校验令牌：服务端要求所有写请求带 X-CSRF-Token（server/app.mjs），
// 令牌随 /api/session 下发且与 Cookie 会话绑定。这里按需获取并缓存；
// 令牌过期时（服务端返回 403）刷新一次再重试，避免"保存看似成功、其实没上云"。
let cacheToken=null;
export function resetSessionToken(){cacheToken=null;}
async function sessionToken(fetchImpl,refresh=false){
 if(!fetchImpl)return null;
 if(cacheToken&&!refresh)return cacheToken;
 try{
  const response=await fetchImpl('/api/session',{method:'GET',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  if(!response.ok){cacheToken=null;return null;}
  const data=await response.json().catch(()=>({}));
  cacheToken=typeof data?.csrfToken==='string'&&data.csrfToken?data.csrfToken:null;
  return cacheToken;
 }catch{cacheToken=null;return null;}
}

export function accountKey(userId,courseId,preview=false){
 return LOCAL_PREFIX+encodeURIComponent(userId||'anonymous')+':'+(courseId||'')+(preview?':draft-preview':'');
}
export function legacyKey(courseId){return LEGACY_PREFIX+(courseId||'');}
const courseOf=courseId=>courseId||'';

// 迁移来源登记：记录哪些账号从旧的无账号维度存储迁移而来，便于界面提示与追溯。
function readSources(){
 if(!hasStorage())return {};
 try{return JSON.parse(localStorage.getItem(SOURCE_KEY)||'{}');}catch{return {};}
}
function writeSources(sources){
 if(!hasStorage())return;
 try{localStorage.setItem(SOURCE_KEY,JSON.stringify(sources));}catch{}
}
export function migrationSources(){return readSources();}

function readRaw(key){
 if(!hasStorage())return null;
 try{return localStorage.getItem(key);}catch{return null;}
}
function writeRaw(key,value){
 if(!hasStorage())return false;
 try{localStorage.setItem(key,value);return true;}catch{return false;}
}

// 从旧键迁移到账号键：整门课程的旧记录只迁移一次（迁移给第一个打开它的账号），
// 并记录认领标记。后续账号不得再继承，避免旧记录被静默分给多个账号。
function migrateLegacy(userId,courseId,lessonIds){
 const old=readRaw(legacyKey(courseId));
 if(!old)return null;
 const claimKey=CLAIM_PREFIX+courseOf(courseId);
 const claim=readRaw(claimKey);
 if(claim)return null;
 const key=accountKey(userId,courseId);
 const current=readRaw(key);
 if(current){writeRaw(claimKey,JSON.stringify({claimedBy:userId,at:new Date().toISOString(),reusedExisting:true}));return null;}
 const state=parseState(old,courseId,lessonIds);
 if(!state.lessons||!Object.keys(state.lessons).length)return null;
 const at=new Date().toISOString();
 const marked={...state,migratedFrom:'legacy-unscoped',migratedAt:at};
 if(!writeRaw(key,JSON.stringify(marked)))return null;
 writeRaw(claimKey,JSON.stringify({claimedBy:userId,at}));
 const sources=readSources();
 sources[userId]=sources[userId]||{};
 sources[userId][courseId]={from:'legacy-unscoped',at};
 writeSources(sources);
 try{localStorage.setItem(legacyKey(courseId),JSON.stringify({...state,migratedFrom:'legacy-unscoped',migratedAt:at}));}catch{}
 return marked;
}

export function createRecordStore({courseId,lessonIds,userId,userName,preview=false,fetchImpl=globalThis.fetch}){
 const key=accountKey(userId,courseId,preview);
 const scope=preview?'preview':'live';
 let pendingSync=null;
 let lastServerAt=null;
 let migrated=null;
 let lastError=null;
 let lastPushedAt=null;

 function readLocal(){
  const raw=readRaw(key);
  return parseState(raw,courseId,lessonIds);
 }
 function writeLocal(state){
  const ok=writeRaw(key,JSON.stringify({...state,updatedAt:new Date().toISOString()}));
  return ok;
 }

 const store={
  key,
  userId:userId||null,
  scope,
  get migrated(){return migrated;},
  // 同步状态：ok 表示最近一次云端操作成功，error 为给用户看的中文原因。
  get syncStatus(){return {ok:lastError===null&&lastPushedAt!==null,error:lastError,at:lastPushedAt,lastServerAt};},
  load(){
   migrated=migrateLegacy(userId,courseId,lessonIds);
   return readLocal();
  },
  save(state){
   const ok=writeLocal(state);
   if(ok&&!preview&&userId&&fetchImpl)store.push(state).catch(()=>{});
   return ok;
  },
  // 上报服务端。必须带会话校验令牌，否则服务端返回 403（CSRF_REJECTED）；
  // 令牌过期时刷新一次再重试。失败保留本地内容，等待下次再试，不静默丢弃。
  async push(state){
   if(preview||!userId||!fetchImpl)return false;
   for(let attempt=0;attempt<2;attempt++){
    const token=await sessionToken(fetchImpl,attempt>0);
    if(!token){lastError='未能取得会话校验令牌，请刷新页面后重新登录';return false;}
    try{
     const response=await fetchImpl('/api/teaching/student/records',{method:'PUT',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:JSON.stringify({courseId,state})});
     if(response.status===403&&attempt===0)continue;
     if(!response.ok){
      const payload=await response.json().catch(()=>null);
      lastError=payload?.error?.message||('云端保存失败（'+response.status+'）');
      return false;
     }
     const data=await response.json().catch(()=>({}));
     lastServerAt=data.updatedAt||null;
     lastPushedAt=lastServerAt||new Date().toISOString();
     lastError=null;
     return true;
    }catch(error){
     lastError='无法连接课程服务，记录已保存在本机';
     return false;
    }
   }
   lastError='云端保存失败，请刷新页面后重试';
   return false;
  },
  // 拉取服务端记录：登录后以服务端为准，实现跨设备同步。
  async pull(){
   if(preview||!userId||!fetchImpl)return null;
   try{
    const response=await fetchImpl('/api/teaching/student/records?course='+encodeURIComponent(courseId),{credentials:'same-origin',cache:'no-store'});
    if(!response.ok){
     const payload=await response.json().catch(()=>null);
     lastError=payload?.error?.message||('云端记录读取失败（'+response.status+'）');
     return null;
    }
    const data=await response.json().catch(()=>null);
    if(!data?.record?.state){lastError=null;return null;}
    lastServerAt=data.record.updatedAt||null;
    const remote=parseState(JSON.stringify(data.record.state),courseId,lessonIds);
    const local=readLocal();
    const remoteNotes=Object.values(remote.lessons||{}).reduce((n,l)=>n+(l.notes?.length||0),0);
    const localNotes=Object.values(local.lessons||{}).reduce((n,l)=>n+(l.notes?.length||0),0);
    // 远端记录为空而本地有内容时，以本地为准并回传，避免同步覆盖本地输入。
    if(remoteNotes===0&&localNotes>0){await store.push(local);return local;}
    if(remoteNotes<localNotes){await store.push(local);return local;}
    writeLocal(remote);
    lastError=null;
    lastPushedAt=lastServerAt;
    return remote;
   }catch{
    lastError='无法连接课程服务，已使用本机保存的记录';
    return null;
   }
  },
  get lastSyncedAt(){return lastServerAt;},
  get pending(){return pendingSync;},
  clear(){
   try{localStorage.removeItem(key);}catch{}
  },
 };

 return store;
}

// 纯工具：用于测试与复用
export function mergeStates(base,incoming){
 const out=createState(base.courseId);
 out.lastLessonId=incoming.lastLessonId||base.lastLessonId;
 for(const id of new Set([...Object.keys(base.lessons||{}),...Object.keys(incoming.lessons||{})])){
  const a=base.lessons?.[id]||{};
  const b=incoming.lessons?.[id]||{};
  out.lessons[id]={position:Math.max(a.position||0,b.position||0),duration:Math.max(a.duration||0,b.duration||0),
   completed:Boolean(a.completed||b.completed),
   notes:[...(a.notes||[]),...(b.notes||[])].filter((n,i,arr)=>arr.findIndex(x=>x.id===n.id)===i).slice(-100),
   videoUrl:b.videoUrl||a.videoUrl||null};
 }
 return out;
}
