// 以 detached 方式启动课程服务：子进程脱离父进程与控制台组，不会被 Ctrl+C 或会话回收带走。
// 用法：node start-detached.mjs
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const nodePath=process.execPath;
const out=fs.openSync(path.join(root,'serve.log'),'a');

const child=spawn(nodePath,[path.join(root,'serve.mjs')],{
 cwd:root,
 detached:true,
 stdio:['ignore',out,out],
 windowsHide:true,
});
child.unref();
console.log('课程服务已启动，PID='+child.pid);
console.log('访问 http://127.0.0.1:8090/');
