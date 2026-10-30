import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createStore} from '../server/store.mjs';import {textbookCourse} from '../textbook-course.mjs';
import {schoolCourse} from '../school-curriculum.mjs';
const migration=await import('../server/align-school-curriculum.mjs').catch(()=>null);
test('alignment creates one draft revision, preserves published snapshot and is repeat safe',()=>{
 assert.ok(migration);const dir=mkdtempSync(path.join(os.tmpdir(),'unity-curriculum-test-'));let store;
 try{
  store=createStore(dir,{teacher:{username:'teacher',password:'Teacher-test-923!'}});
  const old={...structuredClone(textbookCourse),hours:null,outcomes:[]};
  store.run('UPDATE courses SET draft_json=?,revision=1,published_revision=1 WHERE id=?',JSON.stringify(old),old.id);
  store.run('INSERT INTO published_versions VALUES(?,?,?,?)',old.id,1,JSON.stringify(old),new Date().toISOString());
  const result=migration.applySchoolAlignment(store);assert.equal(result.revision,2);
  const row=store.q('SELECT * FROM courses WHERE id=?',old.id);assert.equal(store.getDraft(row).chapters.length,11);assert.equal(row.published_revision,1);
  assert.equal(JSON.parse(store.q('SELECT payload FROM published_versions WHERE course_id=? AND revision=1',old.id).payload).chapters.length,13);
  assert.equal(migration.applySchoolAlignment(store).changed,false);assert.equal(store.q('SELECT revision FROM courses WHERE id=?',old.id).revision,2);
 }finally{store?.db.close();assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'unity-curriculum-test-'));rmSync(dir,{recursive:true,force:true});}
});

test('prior2D curriculum is upgraded to3D without reopening disabled practice',()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'unity-curriculum-test-'));let store;
 try{
  store=createStore(dir,{teacher:{username:'teacher',password:'Teacher-test-923!'}});
  const previous=structuredClone(schoolCourse);previous.curriculum.id='school-unity-2026-48';previous.chapters[2].title='物理系统（2D重点）';
  previous.chapters[0].lessons[0].practice={available:false,title:'3D小球预备实验（现有）；2D吃金币练习待配置',url:'https://example.test/saved-lab'};
  store.run('UPDATE courses SET draft_json=? WHERE id=?',JSON.stringify(previous),previous.id);
  assert.equal(migration.applySchoolAlignment(store).changed,true);
  const current=store.getDraft(store.q('SELECT * FROM courses WHERE id=?',previous.id));
  assert.match(current.curriculum.id,/-3d$/);assert.match(current.chapters[2].title,/3D/);
  assert.equal(current.chapters[0].lessons[0].practice.available,false);assert.equal(current.chapters[0].lessons[0].practice.url,'https://example.test/saved-lab');
  assert.doesNotMatch(current.chapters[0].lessons[0].practice.title,/2D/);assert.equal(current.hours,48);
 }finally{store?.db.close();assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'unity-curriculum-test-'));rmSync(dir,{recursive:true,force:true});}
});
