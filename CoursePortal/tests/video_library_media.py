"""Real embedded media playback, no stream extraction, via browser-harness."""
from pathlib import Path
exec(Path(r'D:\unity\CoursePortal\tests\video_library_browser.py').read_text(encoding='utf-8-sig').split('\ntry:\n')[0])
evidence=[]
try:
    for lesson,index in [('lesson-10',1),('lesson-11',1),('lesson-07',13)]:
        visit(BASE+'watch.html?lesson='+lesson,'.resource-button')
        resource=manifest['lessons'][lesson][index]
        click('播放视频 '+str(index+1)+'：'+resource['title'],'button')
        src=ev("document.querySelector('#external-video').src")
        def target():return next((t for t in cdp('Target.getTargets')['targetInfos'] if t['type']=='iframe' and t['url']==src),None)
        until(lambda:target() is not None,20)
        session=cdp('Target.attachToTarget',targetId=target()['targetId'],flatten=True)['sessionId']
        def media():return cdp('Runtime.evaluate',session_id=session,expression="({ready:document.querySelector('video')?.readyState,time:document.querySelector('video')?.currentTime,duration:document.querySelector('video')?.duration,paused:document.querySelector('video')?.paused,error:document.querySelector('video')?.error?.code})",returnByValue=True)['result'].get('value') or {}
        until(lambda:media().get('ready',0)>=2,25)
        check(lesson+'_official_embed_actual_media_ready',media().get('duration',0)>30)
        ev("document.querySelector('#video-stage').scrollIntoView({block:'center'})");time.sleep(.2)
        nodes=cdp('Accessibility.getFullAXTree',session_id=session)['nodes'];node=next(n for n in nodes if n.get('role',{}).get('value')=='button' and n.get('name',{}).get('value')=='播放/暂停')
        q=cdp('DOM.getBoxModel',session_id=session,backendNodeId=node['backendDOMNodeId'])['model']['content'];rect=ev("document.querySelector('#external-video').getBoundingClientRect().toJSON()")
        click_at_xy(rect['x']+sum(q[0::2])/4,rect['y']+sum(q[1::2])/4)
        until(lambda:media().get('time',0)>1,25)
        check(lesson+'_embedded_video_really_advances',not media().get('paused',True))
        evidence.append({'lesson':lesson,'resource':resource['id'],'title':resource['title'],'state':media()});shot('video-playing-'+lesson+'.png')
    check('real_external_play_never_auto_completes_required_unit',not any(v.get('completed') for k,v in stored().get('lessons',{}).items() if k in ['lesson-10','lesson-11','lesson-07']))
    print('EMBEDDED MEDIA: '+str(len(results))+' passed')
finally:
    EVIDENCE.joinpath('video-library-media.json').write_text(json.dumps({'passed':len(results),'results':results,'actualMedia':evidence},ensure_ascii=False,indent=2),encoding='utf-8')
