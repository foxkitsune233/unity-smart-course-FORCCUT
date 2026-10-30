"""Real mouse acceptance for Unity scene movement; run through Browser Harness."""
import base64
import io
import json
import math
import time
from pathlib import Path
from PIL import Image

# Existing workflow must still pass on the current build before testing new interactions.
exec(Path(r"D:\unity\UnityCourseLab2021\Tools\browser_acceptance.py").read_text(encoding="utf-8"))
baseline_count=len(results)
results=[]

def position():
    current=state()
    return next(item["position"] for item in current["scene"]["objects"] if item["id"]==current["selectedId"])

def close_position(a,b,epsilon=0.001):
    return all(abs(a[axis]-b[axis])<epsilon for axis in ("x","y","z"))

def reset_position():
    evaluate("document.activeElement.blur();unityLab.command('position',{id:unityLab.state.selectedId,position:{x:0,y:3,z:0}})")
    until(lambda: close_position(position(),{"x":0,"y":3,"z":0}))
    time.sleep(0.25)

def handles():
    # C# readiness precedes the first native-rendered canvas frame after reload.
    # Await actual colored handles instead of treating a JS animation frame as Unity render completion.
    for attempt in range(12):
        shot=cdp("Page.captureScreenshot",format="png",captureBeyondViewport=False)
        raw=base64.b64decode(shot["data"])
        image=Image.open(io.BytesIO(raw)).convert("RGB")
        rect=json.loads(evaluate("JSON.stringify((()=>{const r=document.getElementById('unity-canvas').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})())"))
        points={axis:[] for axis in ("x","y","z")}
        pixels=image.load()
        for py in range(int(rect["y"])+10,int(rect["y"]+rect["height"])-65):
            for px in range(int(rect["x"])+10,int(rect["x"]+rect["width"])-10):
                r,g,b=pixels[px,py]
                if r>190 and r>g*1.4 and r>b*1.4: points["x"].append((px,py))
                elif g>170 and g>r*1.3 and g>b*1.3: points["y"].append((px,py))
                elif b>190 and b>r*1.3 and b>g*1.15: points["z"].append((px,py))
        if all(len(values)>20 for values in points.values()): break
        if attempt==0: (EVIDENCE/"movement-before-first-render.png").write_bytes(raw)
        time.sleep(0.15)
    lines={};aa=ab=bb=ac=bc=0
    for axis,values in points.items():
        assert len(values)>20,("Visible axis missing",axis,len(values))
        mx=sum(p[0] for p in values)/len(values); my=sum(p[1] for p in values)/len(values)
        xx=sum((p[0]-mx)**2 for p in values); yy=sum((p[1]-my)**2 for p in values); xy=sum((p[0]-mx)*(p[1]-my) for p in values)
        angle=0.5*math.atan2(2*xy,xx-yy)
        nx=-math.sin(angle);ny=math.cos(angle);c=nx*mx+ny*my
        aa+=nx*nx;ab+=nx*ny;bb+=ny*ny;ac+=nx*c;bc+=ny*c
        lines[axis]={"point":(mx,my),"pixels":len(values)}
    determinant=aa*bb-ab*ab
    origin=((ac*bb-bc*ab)/determinant,(bc*aa-ac*ab)/determinant)
    return origin,lines,raw

def free_grab(origin,lines):
    def distance_to_handle(point,tip):
        direction=(tip[0]-origin[0],tip[1]-origin[1]); start=(origin[0]+direction[0]*0.25,origin[1]+direction[1]*0.25)
        dx=tip[0]-start[0];dy=tip[1]-start[1]
        t=max(0,min(1,((point[0]-start[0])*dx+(point[1]-start[1])*dy)/(dx*dx+dy*dy)))
        return math.hypot(point[0]-(start[0]+t*dx),point[1]-(start[1]+t*dy))
    candidates=[(origin[0]+dx,origin[1]+dy) for dx,dy in [(-9,12),(9,12),(-13,0),(0,14),(10,-10),(-10,-10)]]
    return max(candidates,key=lambda point:min(distance_to_handle(point,line["point"]) for line in lines.values()))

def drag(start,end,cancel=False):
    cdp("Input.dispatchMouseEvent",type="mouseMoved",x=start[0],y=start[1])
    cdp("Input.dispatchMouseEvent",type="mousePressed",x=start[0],y=start[1],button="left",buttons=1,clickCount=1)
    time.sleep(0.12)
    for step in range(1,9):
        t=step/8
        cdp("Input.dispatchMouseEvent",type="mouseMoved",x=start[0]+(end[0]-start[0])*t,y=start[1]+(end[1]-start[1])*t,button="left",buttons=1)
        time.sleep(0.055)
    if cancel:
        key("Escape","Escape",27);time.sleep(0.12)
    cdp("Input.dispatchMouseEvent",type="mouseReleased",x=end[0],y=end[1],button="left",buttons=0,clickCount=1)
    time.sleep(0.25)

try:
    ready();reset_position()
    origin,lines,raw=handles()
    (EVIDENCE/"movement-before.png").write_bytes(raw)
    grab=free_grab(origin,lines);start=position()
    drag(grab,(grab[0]+62,grab[1]+34))
    moved=position()
    assert abs(moved["y"]-start["y"])<0.001,("Free drag changed height",start,moved)
    assert abs(moved["x"]-start["x"])+abs(moved["z"]-start["z"])>0.2,("Object did not move",start,moved,origin,lines,grab)
    mark("mouse_drag_moves_object_on_horizontal_plane",{"before":start,"after":moved})

    for axis in ("x","y","z"):
        reset_position();origin,lines,_=handles();tip=lines[axis]["point"]
        dx=tip[0]-origin[0];dy=tip[1]-origin[1];length=math.hypot(dx,dy)
        start=position();drag(tip,(tip[0]+dx/length*43,tip[1]+dy/length*43));moved=position()
        assert abs(moved[axis]-start[axis])>0.2,(axis,"target axis did not change",start,moved)
        for other in ("x","y","z"):
            if other!=axis: assert abs(moved[other]-start[other])<0.001,(axis,"untouched axis changed",other,start,moved)
        mark("mouse_"+axis+"_handle_constrains_to_one_axis",{"before":start,"after":moved})

    reset_position();origin,lines,_=handles();grab=free_grab(origin,lines);start=position()
    drag(grab,(grab[0]-70,grab[1]+30),cancel=True)
    assert close_position(position(),start),("Escape did not restore",start,position())
    mark("escape_cancels_current_drag",start)

    origin,lines,_=handles();grab=free_grab(origin,lines)
    drag(grab,(grab[0]+67,grab[1]+26));precise=position()
    click_named("保存实验 Ctrl S")
    saved=json.loads(evaluate("localStorage.getItem('UnityCourseLab.Scene.v1')"))
    saved_position=next(item["position"] for item in saved["objects"] if item["id"]==state()["selectedId"])
    assert close_position(precise,saved_position,0.00001),("Save rounded drag position",precise,saved_position)
    mark("save_keeps_precise_drag_coordinates",saved_position)
    cdp("Page.reload",ignoreCache=True);wait_for_load();ready()
    assert close_position(position(),precise,0.00001),("Reload lost dragged position",precise,position())
    mark("refresh_restores_dragged_scene",position())

    evaluate("unityLab.command('behavior',{id:unityLab.state.selectedId,behavior:'none'})")
    before_play=position();origin,lines,_=handles();grab=free_grab(origin,lines)
    click_named("▶ 运行");until(lambda: state()["mode"]=="play")
    drag(grab,(grab[0]+65,grab[1]+35))
    assert close_position(position(),before_play),("Play mode accepted an edit",before_play,position())
    mark("play_mode_blocks_mouse_editing",position())
    click_named("■ 停止");until(lambda: state()["mode"]=="edit")
    assert close_position(position(),before_play),("Stop lost edited scene",before_play,position())
    mark("stop_restores_scene_after_dragging",position())
    evaluate("unityLab.command('behavior',{id:unityLab.state.selectedId,behavior:'drop'})")
    click_named("保存实验 Ctrl S")
    _,_,final_shot=handles();(EVIDENCE/"browser-scene-movement.png").write_bytes(final_shot)
    report={"passed":True,"engine":state()["version"],"baselinePassed":baseline_count,"tests":results,"finalState":state()}
    (EVIDENCE/"browser-movement-tests.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print("MOVEMENT RESULT: "+str(len(results))+"/"+str(len(results))+" passed; baseline: "+str(baseline_count))
except Exception as error:
    report={"passed":False,"tests":results,"error":str(error),"state":state()}
    (EVIDENCE/"browser-movement-tests.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False));raise
