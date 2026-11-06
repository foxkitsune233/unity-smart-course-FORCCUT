import json,time
from pathlib import Path
exec(Path(r'D:\unity\CoursePortal\tests\browser_acceptance.py').read_text(encoding='utf-8').split('\ntry:\n')[0])
BASE='http://127.0.0.1:8091/'
new_tab(BASE+'login.html');wait_for_load()
cdp('Emulation.setDeviceMetricsOverride',width=1400,height=1000,deviceScaleFactor=1,mobile=False)
def call(path,body=None):
 return ev("(async()=>{let s=await(await fetch('/api/session')).json();let r=await fetch("+json.dumps(path)+",{method:"+json.dumps('POST' if body is not None else 'GET')+",headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrfToken},body:"+('undefined' if body is None else json.dumps(json.dumps(body)))+"});return {status:r.status,data:await r.json()}})()")
check('teacher login',call('/api/login',{'username':'teacher','password':'Teacher-browser-923!','portal':'teacher'})['status']==200)
c=call('/api/teaching/classes',{'courseId':'unity-script-2021','name':'QA课堂'})['data']['class']['id']
call('/api/teaching/classes/'+c+'/roster',{'rows':[{'username':'student','studentNo':'QA1','name':'测试学生'}]})
goto_url(BASE+'learning-tools.html?portal=teacher#questions');wait_for_load();until(lambda:ev("Boolean(document.querySelector('#editor'))"))
type_into('题目','Unity中描述位置的组件是什么？')
type_into('选项（每行一个，判断题填正确、错误）','Transform\nCanvas')
type_into('正确选项序号','1')
type_into('答案解析','Transform 保存物体的位置、旋转与缩放。')
click('保存','button');until(lambda:ev("document.querySelector('.tools-card h3')?.textContent.includes('Unity')"))
check('teacher question saved through UI',True)
q=call('/api/tools/questions')['data']['items'][0]['id']
quiz=call('/api/tools/quizzes',{'classId':c,'title':'课堂自测','questionIds':[q]})['data']['item']['id']
call('/api/tools/knowledge',{'title':'Transform','content':'Unity Transform 描述位置、旋转、缩放。','published':True})
call('/api/logout',{})
check('student login',call('/api/login',{'username':'student','password':'Student-browser-923!','portal':'student'})['status']==200)
goto_url(BASE+'learning-tools.html#quizzes');wait_for_load();until(lambda:ev("Boolean(document.querySelector('[data-quiz]'))"))
check('student teacher controls hidden',not ev("Boolean(document.querySelector('[href=\"#questions\"],[href=\"#rules\"]'))"))
click('进入测验','button');until(lambda:ev("Boolean(document.querySelector('#quiz-form'))"))
click('Transform');click('提交答案','button');until(lambda:ev("Boolean(document.querySelector('.result-score'))"))
check('student server-graded 100',ev("document.querySelector('.result-score').textContent.includes('100')"))
check('student cannot access rules',call('/api/tools/rules?classId='+c)['status']==403)
shot('learning-tools-student-qa.png')
print(json.dumps(results,ensure_ascii=False))
