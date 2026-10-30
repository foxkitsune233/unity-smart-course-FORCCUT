"""Real browser acceptance through browser-harness. Uses an isolated CDP profile."""
import base64,json,time
from pathlib import Path
EVIDENCE=Path(r'D:\unity\CoursePortal\Evidence')
BASE='http://127.0.0.1:8089/'
KEY='CoursePortal.v1:unity-script-2021'
results=[]
def ev(expression):
    value=cdp('Runtime.evaluate',expression=expression,returnByValue=True,awaitPromise=True)
    if 'exceptionDetails' in value: raise AssertionError(value['exceptionDetails'])
    return value.get('result',{}).get('value')
def until(predicate,timeout=8):
    end=time.time()+timeout
    while time.time()<end:
        if predicate():return
        time.sleep(.12)
    raise AssertionError('Timed out waiting for browser state')
def check(name,condition,detail=None):
    assert condition,name+': '+str(detail)
    results.append({'name':name,'passed':True,'detail':detail})
    print('PASS '+name)
def click(name,role=None):
    nodes=cdp('Accessibility.getFullAXTree')['nodes']
    matches=[n for n in nodes if not n.get('ignored') and n.get('name',{}).get('value')==name and (role is None or n.get('role',{}).get('value')==role)]
    assert matches,'AX element missing: '+name
    node=matches[0]['backendDOMNodeId']
    cdp('DOM.scrollIntoViewIfNeeded',backendNodeId=node)
    q=cdp('DOM.getBoxModel',backendNodeId=node)['model']['content']
    click_at_xy(sum(q[0::2])/4,sum(q[1::2])/4)
    time.sleep(.12)
def type_into(name,text):
    click(name)
    cdp('Input.dispatchKeyEvent',type='keyDown',key='a',code='KeyA',modifiers=2,windowsVirtualKeyCode=65,commands=['selectAll'])
    cdp('Input.dispatchKeyEvent',type='keyUp',key='a',code='KeyA',modifiers=2,windowsVirtualKeyCode=65)
    cdp('Input.insertText',text=text)
def visit(url):
    goto_url(url);wait_for_load();cdp('Page.bringToFront')
    until(lambda:ev("Boolean(document.querySelector('.chapter-card,.catalog-lesson'))"))
def shot(name):
    EVIDENCE.joinpath(name).write_bytes(base64.b64decode(cdp('Page.captureScreenshot',format='png',captureBeyondViewport=False)['data']))
def stored():return json.loads(ev('localStorage.getItem('+json.dumps(KEY)+')') or '{}')
try:
    visit(BASE)
    ev('localStorage.removeItem('+json.dumps(KEY)+')')
    cdp('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
    visit(BASE)
    check('home_eleven_school_chapters_zero_initial_progress',ev("document.querySelectorAll('.chapter-card').length===11&&document.querySelector('#completed-count').textContent==='0'"))
    shot('home-desktop.png')
    type_into('搜索章节','物理')
    check('home_search_filters_chapters',0<ev("document.querySelectorAll('.chapter-card').length")<11)
    type_into('搜索章节','不存在的章节测试')
    check('search_empty_state',ev("!document.querySelector('#search-empty').hidden"))
    click('查看全部章节','button')
    check('clear_search_restores_directory',ev("document.querySelectorAll('.chapter-card').length===13"))
    click('课程说明','button')
    check('course_information_has_school_confirmed_hours',ev("document.querySelector('#about-dialog').open&&document.querySelector('#about-dialog').textContent.includes('48 学时')"))
    click('关闭课程说明','button')
    click('开始第一节','link');wait_for_load()
    until(lambda:ev("document.querySelectorAll('.catalog-lesson').length===13"))
    check('watch_has_honest_video_empty_state',ev("!document.querySelector('#video-empty').hidden&&document.querySelector('#course-video').hidden"))
    ev('window.scrollTo(0,0)');shot('watch-desktop.png')
    click('随堂笔记 0','tab')
    note='组件决定行为；先预测，再运行。 <img src=x onerror=alert(1)>'
    type_into('笔记内容',note)
    click('保存笔记','button')
    check('note_saved_as_text_without_html_execution',ev("document.querySelector('.saved-note p').textContent==="+json.dumps(note)+"&&!document.querySelector('.saved-note img')"))
    click('标记本节已学','button')
    cdp('Page.reload',ignoreCache=True);wait_for_load()
    until(lambda:ev("document.querySelectorAll('.saved-note').length===1"))
    check('notes_completion_and_tab_survive_reload',ev("document.querySelector('#tab-notes').getAttribute('aria-selected')==='true'&&document.querySelector('#catalog-completed').textContent==='1'"))
    # Force a real storage failure and verify input isn't lost or falsely confirmed.
    ev("window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')}")
    type_into('笔记内容','保存失败时应保留输入')
    click('保存笔记','button')
    check('storage_failure_preserves_note_and_reports_failure',ev("document.querySelector('#note-text').value==='保存失败时应保留输入'&&document.querySelector('#toast').textContent.includes('未能保存')&&document.querySelectorAll('.saved-note').length===1"))
    ev('Storage.prototype.setItem=window.originalSetItem')
    click('保存笔记','button')
    check('retry_after_storage_failure_succeeds',ev("document.querySelectorAll('.saved-note').length===2"))
    # A separate same-origin browsing context starts with an old snapshot.
    ev("window.other=document.createElement('iframe');other.src='watch.html?lesson=lesson-02';other.style.display='none';document.body.append(other)")
    until(lambda:ev("other.contentDocument.querySelectorAll('.catalog-lesson').length===13"))
    type_into('笔记内容','第二学习页不能覆盖此笔记')
    click('保存笔记','button')
    ev("other.contentDocument.querySelector('#complete-lesson').click()")
    until(lambda:stored().get('lessons',{}).get('lesson-02',{}).get('completed'))
    check('multiple_learning_contexts_preserve_other_chapter_notes',len(stored()['lessons']['lesson-01']['notes'])==3)
    ev('other.remove()')
    click('返回学习首页','link');wait_for_load()
    until(lambda:ev("document.querySelector('#completed-count').textContent==='2'"))
    check('homepage_updates_real_notes_and_completion',ev("document.querySelector('#notes-count').textContent==='3'&&document.querySelector('#continue-label').textContent==='继续学习'"))
    click('已学习','button')
    check('completion_filter_returns_only_learned_chapters',ev("document.querySelectorAll('.chapter-card').length===2"))
    visit(BASE+'watch.html?lesson=lesson-03')
    click('对应实训','tab')
    check('future_labs_are_explicitly_planned',ev("document.querySelector('#practice-link').hidden&&document.querySelector('#practice-description').textContent.includes('单独设计')"))
    type_into('搜索课程目录','动画')
    check('watch_catalog_search',0<ev("document.querySelectorAll('.catalog-lesson').length")<13)
    visit(BASE+'watch.html?lesson=lesson-01')
    click('关联本节视频','button')
    type_into('视频地址','javascript:alert(1)')
    click('使用视频地址','button')
    check('unsafe_video_scheme_rejected',ev("!document.querySelector('#source-error').hidden&&document.querySelector('#source-dialog').open"))
    # Mixed-case URL exercises browser URL normalization during position saves.
    type_into('视频地址','HTTP://127.0.0.1:8089/Evidence/test-clip.webm')
    click('使用视频地址','button')
    until(lambda:ev("Number.isFinite(document.querySelector('#course-video').duration)"))
    check('actual_html_video_loaded',ev("document.querySelector('#course-video').duration>10&&!document.querySelector('#course-video').hidden"))
    ev("document.querySelector('#course-video').play()")
    until(lambda:ev("document.querySelector('#course-video').currentTime>.8"))
    ev("document.querySelector('#course-video').pause();document.querySelector('#course-video').currentTime=4")
    until(lambda:ev("Math.abs(document.querySelector('#course-video').currentTime-4)<.2"))
    # Pause after seek persists position even when the player was paused initially.
    ev("document.querySelector('#course-video').play()")
    time.sleep(.3);ev("document.querySelector('#course-video').pause()")
    until(lambda:stored()['lessons']['lesson-01']['position']>4)
    check('normalized_video_url_persists_actual_playback',stored()['lessons']['lesson-01']['position']>4)
    cdp('Page.reload',ignoreCache=True);wait_for_load()
    until(lambda:ev("document.querySelector('#course-video').currentTime>4"))
    check('video_source_and_position_restore_after_reload',ev("document.querySelector('#course-video').currentTime>4"))
    click('播放速度','combobox')
    cdp('Input.dispatchKeyEvent',type='keyDown',key='End',code='End')
    cdp('Input.dispatchKeyEvent',type='keyUp',key='End',code='End')
    cdp('Input.dispatchKeyEvent',type='keyDown',key='Enter',code='Enter')
    cdp('Input.dispatchKeyEvent',type='keyUp',key='Enter',code='Enter')
    until(lambda:ev("document.querySelector('#course-video').playbackRate===2"))
    check('native_playback_speed_control',ev("document.querySelector('#course-video').playbackRate===2"))
    click('随堂笔记 3','tab')
    type_into('笔记内容','视频时间点笔记')
    click('保存笔记','button')
    check('video_note_records_playback_timestamp',stored()['lessons']['lesson-01']['notes'][-1]['time']>4)
    click('切换剧场模式','button')
    check('theater_toggle_expands_layout',ev("document.body.classList.contains('theater')"))
    click('切换剧场模式','button')
    # Actual ended event from playing the final second, not dispatching a fake event.
    ev("document.querySelector('#course-video').currentTime=11;document.querySelector('#course-video').play()")
    until(lambda:ev("document.querySelector('#course-video').ended"))
    check('actual_video_end_marks_lesson_complete',stored()['lessons']['lesson-01']['completed'])
    click('关联本节视频','button');click('移除本节视频关联','button')
    check('removing_source_resets_video_and_progress',ev("document.querySelector('#course-video').hidden") and stored()['lessons']['lesson-01']['position']==0)
    click('关联本节视频','button')
    doc=cdp('DOM.getDocument')['root']['nodeId']
    node=cdp('DOM.querySelector',nodeId=doc,selector='#local-video')['nodeId']
    cdp('DOM.setFileInputFiles',nodeId=node,files=[str(EVIDENCE/'test-clip.webm')])
    until(lambda:ev("document.querySelector('#course-video').readyState>=1"))
    check('local_file_preview_works_without_persisting_blob_url',ev("document.querySelector('#course-video').src.startsWith('blob:')") and stored()['lessons']['lesson-01']['videoUrl'] is None)
    cdp('Page.reload',ignoreCache=True);wait_for_load()
    until(lambda:ev("!document.querySelector('#video-empty').hidden"))
    check('local_preview_is_honestly_transient',ev("document.querySelector('#course-video').hidden"))
    # Screenshot both pages from a clean student profile, without test activity.
    ev('localStorage.removeItem('+json.dumps(KEY)+')')
    visit(BASE)
    cdp('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=True)
    ev('window.scrollTo(0,0)');time.sleep(.2)
    check('mobile_home_has_no_horizontal_overflow',ev('document.documentElement.scrollWidth<=innerWidth'))
    shot('home-mobile.png')
    visit(BASE+'watch.html?lesson=lesson-01')
    check('mobile_watch_has_no_horizontal_overflow',ev('document.documentElement.scrollWidth<=innerWidth'))
    shot('watch-mobile.png')
    click('随堂笔记 0','tab');type_into('笔记内容','手机端笔记验收');click('保存笔记','button')
    check('mobile_notes_are_operable',ev("document.querySelectorAll('.saved-note').length===1"))
    ev('localStorage.removeItem('+json.dumps(KEY)+')')
    cdp('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
    visit(BASE)
    EVIDENCE.joinpath('browser-tests.json').write_text(json.dumps({'passed':True,'tests':results},ensure_ascii=False,indent=2),encoding='utf-8')
    print('PORTAL RESULT: '+str(len(results))+'/'+str(len(results))+' passed')
except Exception as error:
    EVIDENCE.joinpath('browser-tests.json').write_text(json.dumps({'passed':False,'tests':results,'error':str(error)},ensure_ascii=False,indent=2),encoding='utf-8')
    shot('browser-failure.png')
    raise
