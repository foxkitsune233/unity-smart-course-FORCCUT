import {DatabaseSync,backup} from 'node:sqlite';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createStore} from '../server/store.mjs';import {applySchoolAlignment} from '../server/align-school-curriculum.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const dataDir=path.resolve(process.env.PORTAL_DATA_DIR||path.join(root,'.course-portal-data'));
const file=path.join(dataDir,'portal.sqlite');
if(!fs.existsSync(file))throw new Error('课程数据库不存在，请先启动课程服务');
const backupDir=path.join(dataDir,'backups');fs.mkdirSync(backupDir,{recursive:true});
const backupPath=path.join(backupDir,'before-school-alignment-'+new Date().toISOString().replaceAll(':','-')+'.sqlite');
const source=new DatabaseSync(file,{readOnly:true});
try{await backup(source,backupPath);}finally{source.close();}
const store=createStore(dataDir);
try{console.log(JSON.stringify({backup:backupPath,...applySchoolAlignment(store)}));}finally{store.db.close();}
