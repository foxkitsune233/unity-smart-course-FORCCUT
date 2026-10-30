import test from 'node:test';import assert from 'node:assert/strict';
import {labEntryUrl} from '../task-links.mjs';

test('任务实验入口带上实验、任务与班级，按章节打开对应模板',()=>{
 const url=labEntryUrl({id:'task-1',classId:'class-9',labId:'lab03'});
 assert.equal(url,'/lab/?lab=lab03&task=task-1&class=class-9');
 const params=new URL(url,'http://portal.local').searchParams;
 assert.equal(params.get('lab'),'lab03');
 assert.equal(params.get('task'),'task-1');
 assert.equal(params.get('class'),'class-9');
});
test('不同章节的任务不会落到同一个默认实验',()=>{
 const urls=['lab01','lab02','lab03','lab04'].map(labId=>labEntryUrl({id:'t-'+labId,classId:'c1',labId}));
 assert.equal(new Set(urls).size,4);
 assert.ok(urls.every(url=>url.startsWith('/lab/?lab=lab0')));
});
test('没有实验标识或标识非法时不生成入口',()=>{
 assert.equal(labEntryUrl({id:'t',classId:'c'}),null);
 assert.equal(labEntryUrl({id:'t',classId:'c',labId:''}),null);
 assert.equal(labEntryUrl({id:'t',classId:'c',labId:'../lab05'}),null);
 assert.equal(labEntryUrl(null),null);
});
