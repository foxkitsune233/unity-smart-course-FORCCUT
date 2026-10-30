const bvidPattern=/^BV[a-zA-Z0-9]{10}$/;
const validText=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
export function normalizeVideoResources(value){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>100)throw new Error('每个学习单元最多100段视频');
 const ids=new Set();
 return value.map(r=>{
  if(!r||r.provider!=='bilibili'||!validText(r.id,100)||!/^[A-Za-z0-9_-]+$/.test(r.id)||ids.has(r.id)||!bvidPattern.test(r.bvid||'')||!Number.isSafeInteger(r.cid)||r.cid<1||!Number.isInteger(r.page)||r.page<1||r.page>1000||!validText(r.title,500)||!validText(r.author,100)||!Number.isFinite(r.duration)||r.duration<=0||r.duration>86400||!validText(r.versionNote,1000)||!/^\d{4}-\d{2}-\d{2}$/.test(r.verifiedAt||'')||!Array.isArray(r.topics)||r.topics.length>30||!r.topics.every(t=>validText(t,150)))throw new Error('平台视频的编号、分P、标题、时长或来源无效');
  ids.add(r.id);return {id:r.id,provider:'bilibili',bvid:r.bvid,cid:r.cid,page:r.page,title:r.title,author:r.author,duration:r.duration,versionNote:r.versionNote,topics:[...r.topics],verifiedAt:r.verifiedAt};
 });
}
export function bilibiliPlayerUrl(input){const r=normalizeVideoResources([input])[0];return 'https://player.bilibili.com/player.html?'+new URLSearchParams({bvid:r.bvid,cid:String(r.cid),p:String(r.page),autoplay:'0',danmaku:'0',poster:'1'});}
export function videoSourceUrl(input){const r=normalizeVideoResources([input])[0];return 'https://www.bilibili.com/video/'+r.bvid+'/?p='+r.page;}
export function hasLessonVideo(lesson,localUrl){return Boolean(localUrl||lesson.video?.src||lesson.video?.resources?.length);}
