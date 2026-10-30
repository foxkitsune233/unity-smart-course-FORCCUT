export function safeNext(value) {
  if(typeof value!=='string'||!value||/[\\\u0000-\u0020]/.test(value))return null;
  let decoded;try{decoded=decodeURIComponent(value);}catch{return null;}
  if(/[\\\u0000-\u0020]/.test(decoded)||decoded.startsWith('//')||/^[a-z][a-z\d+.-]*:/i.test(decoded))return null;
  const pathname=decoded.split(/[?#]/)[0].replace(/^\.\//,'').replace(/^\//,'');
  if(!['','index.html','teacher.html','teaching.html','tasks.html','admin.html','watch.html','lab','lab/','lab/index.html'].includes(pathname))return null;
  return value;
}
export function roleHome(role){return role==='admin'?'admin.html':['teacher','assistant'].includes(role)?'teacher.html':'./';}

export function portalForRole(role){return role==='student'?'student':['teacher','assistant','admin'].includes(role)?'teacher':null;}
export function loginDestination(role,portal,next){if(portalForRole(role)!==portal)return null;const safe=safeNext(next);if(safe){const url=new URL(safe,'http://portal.local/');const allowed=portal==='student'?['/','/index.html','/watch.html','/tasks.html','/lab','/lab/','/lab/index.html']:role==='admin'?['/admin.html','/teacher.html','/teaching.html']:['/teacher.html','/teaching.html'];if(allowed.includes(url.pathname))return safe;}return roleHome(role);}
