const host=typeof document==='undefined'?null:document.querySelector('.sidebar nav')||document.querySelector('nav');
if(host&&!host.querySelector('[data-learning-tools]')){
 const teacher=['teacher.html','teaching.html'].some(page=>location.pathname.endsWith(page));
 const link=document.createElement('a');link.className='nav-link';link.dataset.learningTools='true';link.href='learning-tools.html'+(teacher?'?portal=teacher':'');link.textContent=teacher?'教学资源与课堂工具':'课程学习与交流';host.append(link);
}
