import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';

const client = await import('../api-client.mjs').catch(()=>null);
const editor = await import('../teacher.mjs').catch(()=>null);

test('login return URLs stay on the same local site',()=>{
  assert.ok(client, 'API client is implemented');
  for(const value of ['https://evil.test','//evil.test','/\\evil.test','javascript:alert(1)','%2f%2fevil.test','/api/logout']) assert.equal(client.safeNext(value),null);
  assert.equal(client.safeNext('teacher.html?course=unity-script-2021'),'teacher.html?course=unity-script-2021');
  assert.equal(client.safeNext('/admin.html'),'/admin.html');
});

test('client carries session CSRF to writes and preserves structured conflicts',async()=>{
  assert.ok(client, 'API client is implemented');
  const server=createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json');
    if(req.url==='/api/session') return res.end(JSON.stringify({user:{id:'t1',globalRole:'teacher'},csrfToken:'token-from-session'}));
    if(req.method==='PUT'&&req.headers['x-csrf-token']==='token-from-session'){
      res.statusCode=409; return res.end(JSON.stringify({error:{code:'REVISION_CONFLICT',message:'已有新版本',details:{revision:5}}}));
    }
    res.statusCode=403;res.end(JSON.stringify({error:{code:'CSRF',message:'缺少令牌'}}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const api=client.createApi({baseUrl:`http://127.0.0.1:${server.address().port}`});
    await api.request('/api/session');
    await assert.rejects(api.request('/api/manage/courses/test',{method:'PUT',body:{expectedRevision:4}}),error=>error.status===409&&error.code==='REVISION_CONFLICT'&&error.details.revision===5);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('course input changes retain nullable hours, arrays and independent goal ids',()=>{
  assert.ok(editor,'Course editor is implemented');
  const course=editor.prepareDraft({id:'test',title:'课程',chapters:[],outcomes:[{id:'goal-one',code:'K1',description:'理解组件',type:'knowledge',assessmentMode:'qualitative'}]});
  editor.updateDraftField(course,'hours','','nullableNumber');
  assert.equal(course.hours,null);
  editor.updateDraftField(course,'hours','24','nullableNumber');
  assert.equal(course.hours,24);
  editor.updateDraftField(course,'outcomes.0.description','解释对象与组件','text');
  assert.equal(course.outcomes[0].id,'goal-one');
  assert.equal(course.outcomes[0].description,'解释对象与组件');
  editor.updateDraftField(course,'book.authors','甲\n乙','lines');
  assert.deepEqual(course.book.authors,['甲','乙']);
});

test('course preparation does not mutate the source or invent confirmed hours',()=>{
  assert.ok(editor,'Course editor is implemented');
  const source={id:'test',title:'课程',chapters:[{id:'c1',number:1,title:'第一章',lessons:[{id:'l1',title:'课时一'}]}]};
  const draft=editor.prepareDraft(source);
  assert.equal(draft.hours,null);
  draft.chapters[0].lessons[0].title='已修改';
  assert.equal(source.chapters[0].lessons[0].title,'课时一');
  assert.deepEqual(draft.outcomes,[]);
});
