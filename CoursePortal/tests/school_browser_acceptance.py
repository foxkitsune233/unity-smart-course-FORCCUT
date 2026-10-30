"""School curriculum acceptance; all writable exercises use the disposable8091 service."""
from pathlib import Path
exec(Path(r'D:\unity\CoursePortal\tests\b1_browser_acceptance.py').read_text(encoding='utf-8').split('\ntry:\n')[0])
try:
    cdp('Emulation.setDeviceMetricsOverride',width=1440,height=1000,deviceScaleFactor=1,mobile=False)
    visit(BASE,'.chapter-card')
    previous={'version':1,'courseId':COURSE,'lastLessonId':'lesson-10','lessons':{
        'lesson-09':{'position':0,'duration':0,'completed':True,'notes':[{'id':'old-elective','text':'旧资源管理笔记','time':0,'createdAt':'2026-10-26T10:00:00Z'}],'videoUrl':None},
        'lesson-10':{'position':12,'duration':30,'completed':False,'notes':[{'id':'old-save','text':'旧数据保存笔记','time':12,'createdAt':'2026-10-26T10:00:00Z'}],'videoUrl':None}}}
    ev('localStorage.setItem('+json.dumps(KEY)+','+json.dumps(json.dumps(previous))+')')
    visit(BASE,'.chapter-card')
    check('home_has11_teaching_chapters_and12_required_units',ev("document.querySelectorAll('.chapter-card').length===11&&document.querySelector('#chapter-total').textContent==='11'&&document.querySelector('#unit-total').textContent==='/ 12'"))
    check('school_hours_are44_teaching_plus4_assessment',ev("document.querySelector('.hours-breakdown').textContent.includes('44')&&document.querySelector('.hours-breakdown').textContent.includes('4')&&document.querySelector('#school-plan .tag').textContent.includes('48')"))
    check('school_prerequisite_and_open_final_project_are_visible',ev("document.querySelector('#school-plan').textContent.includes('C#基础')&&document.querySelector('#school-plan').textContent.includes('期末开放大作业')"))
    check('both_assessment_scopes_are_visible',ev("document.querySelectorAll('.assessment-plan').length===2&&document.querySelector('#school-plan').textContent.includes('前5章')&&document.querySelector('#school-plan').textContent.includes('期末作品答辩')"))
    check('optional_completion_is_excluded_from_required_progress',ev("document.querySelector('#completed-count').textContent==='0'&&document.querySelector('#progress-percent').textContent==='0%'"))
    check('old_optional_and_required_notes_both_remain_in_home_totals',ev("document.querySelector('#notes-count').textContent==='2'"))
    shot('school-home-desktop.png')
    click('查看11章学时、教材与知识编号对照')
    check('mapping_has11_rows_and_merged_fx_audio_sources',ev("document.querySelectorAll('.curriculum-mapping tbody tr').length===11&&document.querySelectorAll('.curriculum-mapping tbody tr')[6].textContent.includes('7、8')"))
    ev("document.querySelector('#school-plan').scrollIntoView({block:'start'})");shot('school-plan-desktop.png')
    visit(BASE+'watch.html?course='+COURSE+'&lesson=lesson-09&tab=notes','.saved-note')
    check('legacy_lesson09_opens_elective_and_old_note',ev("document.querySelector('#chapter-breadcrumb').textContent.includes('选学')&&document.querySelector('.saved-note p').textContent==='旧资源管理笔记'"))
    check('watch_required_progress_excludes_elective',ev("document.querySelector('#catalog-total').textContent==='12'&&document.querySelector('#catalog-completed').textContent==='0'&&document.querySelector('#catalog-progress').max===12"))
    visit(BASE+'watch.html?course='+COURSE+'&lesson=lesson-10&tab=notes','.saved-note')
    check('legacy_lesson10_moves_to_chapter08_with_note_preserved',ev("document.querySelector('#chapter-breadcrumb').textContent.startsWith('第8章')&&document.querySelector('.saved-note p').textContent==='旧数据保存笔记'"))
    for lesson_id,number in [('lesson-11',9),('lesson-13',10),('lesson-12',11)]:
        visit(BASE+'watch.html?course='+COURSE+'&lesson='+lesson_id,'#lesson-title')
        check('legacy_'+lesson_id+'_maps_to_school_chapter'+str(number),ev("document.querySelector('#chapter-breadcrumb').textContent.startsWith('第"+str(number)+"章')"))
    visit(BASE+'watch.html?course='+COURSE+'&lesson=lesson-07','.catalog-lesson')
    check('chapter07_keeps_separate_effects_and_audio_units',ev("Array.from(document.querySelectorAll('.catalog-lesson')).some(a=>a.href.includes('lesson-08'))&&document.querySelector('#chapter-breadcrumb').textContent.includes('特效与音频')"))
    login('teacher');editor()
    check('teacher_editor_has11_chapters_and_school_plan',ev("document.querySelectorAll('.chapter-editor').length===11&&document.querySelector('#school-plan').textContent.includes('48学时')&&document.querySelector('[data-path=hours]').value==='48'"))
    type_into('选学视频资源标识','school-optional-resource');save()
    cdp('Page.reload',ignoreCache=True);wait_for_load();until(lambda:ev("Boolean(document.querySelector('#course-editor'))"))
    detail=api_call('/api/manage/courses/'+COURSE)['data']
    check('teacher_save_reload_retains_assessments_mappings_and_optional_resource',detail['course']['curriculum']['optionalChapters'][0]['lessons'][0]['video']['resourceId']=='school-optional-resource' and detail['course']['chapters'][6]['textbookChapters']==[7,8] and len(detail['course']['curriculum']['assessments'])==2)
    ev('scrollTo(0,0)');shot('school-teacher-desktop.png')
    cdp('Emulation.setDeviceMetricsOverride',width=390,height=844,deviceScaleFactor=1,mobile=True)
    check('aligned_teacher_mobile_no_horizontal_overflow',ev('document.documentElement.scrollWidth<=innerWidth'))
    shot('school-teacher-mobile.png')
    visit(BASE,'.chapter-card');click('查看11章学时、教材与知识编号对照')
    check('aligned_home_mobile_mapping_has_contained_scroll',ev('document.documentElement.scrollWidth<=innerWidth'))
    ev("document.querySelector('#school-plan').scrollIntoView({block:'start'})");shot('school-plan-mobile.png')
    print('SCHOOL CURRICULUM: '+str(len(results))+' passed')
finally:
    EVIDENCE.joinpath('school-browser-acceptance.json').write_text(json.dumps({'passed':len(results),'results':results},ensure_ascii=False,indent=2),encoding='utf-8')
    cdp('Emulation.clearDeviceMetricsOverride')
