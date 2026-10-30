import test from 'node:test';
import assert from 'node:assert/strict';
import {course} from '../course-data.mjs';
import {validateCourse,validatePublication} from '../server/validation.mjs';
const school=await import('../school-curriculum.mjs').catch(()=>null);

test('confirmed curriculum uses3D physics animation andAI with the same teaching pace',()=>{
 const teaching=structuredClone(course);for(const ch of [...teaching.chapters,...teaching.curriculum.optionalChapters])for(const l of ch.lessons)delete l.video;const content=JSON.stringify(teaching);assert.doesNotMatch(content,/2D|Rigidbody2D|Collider2D|Tilemap/);
 assert.match(course.subtitle,/3D/);assert.match(course.chapters[2].title,/3D/);
 assert.ok(course.chapters[2].lessons[0].keypoints.some(p=>p.includes('Rigidbody')));
 assert.match(course.chapters[5].title,/3D/);assert.match(course.chapters[8].title,/3D/);
 assert.equal(course.hours,48);assert.equal(course.chapters.length,11);
});

test('school curriculum has11 teaching chapters and48 required hours with elective outside',()=>{
 assert.equal(course.chapters.length,11);assert.equal(course.hours,48);
 assert.equal(course.chapters.reduce((n,ch)=>n+ch.hours,0),44);
 assert.equal(course.curriculum.assessments.reduce((n,a)=>n+a.hours,0),4);
 assert.equal(course.curriculum.optionalChapters[0].hours,2);
 assert.deepEqual(course.chapters.map(ch=>ch.hours),[4,4,6,2,4,4,4,4,4,2,6]);
 assert.match(course.curriculum.prerequisites,/C#/);
});
test('textbook mapping preserves all13 lesson identifiers including optional resources',()=>{
 assert.ok(school);const all=school.flattenLessons(course,true),required=school.flattenLessons(course,false);
 assert.equal(required.length,12);assert.equal(all.length,13);assert.equal(new Set(all.map(l=>l.id)).size,13);
 assert.deepEqual(all.map(l=>l.id).sort(),Array.from({length:13},(_,i)=>'lesson-'+String(i+1).padStart(2,'0')));
 assert.deepEqual(course.chapters[6].textbookChapters,[7,8]);
 assert.deepEqual(course.chapters[7].textbookChapters,[10]);assert.deepEqual(course.chapters[9].textbookChapters,[13]);
 assert.equal(all.find(l=>l.id==='lesson-09').optional,true);
 assert.equal(all.find(l=>l.id==='lesson-10').chapterNumber,8);
});
test('saved course roundtrip retains school mappings assessments and elective videos',()=>{
 const input=structuredClone(course);input.outcomes=[];input.curriculum.optionalChapters[0].lessons[0].video.src='https://example.test/elective.mp4';
 const normalized=validateCourse(input,input.id);
 assert.deepEqual(normalized.curriculum,input.curriculum);
 assert.equal(normalized.chapters[2].hours,6);assert.equal(normalized.chapters[2].knowledgeCode,'GD03');
 assert.equal(normalized.curriculum.optionalChapters[0].lessons[0].video.src,'https://example.test/elective.mp4');
});
test('publication rejects inconsistent allocated school hours',()=>{
 const input=structuredClone(course);input.hours=47;input.outcomes=[{id:'goal',code:'CO1',description:'理解对象',type:'knowledge',assessmentMode:'qualitative'}];
 assert.throws(()=>validatePublication(input),e=>e.status===422&&e.details.some(x=>x.includes('学时')));
});
test('alignment retains resources outcomes and custom lessons without mutating prior source',()=>{
 assert.ok(school);const old=structuredClone(school.textbookCourse);old.outcomes=[{id:'goal',code:'CO1'}];
 old.chapters[0].lessons[0].video.src='https://example.test/teacher.mp4';
 old.chapters[8].lessons[0].video.resourceId='video-res-9';
 old.chapters[2].lessons.push({...structuredClone(old.chapters[2].lessons[0]),id:'teacher-extra',title:'教师补充'});
 const aligned=school.alignSchoolCourse(old);
 assert.equal(aligned.hours,48);assert.equal(aligned.chapters[0].lessons[0].video.src,'https://example.test/teacher.mp4');
 assert.equal(aligned.curriculum.optionalChapters[0].lessons[0].video.resourceId,'video-res-9');
 assert.equal(aligned.chapters[2].lessons.at(-1).id,'teacher-extra');assert.deepEqual(aligned.outcomes,old.outcomes);
 assert.equal(old.chapters.length,13);assert.equal(old.chapters[8].number,9);
});
test('optional lesson URLs and ids receive the same validation as required content',()=>{
 const input=structuredClone(course);input.outcomes=[];
 input.curriculum.optionalChapters[0].lessons[0].video.src='javascript:alert(1)';
 assert.throws(()=>validateCourse(input,input.id),e=>e.status===422);
});
test('alignment preserves disabled practice and its saved destination without reopening it',()=>{
 assert.ok(school);const old=structuredClone(school.textbookCourse);
 old.chapters[0].lessons[0].practice.available=false;
 old.chapters[2].lessons[0].practice={available:false,title:'教师保留的2D实验',url:'https://example.test/disabled-lab'};
 const aligned=school.alignSchoolCourse(old);
 assert.equal(aligned.chapters[0].lessons[0].practice.available,false);
 assert.deepEqual(aligned.chapters[2].lessons[0].practice,old.chapters[2].lessons[0].practice);
});
