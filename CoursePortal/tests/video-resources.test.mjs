import test from 'node:test';import assert from 'node:assert/strict';
import {schoolCourse,flattenLessons} from '../school-curriculum.mjs';
import {validateCourse} from '../server/validation.mjs';
const video=await import('../video-resources.mjs').catch(()=>null);
const sample={id:'bili-BV1zB4y1C7U9-p6',provider:'bilibili',bvid:'BV1zB4y1C7U9',cid:100,page:6,title:'安装Unity',author:'siki学院',duration:853,versionNote:'经典API，使用Unity2021对照',topics:['环境配置'],verifiedAt:'2026-10-27'};
test('official player URL pins exact part and never autoplays',()=>{
 assert.ok(video);const url=new URL(video.bilibiliPlayerUrl(sample));assert.equal(url.origin,'https://player.bilibili.com');assert.equal(url.searchParams.get('cid'),'100');assert.equal(url.searchParams.get('p'),'6');assert.equal(url.searchParams.get('autoplay'),'0');
 assert.equal(new URL(video.videoSourceUrl(sample)).searchParams.get('p'),'6');
});
test('invalid provider ids duplicate resources and forged URLs are rejected',()=>{
 assert.ok(video);for(const change of [{provider:'evil'},{bvid:'https://evil.test/'},{cid:-1},{page:0},{duration:NaN},{id:'<script>'}])assert.throws(()=>video.normalizeVideoResources([{...sample,...change}]));
 assert.throws(()=>video.normalizeVideoResources([sample,sample]));
});
test('video lists survive canonical course save with safe source metadata',()=>{
 const c=structuredClone(schoolCourse);c.chapters[0].lessons[0].video.resources=[sample];
 const normalized=validateCourse(c,c.id);assert.deepEqual(normalized.chapters[0].lessons[0].video.resources,[sample]);
 c.chapters[0].lessons[0].video.resources[0].bvid='javascript:alert(1)';assert.throws(()=>validateCourse(c,c.id),e=>e.status===422);
});
test('all11 teaching chapters and optional unit contain concrete playable video parts',()=>{
 for(const ch of schoolCourse.chapters)for(const lesson of ch.lessons)assert.ok(lesson.video.resources?.length,lesson.id+' has real video parts');
 assert.ok(schoolCourse.curriculum.optionalChapters[0].lessons[0].video.resources?.length);
 const all=flattenLessons(schoolCourse,true).flatMap(l=>l.video.resources);
 assert.ok(all.length>=40);assert.ok(all.every(r=>r.cid>0&&r.page>0&&r.duration>0&&r.author&&r.verifiedAt));
});
