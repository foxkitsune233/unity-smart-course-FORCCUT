import pptxgen from 'pptxgenjs';
const PptxGenJS = pptxgen.default || pptxgen;

// 将备课幻灯片结构 [{title,points:[],notes?}] 导出为合法 .pptx 的 Buffer
export async function buildPptx(meta={},slides=[]){
 const pptx=new PptxGenJS();
 pptx.defineLayout({name:'WIDE',width:13.333,height:7.5});
 pptx.layout='WIDE';
 pptx.author=meta.author||'Unity研习室';
 pptx.company=meta.author||'Unity研习室';
 pptx.title=meta.title||'备课讲义';
 pptx.subject=meta.title||'';
 const list=(slides||[]).filter(Boolean);
 if(!list.length){const s=pptx.addSlide();s.addText('（无幻灯片内容）',{x:0.5,y:3.2,w:12,h:1,fontSize:24,color:'888888'});}
 for(const [index,item] of list.entries()){
  const slide=pptx.addSlide();
  const cover=index===0,closing=index===list.length-1&&index>0;
  slide.background={color:cover?'153B39':closing?'EDF5F1':'FFFFFF'};
  slide.addText(String(item.title||''),{x:0.6,y:cover?1.5:0.35,w:12,h:1.2,fontSize:cover?36:30,bold:true,color:cover?'FFFFFF':'1F4E48',fontFace:'Microsoft YaHei',valign:'middle'});
  const points=(item.points||[]).filter(p=>p!=null&&String(p).trim()).map(p=>({text:String(p).trim(),options:{bullet:{code:'2022',indent:20},breakLine:true}}));
  slide.addText(points.length?points:' ',{x:0.8,y:cover?3:1.8,w:11.8,h:4.6,fontSize:20,color:cover?'E7F2ED':'222222',fontFace:'Microsoft YaHei',lineSpacingMultiple:1.3,valign:'top',breakLine:false});
  slide.addText(`${index+1} / ${list.length}`,{x:11.7,y:7.05,w:1,h:0.25,fontSize:10,color:cover?'D7E9DF':'657A70',align:'right'});
  if(item.notes)slide.addNotes(String(item.notes));
 }
 return await pptx.write({outputType:'nodebuffer'});
}
