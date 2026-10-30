"""Published course description/outcomes/integration verification on disposable QA data."""
from pathlib import Path
exec(Path(r'D:\unity\CoursePortal\tests\b1_browser_acceptance.py').read_text(encoding='utf-8').split('\ntry:\n')[0])
try:
    visit(BASE+'login.html','#login-form');login('teacher');editor()
    type_into('课程介绍','通过对象观察与运行实验理解脚本行为。')
    type_into('专业育人说明','在素材使用与协作开发中尊重知识产权。')
    save();click('发布课程','button')
    until(lambda:ev("document.querySelector('#page-notice').textContent.includes('已发布')"))
    visit(BASE,'.chapter-card')
    check('published_description_appears_on_student_home',ev("document.querySelector('.hero-copy>p').textContent==='通过对象观察与运行实验理解脚本行为。'"))
    click('课程说明','button')
    check('published_outcomes_visible_to_students',ev("document.querySelector('#about-dialog').textContent.includes('CO1 · 解释对象与组件的关系')"))
    check('published_professional_education_note_visible',ev("document.querySelector('#about-dialog').textContent.includes('在素材使用与协作开发中尊重知识产权。')"))
    shot('b1-course-information.png')
    click('关闭课程说明','button')
    check('backend_private_files_remain_inaccessible',ev("Promise.all(['/server/store.mjs','/.data/local-accounts.txt','/../.course-portal-data/local-accounts.txt'].map(p=>fetch(p).then(r=>[403,404].includes(r.status)))).then(a=>a.every(Boolean))"))
    print('B1 CONTENT: '+str(len(results))+' passed')
finally:
    EVIDENCE.joinpath('b1-browser-content.json').write_text(json.dumps({'passed':len(results),'results':results},ensure_ascii=False,indent=2),encoding='utf-8')
