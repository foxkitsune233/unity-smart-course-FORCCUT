from pathlib import Path
exec(Path(r'D:\unity\CoursePortal\tests\labs12_browser.py').read_text(encoding='utf-8').split('\ntry:\n')[0])
def center(selector):
    return ev('(()=>{const r=document.querySelector('+json.dumps(selector)+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
def native_drag(source,target):
    a=center(source);b=center(target)
    cdp('Input.dispatchMouseEvent',type='mouseMoved',x=a['x'],y=a['y'])
    cdp('Input.dispatchMouseEvent',type='mousePressed',x=a['x'],y=a['y'],button='left',buttons=1,clickCount=1)
    for i in range(1,13):
        t=i/12;cdp('Input.dispatchMouseEvent',type='mouseMoved',x=a['x']+(b['x']-a['x'])*t,y=a['y']+(b['y']-a['y'])*t,button='left',buttons=1);time.sleep(.05)
    time.sleep(.4)
    payload=ev('({type:document.querySelector('+json.dumps(source)+').dataset.assetType,id:document.querySelector('+json.dumps(source)+').dataset.assetId})')
    data={'items':[{'mimeType':'application/x-unity-course-asset','data':json.dumps(payload)}],'dragOperationsMask':1}
    for event in ['dragEnter','dragOver','drop']:cdp('Input.dispatchDragEvent',type=event,x=b['x'],y=b['y'],data=data)
    cdp('Input.dispatchMouseEvent',type='mouseReleased',x=b['x'],y=b['y'],button='left',buttons=0,clickCount=1);time.sleep(.4)
try:
    cdp('Emulation.setDeviceMetricsOverride',width=1800,height=1600,deviceScaleFactor=1,mobile=False)
    lab('lab02')
    cmd('experiment',{'id':'lab02','kind':'demo'})
    native_drag('[data-asset-type="prefab"][data-asset-id="coin"]','#hierarchy')
    until(lambda:any(o['kind']=='coin' for o in state()['scene']['objects']))
    check('native_prefab_drag_creates_scene_object',any(o['kind']=='coin' for o in state()['scene']['objects']))
    native_drag('[data-asset-type=script][data-asset-id=playerMove]','[data-object-id="ground"]')
    until(lambda:'playerMove' in next(o for o in state()['scene']['objects'] if o['id']=='ground')['scripts'])
    check('native_script_drag_attaches_to_floor','playerMove' in next(o for o in state()['scene']['objects'] if o['id']=='ground')['scripts'])
    cmd('select',{'id':'emitter'})
    check('Inspector_displays_emitter_reference',ev('Boolean(document.querySelector("[data-field=projectile]"))'))
    cmd('removeScript',{'id':'ground','behavior':'playerMove'})
    cmd('select',{'id':'projectile'})
    type_into('Speed 速度','6');type_into('Lifetime 存活 (s)','5');click('恢复视角','button')
    until(lambda:next(o for o in state()['scene']['objects'] if o['id']=='projectile')['settings']['lifetime']==5)
    p=next(o for o in state()['scene']['objects'] if o['id']=='projectile')
    check('sequential_Inspector_edits_keep_both_values',p['settings']['speed']==6 and p['settings']['lifetime']==5)
    cmd('select',{'id':'emitter'})
    settings=next(o for o in state()['scene']['objects'] if o['id']=='emitter')['settings'];settings['projectile']='';cmd('configure',{'id':'emitter','settings':settings})
    b=center('[data-field="projectile"]');data={'items':[{'mimeType':'application/x-unity-object','data':'projectile'}],'dragOperationsMask':2}
    for event in ['dragEnter','dragOver','drop']:cdp('Input.dispatchDragEvent',type=event,x=b['x'],y=b['y'],data=data)
    until(lambda:next(o for o in state()['scene']['objects'] if o['id']=='emitter')['settings']['projectile']=='projectile')
    check('Hierarchy_reference_drop_binds_projectile',next(o for o in state()['scene']['objects'] if o['id']=='emitter')['settings']['projectile']=='projectile')
    cmd('experiment',{'id':'lab02','kind':'demo'})
    cdp('Emulation.setDeviceMetricsOverride',width=1600,height=1000,deviceScaleFactor=1,mobile=False)
    shot('labs12-editor-final.png')
finally:
    EVIDENCE.joinpath('labs12-browser-drag.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
