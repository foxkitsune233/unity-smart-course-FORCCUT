import {DatabaseSync,backup} from 'node:sqlite';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createStore} from '../server/store.mjs';import {attachLabExperiments} from '../server/attach-lab-experiments.mjs';import {validateCourse} from '../server/validation.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const dataDir=path.resolve(process.env.PORTAL_DATA_DIR||path.join(root,'.course-portal-data'));
const file=path.join(dataDir,'portal.sqlite');
if(!fs.existsSync(file))throw new Error('课程数据库不存在，请先启动课程服务');
const backupDir=path.join(dataDir,'backups');fs.mkdirSync(backupDir,{recursive:true});
const backupPath=path.join(backupDir,'before-lab-attachment-'+new Date().toISOString().replaceAll(':','-')+'.sqlite');
const source=new DatabaseSync(file,{readOnly:true});
try{await backup(source,backupPath);}finally{source.close();}
const store=createStore(dataDir);
try{console.log(JSON.stringify({backup:backupPath,...(()=>{const row=store.q('SELECT * FROM courses WHERE id=?',store.seedCourse.id),course=store.getDraft(row);if(!attachLabExperiments(course))return {changed:false,revision:row.revision};const next=validateCourse(course,row.id),revision=row.revision+1;store.transaction(()=>{const r=store.run('UPDATE courses SET draft_json=?,revision=?,updated_at=? WHERE id=? AND revision=?',JSON.stringify(next),revision,new Date().toISOString(),row.id,row.revision);if(r.changes!==1)throw Error('课程已被其他窗口修改');store.putOutcomes(next,revision);store.audit({username:'system:lab-attachment'},'course.labs.attached',row.id+':'+revision);});return {changed:true,revision,publishedRevision:row.published_revision};})()}));}finally{store.db.close();}
