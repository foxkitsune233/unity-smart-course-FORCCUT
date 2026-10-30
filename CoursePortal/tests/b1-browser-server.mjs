import {createApp} from '../server/app.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';
const dataDir=mkdtempSync(path.join(os.tmpdir(),'unity-b1-browser-'));
const app=createApp({dataDir,bootstrap:{admin:{username:'admin',password:'Admin-browser-923!'},teacher:{username:'teacher',password:'Teacher-browser-923!'},student:{username:'student',password:'Student-browser-923!'}}});
app.server.listen(8091,'127.0.0.1',()=>console.log('Isolated browser QA: http://127.0.0.1:8091/'));
process.on('SIGINT',async()=>{await app.close();if(path.resolve(dataDir).startsWith(path.resolve(os.tmpdir())+path.sep+'unity-b1-browser-'))rmSync(dataDir,{recursive:true,force:true});process.exit(0);});
