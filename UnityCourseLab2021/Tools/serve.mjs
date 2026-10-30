import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../Build/Web');
const types = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.data':'application/octet-stream','.json':'application/json','.png':'image/png'};
const server = http.createServer((req,res) => {
  let file;
  try {
    const requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    file = path.resolve(root, '.' + (requestPath === '/' ? '/index.html' : requestPath));
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  } catch { res.writeHead(400).end(); return; }
  fs.stat(file, (error, stat) => {
    if(error || !stat.isFile()) { res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}).end('未找到构建文件。请先完成 Unity WebGL 构建。'); return; }
    res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    fs.createReadStream(file).pipe(res);
  });
});
server.listen(8088, '127.0.0.1', () => console.log('Unity Course Lab: http://127.0.0.1:8088'));
