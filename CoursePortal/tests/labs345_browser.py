"""Real Unity2021 CH03–05 acceptance; isolated8091 and browser-harness."""
from pathlib import Path
exec(Path(r'D:\unity\CoursePortal\tests\labs12_browser.py').read_text(encoding='utf-8').split('\ntry:\n')[0])

def reset(n,kind='demo'):
    lab(n);cmd('experiment',{'id':n,'kind':kind})
def obj(id):return next(o for o in state()['scene']['objects'] if o['id']==id)
def configure(id,**changes):
    values=obj(id)['settings'].copy();values.update(changes);cmd('configure',{'id':id,'settings':values})
def start():
    click('▶ 运行','button');until(lambda:state()['mode']=='play')
def stop():
    click('■ 停止','button');until(lambda:state()['mode']=='edit')
def press_space():
    cdp('Input.dispatchKeyEvent',type='keyDown',key=' ',code='Space',windowsVirtualKeyCode=32);time.sleep(.05)
    cdp('Input.dispatchKeyEvent',type='keyUp',key=' ',code='Space',windowsVirtualKeyCode=32)
def ui_click(action):
    pos={'damage':(-75,133),'heal':(75,133),'addItem':(-75,203),'removeItem':(75,203)}[action]
    r=ev('document.querySelector("#unity-canvas").getBoundingClientRect().toJSON()')
    if (obj('health') if action in ['damage','heal'] else obj('inventory'))['settings']['layout']=='wide':pos=(pos[0]*2,pos[1])
    scale=((r['width']/1000)*(r['height']/650))**.5
    click_at_xy(r['x']+r['width']/2+pos[0]*scale,r['y']+pos[1]*scale);time.sleep(.25)
try:
    reset('lab03');check('LAB03_default_valid',not state()['errors']);before=state()['scene']
    start();until(lambda:state()['grounded'] and state()['physicsContacts']>0,8)
    check('LAB03_3D_collision_and_ground_ray',state()['rayHits']>0 and state()['physicsContacts']>0)
    press_space();until(lambda:state()['jumps']==1)
    press_space();time.sleep(.15)
    check('LAB03_air_jump_rejected',state()['jumps']==1 and state()['rejectedJumps']>0)
    until(lambda:state()['grounded'],8)
    key('KeyD','d',.85)
    until(lambda:state()['completed'],8)
    check('LAB03_true_trigger_contact_and_jump_complete',state()['completed'] and state()['triggers']>0)
    shot('labs345-ch03-play.png');stop();check('LAB03_snapshot_restored',state()['scene']==before)
    configure('ball',mass=0)
    click('▶ 运行','button');time.sleep(.3)
    check('LAB03_bad_mass_blocks_run',state()['mode']=='edit' and any(e['field']=='mass' for e in state()['errors']))
    configure('ball',mass=2.5,friction=.2,bounce=.6);cmd('save')
    cdp('Page.reload',ignoreCache=True);wait_for_load();until(lambda:ev('Boolean(window.unityLab?.ready)'),60)
    check('LAB03_physics_settings_saved',abs(obj('ball')['settings']['mass']-2.5)<.01 and abs(obj('ball')['settings']['friction']-.2)<.01)
    reset('lab04');check('LAB04_default_valid',not state()['errors']);before4=state()['scene']
    configure('mover',space='world');start();key('KeyD','d',.35);world=state()['worldPosition'];stop()
    configure('mover',space='local');start();key('KeyD','d',.35);local=state()['worldPosition'];stop()
    check('LAB04_local_world_axes_differ',abs(world['z']-local['z'])>.3,{'world':world,'local':local})
    start();until(lambda:state()['coordinateDistance']<=obj('mover')['settings']['stopDistance']+.02,12)
    check('LAB04_approach_stops_and_completes',state()['completed'] and state()['coordinateDistance']>=0)
    check('LAB04_reports_actual_local_position',state()['localPosition']!=state()['worldPosition'])
    settled=state()['worldPosition'];time.sleep(.4);check('LAB04_no_overshoot_oscillation',all(abs(state()['worldPosition'][a]-settled[a])<.02 for a in ['x','y','z']))
    shot('labs345-ch04-play.png');stop()
    configure('mover',target='');click('▶ 运行','button');time.sleep(.3)
    check('LAB04_missing_target_blocks_run',state()['mode']=='edit' and any(e['field']=='target' for e in state()['errors']))
    configure('mover',target='destination');cmd('save')
    reset('lab05');check('LAB05_default_valid',not state()['errors']);before5=state()['scene']
    start();initial=state()['health'];ui_click('damage')
    check('LAB05_real_UGUI_damage_once',state()['health']==initial-obj('health')['settings']['damage'] and state()['healthChanges']==1,{'health':state()['health'],'changes':state()['healthChanges']})
    ui_click('heal');check('LAB05_real_UGUI_heals_clamped',state()['health']<=obj('health')['settings']['maxHealth'] and state()['healthChanges']==2)
    for _ in range(obj('inventory')['settings']['capacity']+1):ui_click('addItem')
    check('LAB05_inventory_capacity_rejects_overflow',state()['inventoryCount']==obj('inventory')['settings']['capacity'] and state()['inventoryRejected']==1)
    ui_click('removeItem');ui_click('addItem')
    check('LAB05_capacity_reusable_after_remove',state()['inventoryCount']==obj('inventory')['settings']['capacity'] and state()['inventoryRejected']==1)
    check('LAB05_interaction_task_complete',state()['completed'])
    shot('labs345-ch05-play.png');stop();check('LAB05_stop_restores_configuration',state()['scene']==before5 and state()['healthChanges']==0)
    configure('inventory',capacity=0);click('▶ 运行','button');time.sleep(.3)
    check('LAB05_invalid_capacity_blocks_run',state()['mode']=='edit' and any(e['field']=='capacity' for e in state()['errors']))
    configure('inventory',capacity=3,layout='wide');configure('health',layout='wide');cmd('save')
    cdp('Page.reload',ignoreCache=True);wait_for_load();until(lambda:ev('Boolean(window.unityLab?.ready)'),60)
    check('LAB05_UGUI_settings_saved',obj('inventory')['settings']['capacity']==3 and obj('health')['settings']['layout']=='wide')
    start();ui_click('damage');check('LAB05_wide_layout_buttons_work',state()['healthChanges']==1)
    stop();shot('labs345-ch05-editor.png')
finally:
    EVIDENCE.joinpath('labs345-browser.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
