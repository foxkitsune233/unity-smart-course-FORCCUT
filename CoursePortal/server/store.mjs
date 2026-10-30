import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {course as seedCourse} from '../course-data.mjs';
import {teachingSchema} from './teaching-schema.mjs';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function passwordHash(password,salt=randomBytes(16).toString('hex')){return salt+':'+scryptSync(password,salt,64).toString('hex');}
export function passwordMatches(password,hash){const [salt,value]=hash.split(':');const actual=scryptSync(password,salt,64);return timingSafeEqual(actual,Buffer.from(value,'hex'));}
export function createStore(dataDir,bootstrap){
 mkdirSync(dataDir,{recursive:true});const db=new DatabaseSync(path.join(dataDir,'portal.sqlite'));db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,global_role TEXT NOT NULL,password_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS courses(id TEXT PRIMARY KEY,draft_json TEXT NOT NULL,revision INTEGER NOT NULL,published_revision INTEGER,published_at TEXT,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS course_members(course_id TEXT NOT NULL REFERENCES courses(id),user_id TEXT NOT NULL REFERENCES users(id),role TEXT NOT NULL,PRIMARY KEY(course_id,user_id));
 CREATE TABLE IF NOT EXISTS course_outcomes(course_id TEXT NOT NULL REFERENCES courses(id),revision INTEGER NOT NULL,id TEXT NOT NULL,code TEXT NOT NULL,description TEXT NOT NULL,type TEXT NOT NULL,assessment_mode TEXT NOT NULL,PRIMARY KEY(course_id,revision,id),UNIQUE(course_id,revision,code));
 CREATE TABLE IF NOT EXISTS published_versions(course_id TEXT NOT NULL REFERENCES courses(id),revision INTEGER NOT NULL,payload TEXT NOT NULL,published_at TEXT NOT NULL,PRIMARY KEY(course_id,revision));
 CREATE TRIGGER IF NOT EXISTS published_immutable_update BEFORE UPDATE ON published_versions BEGIN SELECT RAISE(ABORT,'published versions are immutable'); END;
 CREATE TRIGGER IF NOT EXISTS published_immutable_delete BEFORE DELETE ON published_versions BEGIN SELECT RAISE(ABORT,'published versions are immutable'); END;
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,object_id TEXT NOT NULL);`);
 db.exec(teachingSchema);
 // 迁移：早期建表可能缺少后续新增的列，逐列检查后再补，避免 IF NOT EXISTS 不会改表结构。
 for(const [table,column,definition] of [['class_members','status',"TEXT NOT NULL DEFAULT 'active'"],['submissions','check_result','TEXT']]){
  const columns=db.prepare(`PRAGMA table_info(${table})`).all().map(row=>row.name);
  if(columns.length&&!columns.includes(column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
 }
 const q=(sql,...params)=>db.prepare(sql).get(...params),all=(sql,...params)=>db.prepare(sql).all(...params),run=(sql,...params)=>db.prepare(sql).run(...params);
 let bootstrapPath=null;
 if(!q('SELECT id FROM users LIMIT 1')){
  const accounts=bootstrap||Object.fromEntries(['admin','teacher','student'].map(role=>[role,{username:role,password:randomBytes(15).toString('base64url')}])) ;
  for(const [role,account] of Object.entries(accounts))run('INSERT INTO users VALUES(?,?,?,?,?,1)',randomUUID(),account.username,account.name||({admin:'平台管理员',teacher:'课程教师',student:'学习者'})[role]||role,role,passwordHash(account.password));
  if(!bootstrap){bootstrapPath=path.join(dataDir,'local-accounts.txt');writeFileSync(bootstrapPath,'本机初始账号，请妥善保存。此文件不通过网站公开。\n'+Object.entries(accounts).map(([role,a])=>role+' / '+a.username+' / '+a.password).join('\n'),{mode:0o600});}
 }
 if(!q('SELECT id FROM courses WHERE id=?',seedCourse.id)){
  const course={...structuredClone(seedCourse),hours:seedCourse.hours??null,ideologicalNote:'',outcomes:[]};run('INSERT INTO courses VALUES(?,?,1,NULL,NULL,?)',course.id,JSON.stringify(course),new Date().toISOString());
  const owner=q("SELECT id FROM users WHERE global_role='teacher' LIMIT 1");if(owner)run('INSERT INTO course_members VALUES(?,?,?)',course.id,owner.id,'owner');
 }
 function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}
 function audit(user,action,id){run('INSERT INTO audit(at,actor,action,object_id) VALUES(?,?,?,?)',new Date().toISOString(),user?.username||'system',action,id);}
 function getDraft(row){const result=JSON.parse(row.draft_json);result.outcomes=all('SELECT id,code,description,type,assessment_mode AS assessmentMode FROM course_outcomes WHERE course_id=? AND revision=? ORDER BY rowid',row.id,row.revision);return result;}
 function putOutcomes(course,revision){for(const o of course.outcomes)run('INSERT INTO course_outcomes VALUES(?,?,?,?,?,?,?)',course.id,revision,o.id,o.code,o.description,o.type,o.assessmentMode);}
 return {db,q,all,run,transaction,audit,getDraft,putOutcomes,bootstrapPath,seedCourse:structuredClone(seedCourse)};
}
