"""Native mouse drag/drop acceptance for Unity prefabs and script components."""
import base64
import json
import time
from pathlib import Path

exec(Path(r"D:\unity\UnityCourseLab2021\Tools\browser_acceptance.py").read_text(encoding="utf-8").split("\ntry:\n")[0])
from PIL import Image
import io,math
movement_source=Path(r"D:\unity\UnityCourseLab2021\Tools\browser_movement_acceptance.py").read_text(encoding="utf-8")
exec("def position():"+movement_source.split("def position():",1)[1].split("\ntry:\n",1)[0])

def rect(selector):
    return json.loads(evaluate("JSON.stringify((()=>{const r=document.querySelector("+json.dumps(selector)+").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})())"))

def center(selector):
    r=rect(selector);return (r["x"]+r["width"]/2,r["y"]+r["height"]/2)

def native_drag(source_id,target_point):
    start=center("#"+source_id)
    cdp("Input.dispatchMouseEvent",type="mouseMoved",x=start[0],y=start[1])
    cdp("Input.dispatchMouseEvent",type="mousePressed",x=start[0],y=start[1],button="left",buttons=1,clickCount=1)
    time.sleep(0.1)
    for step in range(1,13):
        t=step/12
        cdp("Input.dispatchMouseEvent",type="mouseMoved",x=start[0]+(target_point[0]-start[0])*t,y=start[1]+(target_point[1]-start[1])*t,button="left",buttons=1)
        time.sleep(0.045)
    # Chromium's native dragover is throttled; dwell on the destination before releasing.
    time.sleep(0.25)
    cdp("Input.dispatchMouseEvent",type="mouseMoved",x=target_point[0],y=target_point[1],button="left",buttons=1)
    time.sleep(0.2)
    cdp("Input.dispatchMouseEvent",type="mouseReleased",x=target_point[0],y=target_point[1],button="left",buttons=0,clickCount=1)
    time.sleep(0.3)

def object_by_id(object_id):
    return next(item for item in state()["scene"]["objects"] if item["id"]==object_id)

def select_row(object_id):
    point=center('[data-object-id="'+object_id+'"]');click_at_xy(*point)
    until(lambda:state()["selectedId"]==object_id)

def scripts_equal(scene_a,scene_b):
    same_scene(scene_a,scene_b)
    for a,b in zip(scene_a["objects"],scene_b["objects"]): assert a["scripts"]==b["scripts"]

try:
    goto_url("http://127.0.0.1:8088/");wait_for_load();ready()
    evaluate("localStorage.removeItem('UnityCourseLab.Scene.v1')")
    cdp("Page.reload",ignoreCache=True);wait_for_load();ready();time.sleep(0.3)
    evaluate("window.assetDragStarts=[];document.addEventListener('dragstart',e=>assetDragStarts.push({source:e.target.id,payload:e.dataTransfer.getData('application/x-unity-course-asset')}))")
    canvas=rect('#unity-canvas');placement=(canvas['x']+canvas['width']*0.52,canvas['y']+canvas['height']*0.68)
    native_drag('asset-ground',placement)
    until(lambda:len(state()['scene']['objects'])==1,5)
    floor_id=state()['selectedId'];assert object_by_id(floor_id)['kind']=='ground'
    assert evaluate("assetDragStarts.some(x=>x.source==='asset-ground')"),'native source dragstart missing'
    mark('drag_floor_prefab_into_scene',object_by_id(floor_id)['position'])
    native_drag('asset-sphere',placement)
    until(lambda:len(state()['scene']['objects'])==2,5)
    ball_id=state()['selectedId'];assert object_by_id(ball_id)['kind']=='sphere'
    mark('drag_sphere_prefab_into_scene',object_by_id(ball_id)['position'])

    origin,_,_=handles();native_drag('script-drop',origin)
    until(lambda:object_by_id(ball_id)['scripts']==['drop'],5)
    mark('drag_script_onto_actual_scene_object',object_by_id(ball_id)['scripts'])
    native_drag('script-spin',center('#script-dropzone'))
    until(lambda:object_by_id(ball_id)['scripts']==['drop','spin'],5)
    mark('drag_second_script_into_inspector',object_by_id(ball_id)['scripts'])

    native_drag('script-platform',center('[data-object-id="'+floor_id+'"]'))
    until(lambda:object_by_id(floor_id)['scripts']==['platform'],5)
    mark('drag_platform_script_onto_floor_hierarchy',object_by_id(floor_id)['scripts'])
    time.sleep(0.2);origin,_,_=handles();native_drag('script-spin',origin)
    until(lambda:object_by_id(floor_id)['scripts']==['platform','spin'],5)
    mark('floor_accepts_multiple_compatible_components',object_by_id(floor_id)['scripts'])

    native_drag('script-launch',center('[data-object-id="'+ball_id+'"]'))
    until(lambda:state()['error'],5)
    assert object_by_id(ball_id)['scripts']==['drop','spin']
    mark('conflicting_motion_drop_is_rejected',state()['message'])
    native_drag('script-drop',center('[data-object-id="'+floor_id+'"]'))
    assert object_by_id(floor_id)['scripts']==['platform','spin'] and state()['error']
    mark('incompatible_floor_script_preserves_components',state()['message'])

    select_row(ball_id);click_named('移除自转')
    until(lambda:object_by_id(ball_id)['scripts']==['drop'])
    mark('remove_script_component',object_by_id(ball_id)['scripts'])
    native_drag('script-spin',center('#script-dropzone'))
    until(lambda:object_by_id(ball_id)['scripts']==['drop','spin'])
    before=state()['scene'];click_named('保存实验 Ctrl S')
    saved=json.loads(evaluate("localStorage.getItem('UnityCourseLab.Scene.v1')"));scripts_equal(before,saved)
    mark('save_both_objects_component_lists',saved)

    click_named('▶ 运行');until(lambda:state()['mode']=='play')
    floor_start=next(item['position']['x'] for item in before['objects'] if item['id']==floor_id)
    ball_height=next(item['position']['y'] for item in before['objects'] if item['id']==ball_id)
    until(lambda:state()['elapsed']>2 and abs(object_by_id(floor_id)['position']['x']-floor_start)>0.15 and object_by_id(floor_id)['rotation']['y']>5 and state()['contacts']>=1 and 0.35<object_by_id(ball_id)['position']['y']<0.7)
    mark('floor_platform_and_spin_scripts_really_execute',{'floorPosition':object_by_id(floor_id)['position'],'floorRotation':object_by_id(floor_id)['rotation'],'ballHeight':object_by_id(ball_id)['position']['y'],'contacts':state()['contacts']})
    assert evaluate("document.getElementById('script-platform').disabled && !document.getElementById('asset-ground').draggable")
    count=len(state()['scene']['objects']);native_drag('asset-ground',placement)
    assert len(state()['scene']['objects'])==count
    mark('play_mode_disables_asset_dragging',{'objects':count})
    click_named('■ 停止');until(lambda:state()['mode']=='edit');scripts_equal(before,state()['scene'])
    mark('stop_restores_prefabs_and_components',state()['scene'])

    cdp('Page.reload',ignoreCache=True);wait_for_load();ready();scripts_equal(before,state()['scene'])
    mark('refresh_restores_all_attached_scripts',state()['scene'])
    select_row(floor_id);time.sleep(0.25)
    shot=cdp('Page.captureScreenshot',format='png',captureBeyondViewport=False)
    (EVIDENCE/'browser-asset-drag.png').write_bytes(base64.b64decode(shot['data']))
    report={'passed':True,'engine':state()['version'],'tests':results,'finalState':state()}
    (EVIDENCE/'browser-asset-tests.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print('ASSET RESULT: '+str(len(results))+'/'+str(len(results))+' passed')
except Exception as error:
    report={'passed':False,'tests':results,'error':str(error),'state':state(),'nativeDragStarts':evaluate('window.assetDragStarts||[]')}
    (EVIDENCE/'browser-asset-tests.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False));raise
