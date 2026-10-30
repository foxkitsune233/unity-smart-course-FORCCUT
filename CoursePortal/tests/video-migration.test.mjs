import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createStore} from '../server/store.mjs';import {flattenLessons} from '../school-curriculum.mjs';
const migration=await import('../server/attach-course-videos.mjs').catch(()=>null);
test('video attachment updates only empty resources and is idempotent with snapshots intact',()=>{
 assert.ok(migration,'video migration module exists');const dir=mkdtempSync(path.join(os.tmpdir(),'unity-videos-test-'));const store=createStore(dir,{teacher:{username:'teacher',password:'Test-only-923!'}});
 try{const row=store.q('SELECT * FROM courses LIMIT 1'),old=store.getDraft(row);for(const l of flattenLessons(old,true))delete l.video.resources;
 old.chapters[0].lessons[0].video.src='https://example.test/teacher.mp4';const custom={...structuredClone(store.seedCourse.chapters[1].lessons[0].video.resources[0]),id:'custom'};old.chapters[1].lessons[0].video.resources=[custom];
 store.run('UPDATE courses SET draft_json=?,published_revision=1 WHERE id=?',JSON.stringify(old),row.id);store.run('INSERT INTO published_versions VALUES(?,?,?,?)',row.id,1,JSON.stringify(old),new Date().toISOString());
 const result=migration.applyCourseVideos(store);assert.equal(result.changed,true);assert.equal(result.revision,2);assert.equal(result.publishedRevision,1);
 const current=store.getDraft(store.q('SELECT * FROM courses WHERE id=?',row.id));assert.equal(current.chapters[0].lessons[0].video.src,'https://example.test/teacher.mp4');assert.ok(current.chapters[0].lessons[0].video.resources.length);assert.deepEqual(current.chapters[1].lessons[0].video.resources,[custom]);assert.ok(current.curriculum.optionalChapters[0].lessons[0].video.resources.length);
 assert.equal(store.q('SELECT payload FROM published_versions WHERE course_id=?',row.id).payload,JSON.stringify(old));assert.equal(migration.applyCourseVideos(store).changed,false);assert.equal(store.q('SELECT count(*) AS n FROM audit').n,1);
 const before=store.getDraft(store.q('SELECT * FROM courses WHERE id=?',row.id));before.chapters[0].lessons[0].video.resources.pop();store.run('UPDATE courses SET draft_json=? WHERE id=?',JSON.stringify(before),row.id);
 const merged=migration.applyCourseVideos(store,{merge:true});assert.equal(merged.changed,true);assert.equal(merged.revision,3);const after=store.getDraft(store.q('SELECT * FROM courses WHERE id=?',row.id));assert.equal(after.chapters[1].lessons[0].video.resources[0].id,'custom');assert.equal(after.chapters[0].lessons[0].video.src,'https://example.test/teacher.mp4');assert.equal(migration.applyCourseVideos(store,{merge:true}).changed,false);
 }finally{store.db.close();rmSync(dir,{recursive:true,force:true});}
});
