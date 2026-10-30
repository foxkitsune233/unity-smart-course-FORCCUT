"""Local media acceptance: isolated8091 DB/profile, no remote video requests."""
from pathlib import Path
exec(Path(r'D:\unity\CoursePortal\tests\b1_browser_acceptance.py').read_text(encoding='utf-8').split('\ntry:\n')[0])
original_click=click
def click(name,role=None):
    original_click(name,role);time.sleep(.15)
def ready():
    until(lambda:ev("document.querySelector('#course-video').readyState>=2&&document.querySelector('#course-video').currentSrc===document.querySelector('#course-video').src"),15)
try:
    cdp('Network.enable');cdp('Network.setBlockedURLs',urls=['*://*.bilibili.com/*','*://*.hdslb.com/*'])
    cdp('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
    visit(BASE+'watch.html?lesson=lesson-01','.resource-button');ready()
    check('local_source_selected_without_external_iframe',ev("document.querySelector('#course-video').currentSrc.includes('/media/')&&document.querySelector('#external-video').hidden&&!document.querySelector('#external-video').hasAttribute('src')"))
    data=api_call('/api/catalog/current')['data'];all_resources=[r for ch in data['course']['chapters']+data['course']['curriculum']['optionalChapters'] for l in ch['lessons'] for r in l['video']['resources']]
    check('all88_references_have_local_sources',len(all_resources)==88 and all(r.get('localSrc','').startswith('/media/') for r in all_resources))
    sources=list(set(r['localSrc'] for r in all_resources));check('all87_unique_files_respond_to_HEAD',ev("Promise.all("+json.dumps(sources)+".map(u=>fetch(u,{method:'HEAD'}).then(r=>r.status===200&&Number(r.headers.get('content-length'))>0))).then(a=>a.every(Boolean))"))
    check('range_reads_100bytes_and_invalid_range_rejected',ev("Promise.all([fetch(document.querySelector('#course-video').src,{headers:{Range:'bytes=0-99'}}).then(async r=>r.status===206&&(await r.arrayBuffer()).byteLength===100),fetch(document.querySelector('#course-video').src,{headers:{Range:'bytes=999999999999-'}}).then(r=>r.status===416)]).then(a=>a.every(Boolean))"))
    click('播放视频 1：06-Unity的下载和安装','button');ready();ev("document.querySelector('#course-video').play()")
    until(lambda:ev("document.querySelector('#course-video').currentTime>1"));check('actual_local_video_time_advances_without_original_platform',ev("!document.querySelector('#course-video').paused"))
    ev("document.querySelector('#course-video').currentTime=5;document.querySelector('#course-video').pause()")
    first=all_resources[0]['id'];until(lambda:stored().get('lessons',{}).get('lesson-01',{}).get('resourcePlayback',{}).get(first,{}).get('position',0)>=5)
    click('随堂笔记 0','tab');until(lambda:ev("!document.querySelector('#panel-notes').hidden"));type_into('笔记内容','第一分集5秒笔记');click('保存笔记','button')
    check('note_records_own_resource_identity',stored()['lessons']['lesson-01']['notes'][0].get('resourceId')==first)
    click('播放视频 2：09-创建工程','button');ready();check('second_part_does_not_inherit_first_position',ev("document.querySelector('#course-video').currentTime<1"))
    ev("document.querySelector('#course-video').play()");until(lambda:ev("document.querySelector('#course-video').currentTime>.3"));ev("document.querySelector('#course-video').currentTime=9;document.querySelector('#course-video').pause()")
    second=all_resources[1]['id'];until(lambda:stored()['lessons']['lesson-01'].get('resourcePlayback',{}).get(second,{}).get('position',0)>=9)
    click('播放视频 1：06-Unity的下载和安装','button');ready();check('first_part_restores_own_position',ev("document.querySelector('#course-video').currentTime>=5&&document.querySelector('#course-video').currentTime<8"))
    cdp('Page.reload',ignoreCache=True);wait_for_load();ready();check('selected_part_and_position_survive_refresh',ev("document.querySelector('.resource-button.active').dataset.resourceId")==first and ev("document.querySelector('#course-video').currentTime>=5"))
    click('播放视频 2：09-创建工程','button');ready();check('second_part_retains_independent_resume_position',ev("document.querySelector('#course-video').currentTime>=9"))
    click('P6 · 00:05','button') if False else None
    # Time label depends on real play timing. Read its actual accessible name before click.
    note_name=ev("document.querySelector('.note-time').textContent");click(note_name,'button');ready()
    until(lambda:ev("document.querySelector('#course-video').currentTime>=5"));check('cross_part_note_seeks_its_correct_video',ev("document.querySelector('.resource-button.active').dataset.resourceId")==first)
    ev("document.querySelector('#course-video').currentTime=document.querySelector('#course-video').duration-.3;document.querySelector('#course-video').play()")
    until(lambda:stored()['lessons']['lesson-01'].get('resourcePlayback',{}).get(first,{}).get('completed',False),12)
    check('one_part_end_does_not_complete_multi_part_lesson',not stored()['lessons']['lesson-01'].get('completed',False))
    # A saved legacy native URL must not override the newly connected local collection.
    ev("(()=>{const key='CoursePortal.v1:unity-script-2021';const s=JSON.parse(localStorage.getItem(key));s.lessons['lesson-01'].videoUrl='https://example.invalid/legacy.mp4';localStorage.setItem(key,JSON.stringify(s));})()")
    visit(BASE+'watch.html?lesson=lesson-01','.resource-button');ready();check('legacy_video_url_cannot_override_local_default',ev("document.querySelector('#course-video').currentSrc.includes('/media/')"))
    click('播放视频 8：24-通过刚体控制小球运动','button');ready();ev("document.querySelector('#course-video').play()");until(lambda:ev("document.querySelector('#course-video').currentTime>.4"));ev("document.querySelector('#course-video').pause();document.querySelector('#video-stage').scrollIntoView({block:'center'})");shot('local-video-desktop.png')
    cdp('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=True);check('local_player_mobile_no_horizontal_overflow',ev('document.documentElement.scrollWidth<=innerWidth'));shot('local-video-mobile.png');cdp('Emulation.clearDeviceMetricsOverride')
    for lesson in ['lesson-03','lesson-07','lesson-10','lesson-11','lesson-09']:
        visit(BASE+'watch.html?lesson='+lesson,'.resource-button');ready();check(lesson+'_local_media_metadata_loaded',ev("document.querySelector('#course-video').duration>0&&document.querySelector('#external-video').hidden"))
    print('LOCAL VIDEO ACCEPTANCE '+str(len(results))+' passed',flush=True)
finally:
    EVIDENCE.joinpath('local-video-browser.json').write_text(json.dumps({'passed':len(results),'results':results},ensure_ascii=False,indent=2),encoding='utf-8');cdp('Emulation.clearDeviceMetricsOverride')
