import json,time
from pathlib import Path
exec(Path(r'D:\unity\CoursePortal\tests\browser_acceptance.py').read_text(encoding='utf-8').split('\ntry:\n')[0])
BASE='http://127.0.0.1:8091/'
new_tab(BASE+'login.html');wait_for_load();cdp('Emulation.setDeviceMetricsOverride',width=1500,height=1000,deviceScaleFactor=1,mobile=False)
def call(path,body=None,method='POST'):
 return ev("(async()=>{const s=await(await fetch('/api/session')).json();const r=await fetch("+json.dumps(path)+",{method:"+json.dumps(method if body is not None else 'GET')+",headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrfToken},body:"+('undefined' if body is None else json.dumps(json.dumps(body)))+"});return {status:r.status,data:await r.json()}})()")
check('teacher login',call('/api/login',{'username':'teacher','password':'Teacher-browser-923!','portal':'teacher'})['status']==200)
cls=call('/api/teaching/classes',{'courseId':'unity-script-2021','name':'TC验收班'})['data']['class']['id']
goto_url(BASE+'learning-tools.html?portal=teacher#prep');wait_for_load();until(lambda:ev('Boolean(document.querySelector("#prep-generate"))'))
click('生成草稿','button');until(lambda:ev('Boolean(document.querySelector("#prep-editor form"))'))
check('structured lesson plan generated',ev('document.querySelector("#prep-editor textarea").value.includes("Unity 2021")'))
type_into('审核说明','已核对Unity教学目标与实验要求')
click('审核采用','button');until(lambda:ev('document.querySelector("#prep-editor").textContent.includes("approved")'))
click('查看历史版本','button');until(lambda:ev('document.querySelectorAll("#prep-editor details").length>=3'))
check('edited and approved draft history',True)
a=call('/api/tools/knowledge',{'title':'Transform','content':'位置旋转缩放','published':True})['data']['item']['id']
call('/api/tools/knowledge',{'title':'移动','content':'使用Transform移动','published':True,'prerequisites':[a]})
goto_url(BASE+'learning-tools.html?portal=teacher#knowledge');wait_for_load();until(lambda:ev('Boolean(document.querySelector("svg.knowledge-graph"))'))
check('knowledge graph rendered with edge',ev('document.querySelectorAll("svg.knowledge-graph path").length>=2'))
goto_url(BASE+'teaching.html#report/'+cls);wait_for_load();until(lambda:ev('Boolean(document.querySelector("[data-action=matrix-edit]"))'))
click('编辑评分点矩阵','button');until(lambda:ev('Boolean(document.querySelector("#matrix-add"))'))
click('保存新版本','button');until(lambda:ev('!document.querySelector("#matrix-add")'))
check('matrix version saved through UI',ev('document.querySelector("#teaching-view").textContent.includes("矩阵版本 1")'))
shot('tc-completion-report.png')
print(json.dumps(results,ensure_ascii=False))
