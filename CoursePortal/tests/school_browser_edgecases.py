"""Incomplete teacher drafts remain previewable; temporary data is restored."""
from pathlib import Path
exec(Path(r'D:\unity\CoursePortal\tests\b1_browser_acceptance.py').read_text(encoding='utf-8').split('\ntry:\n')[0])
original=None
try:
    visit(BASE+'login.html','#login-form');login('teacher')
    detail=api_call('/api/manage/courses/'+COURSE)['data'];original=detail['course']
    edited=json.loads(json.dumps(original));edited['chapters'].append({'id':'empty-draft-ch','number':12,'title':'暂未配置的草稿章节','description':'预览应提示尚无课时','hours':None,'code':'CH12','knowledgeCode':'','textbookChapters':[],'lessons':[]})
    response=api_call('/api/manage/courses/'+COURSE,'PUT',{'course':edited,'expectedRevision':detail['revision']})
    check('draft_may_have_an_incomplete_chapter',response['status']==200)
    visit(BASE+'?course='+COURSE+'&preview=1','.chapter-card')
    check('incomplete_chapter_preview_has_disabled_card_without_crashing',ev("document.querySelectorAll('.chapter-card').length===12&&document.querySelector('[data-chapter-id=empty-draft-ch]')?.getAttribute('aria-disabled')==='true'"))
    check('preview_still_renders_recent_notes_after_incomplete_chapter',ev("document.querySelector('#recent-notes-list').children.length>0"))
    print('SCHOOL EDGECASES: '+str(len(results))+' passed')
finally:
    if original:
        current=api_call('/api/manage/courses/'+COURSE)['data']
        api_call('/api/manage/courses/'+COURSE,'PUT',{'course':original,'expectedRevision':current['revision']})
    EVIDENCE.joinpath('school-browser-edgecases.json').write_text(json.dumps({'passed':len(results),'results':results},ensure_ascii=False,indent=2),encoding='utf-8')
