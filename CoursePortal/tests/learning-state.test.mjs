import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,parseState,lessonRecord,recordPlayback,markCompleted,addNote,removeNote,setVideoUrl,summarize} from '../learning-state.mjs';

test('invalid or foreign persisted state starts clean',()=>{
  assert.equal(parseState('{broken','course-a',['one']).courseId,'course-a');
  const foreign=createState('course-b');foreign.lastLessonId='one';
  assert.equal(parseState(JSON.stringify(foreign),'course-a',['one']).lastLessonId,null);
});

test('prototype-looking lesson ids never resolve to inherited records',()=>{
  const state=createState('course-a');
  for(const id of ['constructor','__proto__','toString'])assert.equal(lessonRecord(state,id).notes.length,0);
});
test('playback clamps to duration and keeps other lessons independent',()=>{
  const original=createState('course-a');
  const next=recordPlayback(original,'one',99,30);
  assert.equal(lessonRecord(next,'one').position,30);
  assert.equal(lessonRecord(next,'two').position,0);
  assert.equal(lessonRecord(original,'one').duration,0);
});
test('completion summary counts known lessons only',()=>{
  let state=markCompleted(createState('course-a'),'one',true);
  state=markCompleted(state,'unknown',true);
  assert.deepEqual(summarize(state,['one','two']),{completed:1,total:2,percent:50,notes:0});
});
test('notes retain text and lesson position through reload',()=>{
  let state=addNote(createState('course-a'),'one','  碰撞体负责接触检测  ',42);
  state=parseState(JSON.stringify(state),'course-a',['one','two']);
  const note=lessonRecord(state,'one').notes[0];
  assert.equal(note.text,'碰撞体负责接触检测');assert.equal(note.time,42);
  assert.equal(lessonRecord(state,'two').notes.length,0);
  const removed=removeNote(state,'one',note.id);assert.equal(lessonRecord(removed,'one').notes.length,0);
});
test('empty notes are ignored and nonfinite time becomes zero',()=>{
  let state=addNote(createState('course-a'),'one','  ',NaN);
  assert.equal(lessonRecord(state,'one').notes.length,0);
  state=addNote(state,'one','原点',Infinity);assert.equal(lessonRecord(state,'one').notes[0].time,0);
});
test('video URL accepts http sources and rejects executable schemes',()=>{
  assert.throws(()=>setVideoUrl(createState('course-a'),'one','javascript:alert(1)'));
  let state=recordPlayback(createState('course-a'),'one',8,20);
  state=setVideoUrl(state,'one','http://127.0.0.1:8089/test.webm');
  assert.equal(lessonRecord(state,'one').videoUrl,'http://127.0.0.1:8089/test.webm');
  assert.equal(lessonRecord(state,'one').position,0);
});
test('parser preserves archived lesson records and sanitizes poisoned fields',()=>{
  const raw={version:1,courseId:'course-a',lastLessonId:'unknown',lessons:{one:{position:-4,duration:NaN,completed:'yes',videoUrl:'data:text/html,bad',notes:[{id:'x',text:'保留笔记',time:-3}]},unknown:{completed:true}}};
  const state=parseState(JSON.stringify(raw),'course-a',['one']);
  assert.equal(state.lastLessonId,null);assert.equal(state.lessons.unknown.completed,true);
  const one=lessonRecord(state,'one');assert.equal(one.position,0);assert.equal(one.completed,false);assert.equal(one.videoUrl,null);assert.equal(one.notes[0].time,0);
});

test('temporarily removed lessons retain notes when the catalog changes',()=>{
  const original=addNote(createState('course-a'),'two','保留已发布课时的笔记',0);
  const reduced=parseState(JSON.stringify(original),'course-a',['one']);
  assert.equal(summarize(reduced,['one']).notes,0);
  const restored=parseState(JSON.stringify(reduced),'course-a',['one','two']);
  assert.equal(lessonRecord(restored,'two').notes[0].text,'保留已发布课时的笔记');
});
