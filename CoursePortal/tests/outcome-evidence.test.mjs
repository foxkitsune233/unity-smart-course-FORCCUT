import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {createOutcomeEvidence} from '../server/outcome-evidence.mjs';
test('versioned rubric matrix uses latest released evidence, validates references and marks insufficient samples',()=>{
 const db=new DatabaseSync(':memory:');try{db.exec(`CREATE TABLE tasks(id TEXT,class_id TEXT,status TEXT,rubric_json TEXT,title TEXT,course_revision INTEGER);CREATE TABLE submissions(id TEXT,task_id TEXT,student_id TEXT,attempt INTEGER,status TEXT,released INTEGER,rubric_scores_json TEXT,submitted_at TEXT);`);
 const run=(sql,...p)=>db.prepare(sql).run(...p),q=(sql,...p)=>db.prepare(sql).get(...p),all=(sql,...p)=>db.prepare(sql).all(...p);run('INSERT INTO tasks VALUES(?,?,?,?,?,?)','task','class','published',JSON.stringify([{id:'r',title:'操作',maxScore:40}]),'实验',2);
 const api=createOutcomeEvidence({q,all,run}),outcomes=[{id:'co',code:'CO1'}],links=[{outcomeId:'co',taskId:'task',rubricId:'r',weight:100}];
 assert.throws(()=>api.write({id:'class'},outcomes,{id:'teacher'},{expectedVersion:0,minSamples:1,links:[{...links[0],rubricId:'missing'}]}),e=>e.status===422);
 assert.equal(api.write({id:'class'},outcomes,{id:'teacher'},{expectedVersion:0,minSamples:1,links}).version,1);
 assert.throws(()=>api.write({id:'class'},outcomes,{id:'teacher'},{expectedVersion:0,minSamples:1,links}),e=>e.status===409);
 run('INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?)','old','task','student',1,'graded',1,JSON.stringify([{id:'r',score:40}]),'2026-01-01');
 run('INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?)','new','task','student',2,'graded',1,JSON.stringify([{id:'r',score:20}]),'2026-02-01');
 let report=api.calculate('class',outcomes,new URL('http://local/'));assert.equal(report.outcomes[0].achieved,50);assert.equal(report.submissionEvidence[0].submissionId,'new');assert.equal(report.matrix.version,1);
 api.write({id:'class'},outcomes,{id:'teacher'},{expectedVersion:1,minSamples:2,links});report=api.calculate('class',outcomes,new URL('http://local/'));assert.equal(report.outcomes[0].achieved,null);assert.equal(report.outcomes[0].evidenceStatus,'证据不足');
 report=api.calculate('class',outcomes,new URL('http://local/?from=2027-01-01'));assert.equal(report.submissionEvidence.length,0);assert.throws(()=>api.calculate('class',outcomes,new URL('http://local/?from=bad')),e=>e.status===422);
 assert.equal(q('SELECT COUNT(*) AS n FROM outcome_matrices').n,2);
 }finally{db.close();}
});
