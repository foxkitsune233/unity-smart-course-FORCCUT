import json,time
from pathlib import Path
exec(Path(r'D:\unity\CoursePortal\tests\browser_acceptance.py').read_text(encoding='utf-8').split('\ntry:\n')[0])
BASE='http://127.0.0.1:8091/'
def call(path,body=None):
 return ev("(async()=>{let s=await(await fetch('/api/session')).json();let r=await fetch("+json.dumps(path)+",{method:"+json.dumps('POST' if body is not None else 'GET')+",headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrfToken},body:"+('undefined' if body is None else json.dumps(json.dumps(body)))+"});return {status:r.status,data:await r.json()}})()")
call('/api/logout',{});call('/api/login',{'username':'teacher','password':'Teacher-browser-923!','portal':'teacher'})
c=call('/api/teaching/classes')['data']['classes'][0]['id']
rubric=[{'id':'r1','title':'实验成果','maxScore':100,'weight':100}]
t=call('/api/teaching/classes/'+c+'/tasks',{'title':'QA实验提交','type':'lab','labId':'lab02','maxScore':100,'weight':0,'rubric':rubric,'maxAttempts':10})['data']['task']['id']
call('/api/teaching/tasks/'+t+'/publish',{})
call('/api/logout',{});call('/api/login',{'username':'student','password':'Student-browser-923!','portal':'student'})
goto_url(BASE+'lab/?lab=lab02&task='+t);wait_for_load()
until(lambda:ev('Boolean(window.unityLab?.ready&&document.querySelector("#course-submit"))'),60)
ev("unityLab.command('state')");until(lambda:ev('document.querySelectorAll("#course-checks p").length>0'))
check('task panel and template checks loaded',True)
ev("unityLab.command('play')");time.sleep(3);click('提交实验到任务','button')
until(lambda:len(call('/api/teaching/student/submissions')['data']['submissions'])>0,15)
sub=call('/api/teaching/student/submissions')['data']['submissions'][0]['id']
detail=call('/api/teaching/submissions/'+sub)['data']['submission']
check('edit scene exported and submitted',json.loads(detail['sceneJson'])['experimentId']=='lab02')
check('observed rule evidence attached',detail['checkResult']['clientObserved'] and len(detail['checkResult']['checks'])>0)
ev("unityLab.command('stop')")
goto_url(BASE+'tasks.html');wait_for_load();until(lambda:ev("Boolean(document.querySelector('[data-action=open-task]'))"))
click('查看与重做','button');until(lambda:ev('Boolean(document.querySelector("input[type=file]"))'))
node=cdp('DOM.getDocument')['root']['nodeId'];fileNode=cdp('DOM.querySelector',nodeId=node,selector='input[type=file]')['nodeId']
cdp('DOM.setFileInputFiles',nodeId=fileNode,files=[r'D:\unity\UnityCourseLab2021\Assets\Resources\CourseArt\License.txt'])
click('提交','button');until(lambda:ev('!document.querySelector("#submit-dialog").open'),15)
subs=call('/api/teaching/student/submissions')['data']['submissions'];last=call('/api/teaching/submissions/'+subs[0]['id'])['data']['submission']
check('student file uploaded and bound',len(last['files'])==1)
print(json.dumps(results,ensure_ascii=False))
