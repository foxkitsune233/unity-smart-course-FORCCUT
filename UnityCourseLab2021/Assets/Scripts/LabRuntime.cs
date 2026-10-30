using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using UnityEngine;

namespace UnityCourseLab
{
    public sealed partial class LabRuntime : MonoBehaviour
    {
        [Serializable] private sealed class Command
        {
            public string action, kind, id, behavior,scope; public LabSettings settings; public bool enabled;
            public LabVector position,rotation;
            public float u,v;
        }
        [Serializable] private sealed class State
        {
            public string persistenceStatus,persistenceJson;public int persistenceScore,persistenceLevel,persistenceSaves,persistenceLoads,persistenceClears;public bool persistenceHasSave;public int feedbackBursts,particlesEmitted,trailPoints,audioPlays; public string engine, version, mode, selectedId, message;
            public bool error; public string animationState;public float animationSpeed;public int animationTransitions,animationEvents,animationJumps;public bool animationIdleSeen,animationWalkSeen,animationJumpSeen;
            public bool grounded,coordinateArrived; public int jumps,rejectedJumps,rayHits,triggers,physicsContacts,health,inventoryCount,inventoryRejected,healthChanges;public float coordinateDistance;public LabVector worldPosition,localPosition; public int contacts; public int score,hits,spawned,alive,lifecycleStart,lifecycleUpdate,lifecycleFixed; public bool completed; public List<LabIssue> errors;
            public float elapsed;
            public SceneDocument scene;
        }
        public Material SurfaceMaterial;
        public Material GridMaterial;
        public Material GizmoMaterial;
        public GameObject GroundTemplate;
        public GameObject SphereTemplate;
        private readonly LabSession session = new LabSession();
        private readonly Dictionary<string, GameObject> objects = new Dictionary<string, GameObject>();
        private readonly List<Material> objectMaterials = new List<Material>();
        private readonly HashSet<string> contactPairs = new HashSet<string>();
        private Camera sceneCamera;
        private string selectedId = "";
        private int contacts;
        private float elapsed, nextPublish;
        private SceneMoveTool moveTool;
        private float yaw = 36, pitch = 31, distance = 12;
        private readonly Vector3 focus = new Vector3(0, 1, 0);
        public int Score,Hits,Spawned,LifecycleStart,LifecycleUpdate,LifecycleFixed;
        public bool Completed; private bool faulted; private readonly List<LabIssue> runtimeIssues=new List<LabIssue>(); public bool Running {get{return session.Playing&&!faulted;}}
        private readonly List<ExperimentActor> projectiles=new List<ExperimentActor>();
        private readonly Dictionary<string,int> scores=new Dictionary<string,int>();
        public void Collect(string id){if(!Running)return;int value;scores.TryGetValue(id,out value);scores[id]=value+1;Score++;Emit("拾取金币 +1");}
        public void TryFinish(string id){if(!Running)return;int value;scores.TryGetValue(id,out value);if(value>=session.Find(id).settings.requiredScore){Completed=true;Emit("金币收集完成并到达终点！");}else Emit("金币不足，请继续收集。");}
        public void Hit(){if(!Running)return;Hits++;if(Hits>=3)Completed=true;Emit("弹丸实际命中靶标。");}
        public void RemoveProjectile(ExperimentActor actor){if(!projectiles.Remove(actor))return;actor.gameObject.SetActive(false);Destroy(actor.gameObject);}
        public void SpawnProjectile(ExperimentActor emitter){
            if(projectiles.FindAll(x=>x.EmitterId==emitter.Definition.id).Count>=emitter.Definition.settings.maxAlive)return;
            var def=session.Find(emitter.Definition.settings.projectile);var original=objects[def.id];var go=Instantiate(original);
            go.name="Projectile instance "+(++Spawned);go.transform.position=emitter.transform.position+Vector3.up*.15f;go.SetActive(true);
            var actor=go.GetComponent<ExperimentActor>();actor.Owner=this;actor.Definition=def;actor.Spawned=true;actor.EmitterId=emitter.Definition.id;actor.Target=emitter.Definition.settings.target;go.GetComponent<Collider>().enabled=true;actor.Begin();
            var rb=go.GetComponent<Rigidbody>();rb.isKinematic=false;rb.useGravity=false;rb.collisionDetectionMode=CollisionDetectionMode.ContinuousDynamic;
            rb.velocity=(objects[actor.Target].transform.position-go.transform.position).normalized*def.settings.speed;projectiles.Add(actor);
        }
        public bool CanEdit { get { return !session.Playing; } }
        public string SelectedId { get { return selectedId; } }
        public GameObject SelectedObject
        {
            get { GameObject value; return objects.TryGetValue(selectedId,out value) ? value : null; }
        }

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] private static extern void LabState(string json);
        [DllImport("__Internal")] private static extern void LabSave(string json);
        [DllImport("__Internal")] private static extern void LabExport(string json);
        [DllImport("__Internal")] private static extern void LabReady();
#endif
        private void Start()
        {
            gameObject.name = "LabBridge";
#if UNITY_WEBGL && !UNITY_EDITOR
            WebGLInput.captureAllKeyboardInput = false;
#endif
            Application.logMessageReceived+=OnRuntimeLog;
            SetupEnvironment();
            moveTool=gameObject.AddComponent<SceneMoveTool>();
            moveTool.Initialize(this,sceneCamera,GizmoMaterial);
            Emit("准备就绪，请创建地面和小球。");
#if UNITY_WEBGL && !UNITY_EDITOR
            LabReady();
#endif
        }
        private void OnDestroy(){Application.logMessageReceived-=OnRuntimeLog;}
        private void OnRuntimeLog(string message,string trace,LogType type){if(!Running||(type!=LogType.Exception&&type!=LogType.Error))return;faulted=true;Completed=false;runtimeIssues.Add(new LabIssue(selectedId,"runtime","exception",message));foreach(var go in objects.Values){foreach(var b in go.GetComponents<MonoBehaviour>())b.enabled=false;var rb=go.GetComponent<Rigidbody>();if(rb!=null)rb.isKinematic=true;}foreach(var a in projectiles){a.enabled=false;var rb=a.GetComponent<Rigidbody>();if(rb!=null)rb.isKinematic=true;}Emit("运行发生异常，已暂停；请停止恢复场景。",true);}
        private List<LabIssue> AllIssues(){var issues=session.Preflight();issues.AddRange(runtimeIssues);return issues;}
        private void SetupEnvironment()
        {
            RenderSettings.ambientLight = new Color(0.62f, 0.68f, 0.76f);
            RenderSettings.fog = false;
            sceneCamera = new GameObject("Experiment Camera").AddComponent<Camera>();
            sceneCamera.tag = "MainCamera";sceneCamera.gameObject.AddComponent<AudioListener>();
            sceneCamera.clearFlags = CameraClearFlags.SolidColor;
            sceneCamera.backgroundColor = new Color(0.08f, 0.12f, 0.18f);
            sceneCamera.nearClipPlane = 0.1f; sceneCamera.farClipPlane = 300; sceneCamera.fieldOfView = 42;
            UpdateCamera();
            var light = new GameObject("Sunlight").AddComponent<Light>();
            light.type = LightType.Directional; light.intensity = 1.15f; light.shadows = LightShadows.Soft;
            light.transform.rotation = Quaternion.Euler(50, -30, 0);
            for (var i = -10; i <= 10; i++)
            {
                DrawLine(new Vector3(i, 0.006f, -10), new Vector3(i, 0.006f, 10), i == 0 ? new Color(0.22f, 0.45f, 0.65f) : new Color(0.18f, 0.24f, 0.31f));
                DrawLine(new Vector3(-10, 0.006f, i), new Vector3(10, 0.006f, i), i == 0 ? new Color(0.65f, 0.28f, 0.25f) : new Color(0.18f, 0.24f, 0.31f));
            }
        }
        private void DrawLine(Vector3 from, Vector3 to, Color color)
        {
            var line = new GameObject("Grid").AddComponent<LineRenderer>();
            line.positionCount = 2; line.SetPosition(0, from); line.SetPosition(1, to);
            line.startWidth = line.endWidth = 0.012f;
            line.sharedMaterial = GridMaterial; line.startColor = line.endColor = color;
        }
        public void Dispatch(string json)
        {
            try
            {
                if (string.IsNullOrEmpty(json) || json.Length > 4096) throw new ArgumentException("无效操作。");
                var command = JsonUtility.FromJson<Command>(json);
                if (command == null) throw new ArgumentException("无效操作。");
                if(!session.Playing&&!string.IsNullOrEmpty(command.scope)&&command.scope.Length<=256)persistenceScope=command.scope;
                switch (command.action)
                {
                    case "experiment":
                        session.LoadExperiment(command.id,command.kind);selectedId="";contacts=0;elapsed=0;ResetExperiment();RebuildObjects();Emit("已载入实验模板。");break;
                    case "rotation":session.SetRotation(command.id,command.rotation);objects[command.id].transform.eulerAngles=Vector(command.rotation);Emit("已更新旋转。");break; case "uiAction":ApplyUIAction(command.id,command.behavior);break; case "configure":session.Configure(command.id,command.settings);Emit("已更新脚本参数和引用。");break;
                    case "component":if(command.behavior!="rigidbody")throw new ArgumentException("未知组件");session.SetRigidbody(command.id,command.enabled);Emit("已更新 Rigidbody 依赖组件。");break;
                    case "create":
                        moveTool.EndInteraction();
                        var item = session.Add(command.kind);
                        selectedId = item.id; CreateObject(item);
                        Emit("已创建场景对象：" + item.kind + "。可在 Inspector 挂载脚本。"); break;
                    case "select":
                        SelectObject(command.id); break;
                    case "place": PlacePrefab(command); break;
                    case "attach":
                        session.AttachScript(command.id,command.behavior);SelectObject(command.id);Emit("已挂载脚本："+BehaviorName(command.behavior));break;
                    case "attachAt":
                        var target=PickBody(command.u,command.v);
                        if(target==null) throw new ArgumentException("请把脚本拖到场景中的物体上。");
                        session.AttachScript(target.ObjectId,command.behavior);SelectObject(target.ObjectId);Emit("已挂载脚本："+BehaviorName(command.behavior));break;
                    case "removeScript":
                        session.RemoveScript(command.id,command.behavior);Emit("已移除脚本："+BehaviorName(command.behavior));break;
                    case "behavior":
                        session.SetBehavior(command.id, command.behavior); Emit("已选择预设行为：" + BehaviorName(command.behavior)); break;
                    case "position":
                        session.SetPosition(command.id, command.position);
                        objects[command.id].transform.position = Vector(command.position); Emit("已更新位置。"); break;
                    case "play": Play(); break;
                    case "stop": Stop(); break;
                    case "persistenceAction": ApplyPersistenceAction(command.id,command.behavior); break;
                    case "save": Save(); break;
                    case "export": ExportSnapshot();break;
                    case "state": Emit(); break;
                    case "camera": yaw = 36; pitch = 31; distance = 12; UpdateCamera(); Emit("已恢复观察视角。"); break;
                    default: throw new ArgumentException("不支持该操作。");
                }
            }
            catch (Exception ex) { Emit("操作未完成：" + ex.Message, true); }
        }
        public void LoadSaved(string json)
        {
            try
            {
                if (string.IsNullOrEmpty(json) || json.Length > 100000) throw new ArgumentException("存档为空或过大。");
                session.Import(JsonUtility.FromJson<SceneDocument>(json));
                selectedId = session.Current.objects.Count == 0 ? "" : session.Current.objects[session.Current.objects.Count - 1].id;
                contacts = 0; elapsed = 0; RebuildObjects(); Emit("已从浏览器存档恢复实验。");
            }
            catch (Exception ex) { Emit("无法读取存档，当前场景已保留：" + ex.Message, true); }
        }
        private Ray DropRay(float u,float v)
        {
            if(!CanEdit) throw new InvalidOperationException("请先停止运行再拖入资源。");
            if(float.IsNaN(u)||float.IsNaN(v)||float.IsInfinity(u)||float.IsInfinity(v)||u<0||u>1||v<0||v>1)
                throw new ArgumentException("落点不在场景内。");
            return sceneCamera.ScreenPointToRay(new Vector3(u*Screen.width,(1-v)*Screen.height,0));
        }
        private LabBody PickBody(float u,float v)
        {
            Physics.SyncTransforms();
            RaycastHit hit;
            return Physics.Raycast(DropRay(u,v),out hit) ? hit.collider.GetComponent<LabBody>() : null;
        }
        private void PlacePrefab(Command command)
        {
            moveTool.EndInteraction();
            var ray=DropRay(command.u,command.v);LabVector hit;
            if(!MoveProjection.TryIntersect(Value(ray.origin),Value(ray.direction),new LabVector(),new LabVector(0,1,0),out hit))
                throw new ArgumentException("请把物品拖到场景网格区域。");
            var item=session.AddAt(command.kind,new LabVector(hit.x,command.kind=="ground" ? -0.1f : 3,hit.z));
            selectedId=item.id;CreateObject(item);Emit("已从项目资源拖入"+item.kind+"。");
        }
        private void Play()
        {
            if (session.Current.objects.Count == 0) throw new ArgumentException("请先创建实验对象。");
            moveTool.EndInteraction();
            session.Start(); ResetExperiment(); contacts = 0; elapsed = 0; contactPairs.Clear();
            foreach (var item in session.Current.objects)
            {
                var go=objects[item.id];
                if(item.rigidbody){var rb=go.GetComponent<Rigidbody>();if(rb==null)rb=go.AddComponent<Rigidbody>();rb.useGravity=false;rb.isKinematic=true;}
                var actor=go.AddComponent<ExperimentActor>();actor.Owner=this;actor.Definition=item;actor.Begin();
                if(item.scripts.Contains("projectileMove")){go.GetComponent<Rigidbody>().isKinematic=true;go.GetComponent<Collider>().enabled=false;}
                if (item.scripts.Contains("drop")) objects[item.id].AddComponent<DropBehavior>().Begin();
                if (item.scripts.Contains("launch")) objects[item.id].AddComponent<LaunchBehavior>().Begin();
                if (item.scripts.Contains("platform")) objects[item.id].AddComponent<PlatformMoveBehavior>().Begin();
                if (item.scripts.Contains("spin")) objects[item.id].AddComponent<SpinBehavior>();
            }
            StartAdvanced();Emit("实验运行中，观察小球的位置与接触事件。");
        }
        private void Stop()
        {
            if (!session.Playing) return;
            session.Stop(); ResetExperiment(); RebuildObjects(); Emit("已停止，所有对象已恢复运行前的位置、朝向和预设行为。");
        }
        private void ResetExperiment(){ResetAdvanced();faulted=false;runtimeIssues.Clear();foreach(var a in projectiles){if(a!=null){a.gameObject.SetActive(false);Destroy(a.gameObject);}}projectiles.Clear();scores.Clear();Score=Hits=Spawned=LifecycleStart=LifecycleUpdate=LifecycleFixed=0;Completed=false;}
        [Serializable] private sealed class Snapshot {public SceneDocument scene;public string engine="Unity",version;public bool clientObserved=true;public ObservedResults observedResults;}
        [Serializable] private sealed class ObservedResults {public string persistenceStatus,persistenceJson;public int persistenceScore,persistenceLevel,persistenceSaves,persistenceLoads,persistenceClears;public bool persistenceHasSave;public int feedbackBursts,particlesEmitted,trailPoints,audioPlays;public bool completed;public float elapsed;public int health,healthChanges,inventoryCount,inventoryRejected,animationTransitions,animationEvents,animationJumps;public string animationState;public bool animationIdleSeen,animationWalkSeen,animationJumpSeen;}
        public string ExportSnapshotJson(){return JsonUtility.ToJson(new Snapshot{scene=session.ExportEdit(),version=Application.unityVersion,observedResults=new ObservedResults{persistenceStatus=PersistenceStatus,persistenceJson=PersistenceJson,persistenceScore=PersistenceScore,persistenceLevel=PersistenceLevel,persistenceSaves=PersistenceSaves,persistenceLoads=PersistenceLoads,persistenceClears=PersistenceClears,persistenceHasSave=PersistenceHasSave,feedbackBursts=FeedbackBursts,particlesEmitted=ParticlesEmitted,trailPoints=TrailPoints,audioPlays=AudioPlays,completed=Completed,elapsed=elapsed,health=Health,healthChanges=HealthChanges,inventoryCount=InventoryCount,inventoryRejected=InventoryRejected,animationTransitions=AnimationTransitions,animationEvents=AnimationEvents,animationJumps=AnimationJumps,animationState=AnimationState,animationIdleSeen=AnimationIdleSeen,animationWalkSeen=AnimationWalkSeen,animationJumpSeen=AnimationJumpSeen}});}
        private void ExportSnapshot(){
#if UNITY_WEBGL && !UNITY_EDITOR
            LabExport(ExportSnapshotJson());
#else
            Debug.Log(ExportSnapshotJson());
#endif
        }
        private void Save()
        {
            var json = JsonUtility.ToJson(session.ExportEdit());
#if UNITY_WEBGL && !UNITY_EDITOR
            LabSave(json);
#else
            PlayerPrefs.SetString("UnityCourseLab.Scene.v1", json); PlayerPrefs.Save(); Emit("已保存编辑状态。");
#endif
        }
        private void CreateObject(LabObject item)
        {
            // Serialized templates retain their meshes and collider types in stripped Web builds.
            var go = Instantiate(item.kind == "physicsBody" || item.kind == "sphere" || item.kind=="player" || item.kind=="coin" || item.kind=="projectile" ? SphereTemplate : GroundTemplate);
            go.name = item.kind == "ground" ? "Ground" : "Sphere";
            go.transform.position = Vector(item.position); go.transform.eulerAngles = Vector(item.rotation); go.transform.localScale = Vector(item.scale);
            var identity = go.AddComponent<LabBody>(); identity.ObjectId = item.id; identity.Owner = this;
            var material = new Material(SurfaceMaterial);
            material.color = item.kind == "ground" ? new Color(0.32f, 0.43f, 0.53f) : new Color(0.98f, 0.55f, 0.18f);
            go.GetComponent<Renderer>().sharedMaterial = material; objectMaterials.Add(material); objects.Add(item.id, go);
            if(item.kind=="coin")material.color=Color.yellow; if(item.kind=="finish")material.color=Color.green; if(item.kind=="target")material.color=Color.red; if(item.kind=="player")material.color=new Color(1,.55f,.15f); if(item.kind=="score")material.color=new Color(.2f,.5f,1); if(item.kind=="emitter")material.color=new Color(.7f,.3f,.9f); if(item.kind=="projectile")material.color=new Color(.8f,.9f,1);
            go.SetActive(true); RefreshSelection();
        }
        private void RebuildObjects()
        {
            foreach (var go in objects.Values) { go.SetActive(false); Destroy(go); }
            objects.Clear();
            foreach (var material in objectMaterials) Destroy(material);
            objectMaterials.Clear();
            foreach (var item in session.Current.objects) CreateObject(item);
        }
        private void RefreshSelection()
        {
            foreach (var entry in objects)
            {
                var material = entry.Value.GetComponent<Renderer>().sharedMaterial;
                material.EnableKeyword("_EMISSION");
                material.SetColor("_EmissionColor", entry.Key == selectedId ? new Color(0.1f, 0.1f, 0.07f) : Color.black);
            }
        }
        public void SelectObject(string id)
        {
            if(id!=selectedId && moveTool!=null) moveTool.EndInteraction();
            session.Find(id); selectedId=id; RefreshSelection(); Emit();
        }
        public bool MoveObject(string id, Vector3 position, bool finished)
        {
            if(!CanEdit) return false;
            try
            {
                session.SetPosition(id,Value(position));
                objects[id].transform.position=position;
                Emit(finished ? "已移动对象，当前位置已同步到实验场景。" : "");
                return true;
            }
            catch(ArgumentException ex) { Emit("无法移动对象："+ex.Message,true); return false; }
        }
        public void ReportContact(string first, string second)
        {
            if (!session.Playing) return;
            var key = string.CompareOrdinal(first, second) < 0 ? first + second : second + first;
            if (contactPairs.Add(key)) { contacts++; Emit("检测到对象接触，碰撞事件已触发。"); }
        }
        private void Update()
        {
            if (session.Playing)
            {
                elapsed += Time.deltaTime;
                foreach (var item in session.Current.objects)
                {
                    item.position = Value(objects[item.id].transform.position); item.rotation = Value(objects[item.id].transform.eulerAngles);
                }
                if (Time.unscaledTime >= nextPublish) { Emit(); nextPublish = Time.unscaledTime + 0.15f; }
            }
            var pointer=Input.mousePosition;
            var inside=pointer.x>=0 && pointer.x<=Screen.width && pointer.y>=0 && pointer.y<=Screen.height;
            if (inside && Input.GetMouseButton(1) && !moveTool.IsDragging)
            {
                yaw += Input.GetAxis("Mouse X") * 3; pitch = Mathf.Clamp(pitch - Input.GetAxis("Mouse Y") * 3, 10, 80); UpdateCamera();
            }
            if (inside && !moveTool.IsDragging && Mathf.Abs(Input.mouseScrollDelta.y) > 0.01f) { distance = Mathf.Clamp(distance - Input.mouseScrollDelta.y, 4, 35); UpdateCamera(); }
        }
        private void UpdateCamera()
        {
            sceneCamera.transform.position = focus + Quaternion.Euler(pitch, yaw, 0) * new Vector3(0, 0, -distance); sceneCamera.transform.LookAt(focus);
        }
        private void Emit(string message = "", bool error = false)
        {
            var state = new State { engine = "Unity", version = Application.unityVersion,
                mode = session.Playing ? "play" : "edit", selectedId = selectedId, contacts = contacts,
                persistenceStatus=PersistenceStatus,persistenceJson=PersistenceJson,persistenceScore=PersistenceScore,persistenceLevel=PersistenceLevel,persistenceSaves=PersistenceSaves,persistenceLoads=PersistenceLoads,persistenceClears=PersistenceClears,persistenceHasSave=PersistenceHasSave,feedbackBursts=FeedbackBursts,particlesEmitted=ParticlesEmitted,trailPoints=TrailPoints,audioPlays=AudioPlays,animationState=AnimationState,animationSpeed=AnimationSpeed,animationTransitions=AnimationTransitions,animationEvents=AnimationEvents,animationJumps=AnimationJumps,animationIdleSeen=AnimationIdleSeen,animationWalkSeen=AnimationWalkSeen,animationJumpSeen=AnimationJumpSeen,grounded=Grounded,coordinateArrived=CoordinateArrived,jumps=Jumps,rejectedJumps=RejectedJumps,rayHits=RayHits,triggers=Triggers,physicsContacts=PhysicsContacts,health=Health,inventoryCount=InventoryCount,inventoryRejected=InventoryRejected,healthChanges=HealthChanges,coordinateDistance=CoordinateDistance,worldPosition=WorldPosition,localPosition=LocalPosition,elapsed = elapsed, score=Score,hits=Hits,spawned=Spawned,alive=projectiles.Count,lifecycleStart=LifecycleStart,lifecycleUpdate=LifecycleUpdate,lifecycleFixed=LifecycleFixed,completed=Completed,errors=AllIssues(), scene = session.Current, message = message, error = error };
#if UNITY_WEBGL && !UNITY_EDITOR
            LabState(JsonUtility.ToJson(state));
#else
            if (!string.IsNullOrEmpty(message)) Debug.Log(message);
#endif
        }
        private static Vector3 Vector(LabVector v) { return new Vector3(v.x, v.y, v.z); }
        private static LabVector Value(Vector3 v) { return new LabVector(v.x, v.y, v.z); }
        private static string BehaviorName(string value) { return value=="animatorController" ? "Animator 状态机控制器" : value=="physicsMove" ? "刚体移动与落地跳跃" : value=="triggerProbe" ? "触发区检测" : value=="coordinateMove" ? "局部与世界向量移动" : value=="lookAtTarget" ? "朝向目标" : value=="healthController" ? "UGUI生命控制器" : value=="inventoryController" ? "UGUI有限背包" : value=="drop" ? "重力下落" : value=="launch" ? "水平抛出" : value=="platform" ? "平台往复移动" : value=="spin" ? "自转" : value=="playerMove" ? "角色移动" : value=="collectible" ? "金币拾取" : value=="scoreReceiver" ? "计分接收器" : value=="finish" ? "终点判定" : value=="spawnEmitter" ? "预制体发射器" : value=="projectileMove" ? "弹丸运动" : value=="lifecycleProbe" ? "生命周期探针" : value=="targetHitReceiver" ? "目标命中" : "静止"; }
    }
}



