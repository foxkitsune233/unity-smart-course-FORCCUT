"""Verify every selected local part decodes a real video frame in the browser."""
from pathlib import Path
exec(Path(r'D:\unity\CoursePortal\tests\b1_browser_acceptance.py').read_text(encoding='utf-8').split('\ntry:\n')[0])
original_click=click
def click(name,role=None):
    original_click(name,role);time.sleep(.1)
seen=set();decoded=[]
try:
    course=api_call('/api/catalog/current')['data']['course']
    for ch in course['chapters']+course['curriculum']['optionalChapters']:
        for lesson in ch['lessons']:
            visit(BASE+'watch.html?lesson='+lesson['id'],'.resource-button')
            for index,resource in enumerate(lesson['video']['resources']):
                if resource['id'] in seen:continue
                seen.add(resource['id'])
                click('播放视频 '+str(index+1)+'：'+resource['title'],'button')
                until(lambda:ev("document.querySelector('#course-video').readyState>=2&&document.querySelector('#course-video').currentSrc.includes("+json.dumps('/'+resource['id']+'.mp4')+")"),15)
                ev("document.querySelector('#course-video').play()")
                until(lambda:ev("document.querySelector('#course-video').currentTime>.12&&document.querySelector('#course-video').getVideoPlaybackQuality().totalVideoFrames>0"),10)
                info=ev("({width:document.querySelector('#course-video').videoWidth,height:document.querySelector('#course-video').videoHeight,frames:document.querySelector('#course-video').getVideoPlaybackQuality().totalVideoFrames,duration:document.querySelector('#course-video').duration})")
                check(resource['id']+'_decodes_frame',info['width']>0 and info['frames']>0,info);decoded.append({'id':resource['id'],**info});ev("document.querySelector('#course-video').pause()")
    assert len(decoded)==87,'Expected87unique videos'
    print('ALL87LOCAL VIDEOS DECODED',flush=True)
finally:
    EVIDENCE.joinpath('local-video-all87.json').write_text(json.dumps({'passed':len(results),'results':results,'videos':decoded},ensure_ascii=False,indent=2),encoding='utf-8')
