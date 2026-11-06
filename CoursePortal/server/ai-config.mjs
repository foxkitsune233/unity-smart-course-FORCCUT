import {randomUUID} from 'node:crypto';
import {requireThat,HttpError} from './validation.mjs';

// 将明文密钥掩码，避免回传到前端
function maskKey(key){
 if(!key)return null;
 const s=String(key);
 if(s.length<=8)return '****';
 return s.slice(0,4)+'****'+s.slice(-4);
}

// 统一对话调用：ollama 走 /api/chat，openai 兼容协议走 /chat/completions
export async function aiChat(provider,messages,{maxTokens=800,signal=null}={}){
 requireThat(provider&&messages&&Array.isArray(messages)&&messages.length,422,'AI_BAD_INPUT','缺少对话内容');
 const base=(provider.base_url||'').replace(/\/+$/,'');
 try{
  if(provider.type==='ollama'){
   const r=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:signal||AbortSignal.timeout(60000),body:JSON.stringify({model:provider.model,messages,stream:false,options:{num_predict:maxTokens}})});
   requireThat(r.ok,503,'AI_FAILED','本地模型调用失败');
   const j=await r.json();
   return typeof j.message?.content==='string'?j.message.content:'';
  }
  requireThat(provider.api_key,422,'AI_NO_KEY','该云模型未配置 API Key');
  const r=await fetch(base+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+provider.api_key},signal:signal||AbortSignal.timeout(90000),body:JSON.stringify({model:provider.model,messages,stream:false,max_tokens:maxTokens})});
  requireThat(r.ok,503,'AI_FAILED','云模型调用失败（HTTP '+r.status+'）');
  const j=await r.json();
  return j.choices?.[0]?.message?.content||'';
 }catch(error){
  if(error instanceof HttpError)throw error;
  throw new HttpError(503,'AI_FAILED','模型服务不可用或超时');
 }
}

// 将引擎 id 解析为 provider 对象；'ollama:模型名' 或 'cloud:providerId'
export async function resolveEngine(db,q,engine){
 if(!engine)return null;
 if(engine.startsWith('ollama:'))return {type:'ollama',base_url:'http://127.0.0.1:11434',model:engine.slice('ollama:'.length)};
 if(engine.startsWith('cloud:')){const row=q('SELECT * FROM ai_providers WHERE id=? AND enabled=1',engine.slice('cloud:'.length));requireThat(row,422,'ENGINE_UNAVAILABLE','所选云模型不可用');return {type:row.type,base_url:row.base_url,model:row.model,api_key:row.api_key};}
 throw new HttpError(422,'ENGINE_UNAVAILABLE','未知的模型引擎');
}

export function createAiConfig({db,q,all,run,needUser,bodyOf,audit}){
 db.exec(`CREATE TABLE IF NOT EXISTS ai_providers(id TEXT PRIMARY KEY,name TEXT NOT NULL,type TEXT NOT NULL,base_url TEXT NOT NULL,model TEXT NOT NULL,api_key TEXT NOT NULL DEFAULT '',enabled INTEGER NOT NULL DEFAULT 1,owner_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`);
 const teacher=user=>requireThat(user.global_role!=='student',403,'FORBIDDEN','学生账号不能管理 AI 模型');
 const toMeta=row=>({id:row.id,name:row.name,type:row.type,base_url:row.base_url,model:row.model,enabled:!!row.enabled,hasKey:!!row.api_key,maskedKey:maskKey(row.api_key)});
 const getRow=id=>{const row=q('SELECT * FROM ai_providers WHERE id=?',id);requireThat(row,404,'NOT_FOUND','模型配置不存在');return row;};
 const at=()=>new Date().toISOString();
 return async ctx=>{
  if(!ctx.pathname.startsWith('/api/ai/'))return false;
  const user=needUser(ctx.session);
  const send=(s,v)=>{ctx.json(s,v);return true;};
  const parts=ctx.pathname.slice('/api/ai/'.length).split('/').filter(Boolean);
  const method=ctx.method;
  const b=['POST','PUT','PATCH'].includes(method)?await bodyOf(ctx.req):{};
  // 可用引擎列表（本地模型 + 已启用云模型），不暴露密钥
  if(parts[0]==='engines'&&method==='GET'){
   teacher(user);
   const engines=[];
   try{const r=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(2000)});if(r.ok)for(const m of (await r.json()).models||[])engines.push({id:'ollama:'+m.name,kind:'ollama',label:'本地 · '+m.name});}catch{}
   for(const row of all('SELECT * FROM ai_providers WHERE enabled=1'))engines.push({id:'cloud:'+row.id,kind:'cloud',label:row.name+' · '+row.model});
   if(!engines.length)engines.push({id:'',kind:'template',label:'仅使用课程结构模板（无需模型）'});
   return send(200,{engines});
  }
  if(parts[0]==='providers'){
   if(!parts[1]&&method==='GET'){teacher(user);return send(200,{providers:all('SELECT * FROM ai_providers ORDER BY created_at DESC').map(toMeta)});}
   if(parts[1]&&parts[2]==='test'&&method==='POST'){
    teacher(user);const row=getRow(parts[1]);
    const sample=await aiChat({type:row.type,base_url:row.base_url,model:row.model,api_key:row.api_key},[{role:'user',content:'请用一句话说明你能协助完成什么工作。'}],{maxTokens:80});
    return send(200,{ok:true,sample:sample.slice(0,160)});
   }
   if(parts[1]&&method==='DELETE'){teacher(user);getRow(parts[1]);run('DELETE FROM ai_providers WHERE id=?',parts[1]);return send(200,{ok:true});}
   if(method==='POST'){
    teacher(user);
    const id=(typeof b.id==='string'&&b.id.trim())?b.id.trim():'prov-'+randomUUID();
    requireThat(typeof b.name==='string'&&b.name.trim()&&b.name.length<=80,422,'INVALID','请填写模型名称');
    requireThat(['ollama','openai-compatible'].includes(b.type),422,'INVALID','不支持的模型类型');
    requireThat(typeof b.model==='string'&&b.model.trim(),422,'INVALID','请填写模型名称/ID');
    let base_url=(b.base_url||'').trim();
    if(b.type==='ollama'){base_url=base_url||'http://127.0.0.1:11434';}
    else{requireThat(/^https?:\/\//i.test(base_url),422,'INVALID','请填写合法的 API 地址（含 http/https）');}
    const existing=parts[1]?q('SELECT * FROM ai_providers WHERE id=?',parts[1]):null;
    let api_key=existing?existing.api_key:'';
    if(typeof b.api_key==='string'&&b.api_key.trim())api_key=b.api_key.trim();
    requireThat(b.type!=='openai-compatible'||api_key,422,'INVALID','云模型必须填写 API Key');
    const enabled=b.enabled===false?0:1,now=at();
    if(existing){run('UPDATE ai_providers SET name=?,type=?,base_url=?,model=?,api_key=?,enabled=?,updated_at=? WHERE id=?',b.name.trim(),b.type,base_url,b.model.trim(),api_key,enabled,now,existing.id);}
    else{run('INSERT INTO ai_providers VALUES(?,?,?,?,?,?,?,?,?,?)',id,b.name.trim(),b.type,base_url,b.model.trim(),api_key,enabled,user.id,now,now);}
    if(audit)audit(user,'ai.provider.'+(existing?'updated':'created'),id);
    return send(existing?200:201,{provider:toMeta(getRow(existing?existing.id:id))});
   }
  }
  return false;
 };
}
