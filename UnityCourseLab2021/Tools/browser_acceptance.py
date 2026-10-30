"""Run with Browser Harness against an isolated test browser and loopback host."""
import base64
import json
import time
from pathlib import Path

EVIDENCE = Path(r"D:\unity\UnityCourseLab2021\Evidence")
EVIDENCE.mkdir(parents=True, exist_ok=True)
results = []

def evaluate(expression):
    response = cdp("Runtime.evaluate", expression=expression, returnByValue=True, awaitPromise=True)
    if response.get("exceptionDetails"):
        raise RuntimeError(str(response["exceptionDetails"]))
    return response.get("result", {}).get("value")

def state():
    value = evaluate("JSON.stringify(window.unityLab?.state ?? null)")
    return json.loads(value) if value else None

def until(predicate, timeout=25):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(0.15)
    raise AssertionError("Browser condition timed out")

def ready():
    cdp("Page.bringToFront")
    until(lambda: evaluate("Boolean(window.unityLab?.ready)"))
    value = state()
    assert value["engine"] == "Unity" and value["version"].startswith("2021.3."), value
    return value

def click_named(name, role="button"):
    nodes = cdp("Accessibility.getFullAXTree")["nodes"]
    node = next((n for n in nodes if n.get("role",{}).get("value")==role and n.get("name",{}).get("value")==name), None)
    if node is None:
        raise AssertionError("Accessible control not found: " + name)
    box = cdp("DOM.getBoxModel", backendNodeId=node["backendDOMNodeId"])["model"]["content"]
    click_at_xy(sum(box[0::2])/4, sum(box[1::2])/4)

def key(name, code, virtual):
    for event_type in ("keyDown", "keyUp"):
        cdp("Input.dispatchKeyEvent", type=event_type, key=name, code=code, windowsVirtualKeyCode=virtual, nativeVirtualKeyCode=virtual)

def mark(name, detail):
    results.append({"test":name,"passed":True,"detail":detail})
    print("PASS " + name)

def same_scene(left, right):
    assert len(left["objects"]) == len(right["objects"])
    for a,b in zip(left["objects"],right["objects"]):
        for field in ("id","kind","behavior"):
            assert a[field] == b[field], (field,a,b)
        for field in ("position","rotation","scale"):
            for axis in ("x","y","z"):
                assert abs(a[field][axis]-b[field][axis])<0.001,(field,axis,a,b)

try:
    goto_url("http://127.0.0.1:8088/")
    wait_for_load()
    ready()
    evaluate("localStorage.removeItem('UnityCourseLab.Scene.v1')")
    cdp("Page.reload",ignoreCache=True)
    wait_for_load()
    ready()
    assert len(state()["scene"]["objects"]) == 0
    click_named("＋ 地面")
    until(lambda: len(state()["scene"]["objects"])==1)
    click_named("＋ 小球")
    until(lambda: len(state()["scene"]["objects"])==2)
    ball_id=state()["selectedId"]
    mark("create_ground_and_sphere",state()["scene"])

    # Regression: shortcut save must commit a coordinate without requiring blur first.
    click_named("Y","spinbutton")
    for event_type in ("keyDown","keyUp"):
        cdp("Input.dispatchKeyEvent",type=event_type,key="a",code="KeyA",windowsVirtualKeyCode=65,modifiers=2)
    cdp("Input.insertText",text="4")
    for event_type in ("keyDown","keyUp"):
        cdp("Input.dispatchKeyEvent",type=event_type,key="s",code="KeyS",windowsVirtualKeyCode=83,modifiers=2)
    until(lambda: state()["scene"]["objects"][1]["position"]["y"]==4)
    shortcut_saved=json.loads(evaluate("localStorage.getItem('UnityCourseLab.Scene.v1')"))
    assert shortcut_saved["objects"][1]["position"]["y"]==4
    mark("shortcut_save_commits_focused_position",{"savedY":4})
    evaluate("document.activeElement.blur();unityLab.command('position',{id:unityLab.state.selectedId,position:{x:0,y:3,z:0}})")
    until(lambda: state()["scene"]["objects"][1]["position"]["y"]==3)

    click_named("选择预设行为","combobox")
    key("ArrowDown","ArrowDown",40)
    key("Enter","Enter",13)
    until(lambda: state()["scene"]["objects"][1]["behavior"]=="drop")
    before=state()["scene"]
    mark("select_precompiled_drop_behavior",{"id":ball_id,"behavior":"drop"})

    click_named("▶ 运行")
    until(lambda: state()["mode"]=="play")
    until(lambda: state()["contacts"]>=1 and state()["scene"]["objects"][1]["position"]["y"]<0.6)
    moving=state()
    assert abs(moving["scene"]["objects"][1]["position"]["y"]-0.5)<0.1
    mark("real_unity_gravity_and_collision",{"height":moving["scene"]["objects"][1]["position"]["y"],"contacts":moving["contacts"],"engine":moving["version"]})

    click_named("保存实验 Ctrl S")
    saved=json.loads(evaluate("localStorage.getItem('UnityCourseLab.Scene.v1')"))
    same_scene(before,saved)
    mark("save_during_play_preserves_edit_snapshot",saved)

    click_named("■ 停止")
    until(lambda: state()["mode"]=="edit")
    same_scene(before,state()["scene"])
    mark("stop_restores_complete_edit_state",state()["scene"])

    cdp("Page.reload",ignoreCache=True)
    wait_for_load()
    restored=ready()
    same_scene(before,restored["scene"])
    assert restored["mode"]=="edit"
    assert evaluate("document.getElementById('behavior').value")=="drop"
    assert "已恢复" in evaluate("document.getElementById('save-status').textContent")
    mark("refresh_automatically_reopens_saved_scene",restored["scene"])

    evaluate("unityLab.command('behavior',{id:unityLab.state.selectedId,behavior:'unknown-code'})")
    until(lambda: state()["error"])
    same_scene(before,state()["scene"])
    mark("unknown_behavior_rejected_without_scene_damage",state()["message"])

    click_named("选择预设行为","combobox")
    key("ArrowDown","ArrowDown",40)
    key("Enter","Enter",13)
    until(lambda: state()["scene"]["objects"][1]["behavior"]=="launch")
    click_named("▶ 运行")
    until(lambda: state()["scene"]["objects"][1]["position"]["x"]>0.5)
    mark("precompiled_launch_moves_horizontally",state()["scene"]["objects"][1]["position"])
    click_named("■ 停止")
    until(lambda: state()["mode"]=="edit")
    cdp("Page.reload",ignoreCache=True)
    wait_for_load()
    final=ready()
    same_scene(before,final["scene"])
    screenshot=cdp("Page.captureScreenshot",format="png",captureBeyondViewport=False)
    (EVIDENCE/"browser-experiment.png").write_bytes(base64.b64decode(screenshot["data"]))
    report={"passed":True,"engine":final["version"],"url":"http://127.0.0.1:8088/","tests":results,"finalState":final,"history":evaluate("unityLab.history")}
    (EVIDENCE/"browser-tests.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print("RESULT: " + str(len(results)) + "/" + str(len(results)) + " passed")
except Exception as error:
    report={"passed":False,"tests":results,"error":str(error),"state":state()}
    (EVIDENCE/"browser-tests.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False))
    raise
