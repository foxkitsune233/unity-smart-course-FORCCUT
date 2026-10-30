import {createApp} from './server/app.mjs';
const port=Number(process.env.PORT||8090);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT必须为1024—65535之间的端口');
const app=createApp({dataDir:process.env.PORTAL_DATA_DIR,secureCookies:process.env.PORTAL_HTTPS==='1'});
app.server.on('error',error=>{console.error('课程服务启动失败：'+error.message);process.exitCode=1;});
app.server.listen(port,'127.0.0.1',()=>{console.log('Unity课程平台：http://127.0.0.1:'+port+'/');console.log('教师端：http://127.0.0.1:'+port+'/teacher.html');if(app.bootstrapPath)console.log('本机初始账号已保存在：'+app.bootstrapPath);});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
