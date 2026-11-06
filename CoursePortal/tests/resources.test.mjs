import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createApp} from '../server/app.mjs';

test('TC04 课件/素材统一资源库：来源授权必填、审核状态机、发布下架、独立版本与不可变快照',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'unity-resources-test-')),credentials={teacher:{username:'teacher',password:'Teacher-res-923!'},student:{username:'student',password:'Student-res-923!'}},app=createApp({dataDir:dir,bootstrap:credentials});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+app.server.address().port;
 async function call(url,session,body,method='POST'){
  const r=await fetch(base+url,{method:body===undefined?'GET':method,headers:{'Content-Type':'application/json',...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrfToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};
 }
 async function login(role){const r=await call('/api/login',null,credentials[role]);assert.equal(r.status,200);return {...r.data,cookie:r.cookie.split(';')[0]};}
 const teacher=await login('teacher'),student=await login('student');
 const cls=(await call('/api/teaching/classes',teacher,{courseId:'unity-script-2021',name:'Resources test'})).data.class;
 await call('/api/teaching/classes/'+cls.id+'/roster',teacher,{rows:[{username:'student',studentNo:'1',name:'S'}]});

 const valid={courseId:'unity-script-2021',kind:'courseware',title:'第3章 Transform 课件',url:'https://example.edu/ch3.pptx',source:'课程组自制·李坤煜',authorization:'CC BY-NC 4.0，仅限本课程教学使用',summary:'组件与坐标系'};
 // 1. 来源与授权为必填，危险地址被拒，学生不能写入。
 assert.equal((await call('/api/resources',teacher,{...valid,source:''})).data.error.code,'SOURCE_REQUIRED');
 assert.equal((await call('/api/resources',teacher,{...valid,authorization:''})).data.error.code,'AUTHORIZATION_REQUIRED');
 assert.equal((await call('/api/resources',teacher,{...valid,url:'javascript:alert(1)'})).data.error.code,'INVALID_URL');
 assert.equal((await call('/api/resources',teacher,{...valid,url:'//evil.example/x'})).data.error.code,'INVALID_URL');
 assert.equal((await call('/api/resources',student,valid)).status,403);
 const created=await call('/api/resources',teacher,valid);
 assert.equal(created.status,201);
 const id=created.data.item.id;
 assert.equal(created.data.item.status,'draft');assert.equal(created.data.item.version,1);
 assert.equal((await call('/api/resources',teacher,valid)).data.error.code,'RESOURCE_EXISTS');

 // 2. 学生只能看到已发布资源；未发布时列表为空、详情 404。
 const baseQuery='?courseId=unity-script-2021';
 assert.equal((await call('/api/resources'+baseQuery,student)).data.items.length,0);
 assert.equal((await call('/api/resources/'+id+baseQuery,student)).status,404);
 assert.equal((await call('/api/resources/'+id+'/submit'+baseQuery,student,{})).status,403);

 // 3. 状态机：draft → pending → approved → published，跳过审核不能发布。
 assert.equal((await call('/api/resources/'+id+'/publish'+baseQuery,teacher,{})).data.error.code,'INVALID_STATUS');
 assert.equal((await call('/api/resources/'+id+'/submit'+baseQuery,teacher,{})).data.item.status,'pending');
 assert.equal((await call('/api/resources/'+id+'/review'+baseQuery,teacher,{decision:'reject'})).data.error.code,'REASON_REQUIRED');
 const approved=await call('/api/resources/'+id+'/review'+baseQuery,teacher,{decision:'approve'});
 assert.equal(approved.data.item.status,'approved');assert.equal(approved.data.item.reviewedBy,'teacher');
 assert.equal((await call('/api/resources'+baseQuery,student)).data.items.length,0);
 const published=await call('/api/resources/'+id+'/publish'+baseQuery,teacher,{});
 assert.equal(published.data.item.status,'published');assert.ok(published.data.item.publishedAt);
 const visible=(await call('/api/resources'+baseQuery,student)).data.items;
 assert.equal(visible.length,1);assert.equal(visible[0].id,id);assert.equal(visible[0].source,valid.source);
 assert.equal((await call('/api/resources/'+id+baseQuery,student)).status,200);

 // 4. 内容编辑生成新版本并退回草稿（已发布内容不会被静默替换），历史快照不可变。
 const revised=await call('/api/resources/'+id+baseQuery,teacher,{...valid,title:'第3章 Transform 课件（修订）',summary:'新增实践环节'},'PUT');
 assert.equal(revised.status,200);assert.equal(revised.data.item.version,2);assert.equal(revised.data.item.status,'draft');
 assert.equal((await call('/api/resources'+baseQuery,student)).data.items.length,0);
 const history=await call('/api/resources/'+id+'/history'+baseQuery,teacher);
 assert.equal(history.status,200);assert.equal(history.data.items.length,2);
 assert.equal(history.data.items[0].version,1);assert.equal(history.data.items[0].snapshot.title,valid.title);
 assert.equal(history.data.items[1].current,true);
 assert.equal((await call('/api/resources/'+id+'/history'+baseQuery,student)).status,403);

 // 5. 回溯恢复按 v1 内容生成 v3，历史仍保留 3 条。
 const restored=await call('/api/resources/'+id+'/restore'+baseQuery,teacher,{version:1});
 assert.equal(restored.status,200);assert.equal(restored.data.item.version,3);
 assert.equal(restored.data.item.title,valid.title);assert.equal(restored.data.item.status,'draft');
 assert.equal((await call('/api/resources/'+id+'/restore'+baseQuery,teacher,{version:99})).data.error.code,'VERSION_NOT_FOUND');
 assert.equal((await call('/api/resources/'+id+'/history'+baseQuery,teacher)).data.items.length,3);

 // 6. 发布后的下架与重新发布；已发布资源不能删除。
 await call('/api/resources/'+id+'/submit'+baseQuery,teacher,{});
 await call('/api/resources/'+id+'/review'+baseQuery,teacher,{decision:'approve'});
 await call('/api/resources/'+id+'/publish'+baseQuery,teacher,{});
 assert.equal((await call('/api/resources/'+id+'/offline'+baseQuery,teacher,{})).data.error.code,'REASON_REQUIRED');
 const offline=await call('/api/resources/'+id+'/offline'+baseQuery,teacher,{note:'课件需替换，暂时下架'});
 assert.equal(offline.data.item.status,'offline');assert.equal(offline.data.item.reviewNote,'课件需替换，暂时下架');
 assert.equal((await call('/api/resources'+baseQuery,student)).data.items.length,0);
 assert.equal((await call('/api/resources/'+id+'/publish'+baseQuery,teacher,{})).data.item.status,'published');
 assert.equal((await call('/api/resources/'+id+baseQuery,teacher,{},'DELETE')).data.error.code,'RESOURCE_IN_USE');

 // 7. 草稿可删除；删除后版本历史仍作为审计留痕。
 const draft=(await call('/api/resources',teacher,{...valid,title:'临时草稿'})).data.item;
 assert.equal((await call('/api/resources/'+draft.id+baseQuery,teacher,{},'DELETE')).status,200);
 assert.equal((await call('/api/resources/'+draft.id+baseQuery,teacher)).status,404);
 const report=await call('/api/resources'+baseQuery,teacher);
 assert.equal(report.data.summary.published,1);
});
