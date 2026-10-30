"""Additional new-course, multi-lesson and preview-note checks on the same disposable QA service."""
from pathlib import Path
exec(Path(r'D:\unity\CoursePortal\tests\b1_browser_acceptance.py').read_text(encoding='utf-8').split('\ntry:\n')[0])
try:
    visit(BASE+'login.html','#login-form');login('teacher')
    visit(BASE+'teacher.html','.manage-course-card')
    click('＋ 新建课程','button');type_into('课程名称','B1验收专用课程');click('创建课程草稿','button')
    until(lambda:ev("Boolean(document.querySelector('#course-editor'))"))
    course_id=ev("location.hash.split('/')[1]")
    check('teacher_can_create_course_with_independent_id',course_id!=COURSE)
    type_into('课程学时','2');click('＋ 添加目标','button');type_into('目标编号','CO1');type_into('目标描述','辨识对象及其组件。')
    click('＋ 添加章节','button');type_into('章节标题','对象与组件')
    click('＋ 添加课时','button');type_into('课时标题','观察对象')
    click('＋ 添加课时','button')
    nodes=cdp('Accessibility.getFullAXTree')['nodes']
    summary=next(n['name']['value'] for n in nodes if not n.get('ignored') and n.get('name',{}).get('value','').startswith('01.02'))
    click(summary)
    fill_path('chapters.0.lessons.1.title','观察组件')
    save();click('发布课程','button')
    until(lambda:ev("document.querySelector('#page-notice').textContent.includes('已发布')"))
    visit(BASE+'?course='+course_id,'.chapter-card')
    check('student_home_uses_actual_chapter_and_lesson_counts',ev("document.querySelector('#chapter-total').textContent==='1'&&document.querySelector('#unit-total').textContent==='/ 2'&&document.querySelectorAll('.chapter-card').length===1"))
    # Each chapter is one home card; individual lesson names remain in the player.
    check('same_chapter_lessons_use_one_home_card',ev("document.querySelector('.chapter-card h3').textContent==='对象与组件'"))
    click('开始第一节','link');wait_for_load();until(lambda:ev("document.querySelectorAll('.catalog-lesson').length===2"))
    check('watch_catalog_tracks_variable_lesson_count',ev("document.querySelector('#catalog-total').textContent==='2'&&document.querySelector('#catalog-progress').max===2"))
    click('返回学习首页','link');wait_for_load();until(lambda:ev("Boolean(document.querySelector('.chapter-card'))"))
    check('nondefault_course_survives_watch_back_navigation',ev("new URLSearchParams(location.search).get('course')==="+json.dumps(course_id)))
    # Save a note on published lesson B, then remove B from the draft only.
    lesson_b=api_call('/api/catalog/current?course='+course_id)['data']['course']['chapters'][0]['lessons'][1]['id']
    visit(BASE+'watch.html?course='+course_id+'&lesson='+lesson_b,'#lesson-title')
    click('随堂笔记 0','tab');type_into('笔记内容','发布课时的笔记应保留');click('保存笔记','button')
    key='CoursePortal.v1:'+course_id
    check('published_lesson_note_persisted',ev("JSON.parse(localStorage.getItem("+json.dumps(key)+")).lessons["+json.dumps(lesson_b)+"].notes.length===1"))
    detail=api_call('/api/manage/courses/'+course_id)['data'];lesson_a=detail['course']['chapters'][0]['lessons'][0]['id'];detail['course']['chapters'][0]['lessons'].pop()
    api_call('/api/manage/courses/'+course_id,'PUT',{'course':detail['course'],'expectedRevision':detail['revision']})
    visit(BASE+'watch.html?course='+course_id+'&lesson='+lesson_a+'&preview=1','#lesson-title')
    check('draft_preview_does_not_overwrite_published_notes',ev("JSON.parse(localStorage.getItem("+json.dumps(key)+")).lessons["+json.dumps(lesson_b)+"].notes.length===1"))
    visit(BASE+'watch.html?course='+course_id+'&lesson='+lesson_b+'&tab=notes','.saved-note')
    check('published_note_visible_after_draft_preview',ev("document.querySelector('.saved-note p').textContent==='发布课时的笔记应保留'"))
    # Exercise a real disable action through admin UI and verify revoked credentials.
    login('admin');visit(BASE+'admin.html','#users-table');type_into('搜索账号或姓名','helper')
    ev('window.confirm=()=>true');click('停用','button')
    until(lambda:ev("document.querySelector('#users-table')?.textContent.includes('已停用')"))
    check('admin_can_disable_account_in_ui',ev("document.querySelector('#users-table').textContent.includes('已停用')"))
    check('disabled_account_cannot_login',api_call('/api/login','POST',{'username':'helper','password':'Helper-browser-923!'})['status']==401)
    visit(BASE+'admin.html#audit','.audit-table')
    check('audit_page_contains_real_course_and_account_actions',ev("document.querySelector('.audit-table').textContent.includes('发布课程')&&document.querySelector('.audit-table').textContent.includes('停用账号')"))
    shot('b1-audit.png')
    print('B1 SUPPLEMENT: '+str(len(results))+' passed')
finally:
    EVIDENCE.joinpath('b1-browser-supplement.json').write_text(json.dumps({'passed':len(results),'results':results},ensure_ascii=False,indent=2),encoding='utf-8')

