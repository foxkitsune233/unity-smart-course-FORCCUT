using System;
using UnityEngine;
using UnityCourseLab;
public static class LabExperimentTests {
 static void Check(bool ok,string message) { if(!ok) throw new Exception(message); }
 public static void Run() {
  foreach(var id in new[]{"lab03","lab04","lab05"}) { var advanced=new LabSession();advanced.LoadExperiment(id,"demo");Check(advanced.Preflight().Count==0,id+" demo invalid");advanced.LoadExperiment(id,"practice");Check(advanced.Preflight().Count>0,id+" practice must expose repairable dependency");} var s=new LabSession();s.LoadExperiment("lab01","demo");Check(s.Preflight().Count==0,"LAB01 demo invalid");
  s.Start();s.Current.objects[1].position.x=99;s.Stop();Check(s.Current.objects[1].position.x!=99,"Stop lost snapshot");
  s.LoadExperiment("lab02","demo");Check(s.Preflight().Count==0,"LAB02 demo invalid");
  var emitter=s.Current.objects.Find(x=>x.scripts.Contains("spawnEmitter"));emitter.settings.projectile="";
  Check(s.Preflight().Exists(x=>x.id==emitter.id&&x.field=="projectile"),"Missing projectile not located");
  var copy=new LabSession();copy.Import(JsonUtility.FromJson<SceneDocument>(JsonUtility.ToJson(s.ExportEdit())));Check(copy.Preflight().Count>0,"Invalid draft lost");
  bool blocked=false;try { copy.Start(); } catch(ArgumentException) {blocked=true;}Check(blocked&&!copy.Playing,"Invalid scene started");
  emitter.settings.projectile=s.Current.objects.Find(x=>x.scripts.Contains("projectileMove")).id;Check(s.Preflight().Count==0,"Reference fix failed");
  foreach(var kind in LabSession.Kinds) {
   var t=new LabSession();var o=t.Add(kind);t.AttachScript(o.id,"spawnEmitter");Check(o.scripts.Contains("spawnEmitter"),"Attachment restricted");Check(t.Preflight().Count>0,"Missing reference accepted");
  }
  var bad=new LabSession();var a=bad.Add("ground");bad.AttachScript(a.id,"playerMove");a.settings.speed=99;
  Check(bad.Preflight().Count>=2,"Preflight failed to aggregate");bad.SetRigidbody(a.id,true);a.settings.speed=4;Check(bad.Preflight().Count==0,"Capability repair failed");
  // Exercise the actual trigger handler, including one-shot collection and receiver-specific scoring.
  var host=new GameObject("Test runtime");var player=GameObject.CreatePrimitive(PrimitiveType.Sphere);var coin=GameObject.CreatePrimitive(PrimitiveType.Sphere);
  try {
   var runtime=host.AddComponent<LabRuntime>();var field=typeof(LabRuntime).GetField("session",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic);var live=(LabSession)field.GetValue(runtime);
   live.LoadExperiment("lab01","demo");live.Start();
   var pa=player.AddComponent<ExperimentActor>();pa.Owner=runtime;pa.Definition=live.Find("player");
   var ca=coin.AddComponent<ExperimentActor>();ca.Owner=runtime;ca.Definition=live.Find("coin0");
   runtime.TryFinish("score");Check(!runtime.Completed,"Finish allowed before coins");
   coin.SendMessage("OnTriggerEnter",player.GetComponent<Collider>());coin.SendMessage("OnTriggerEnter",player.GetComponent<Collider>());Check(runtime.Score==1,"Coin awarded more than once");
   runtime.Collect("score");runtime.Collect("score");runtime.TryFinish("score");Check(runtime.Completed,"Valid finish did not complete");
  } finally {UnityEngine.Object.DestroyImmediate(coin);UnityEngine.Object.DestroyImmediate(player);UnityEngine.Object.DestroyImmediate(host);}
  AdvancedExperimentTests.Run();Debug.Log("COURSE_LAB_EXPERIMENT_TESTS_PASSED");
 }
}


