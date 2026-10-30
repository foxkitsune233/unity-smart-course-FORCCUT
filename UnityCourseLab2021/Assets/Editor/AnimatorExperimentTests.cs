using System;
using UnityCourseLab;
using UnityEngine;
public static class AnimatorExperimentTests {
 static void Check(bool value,string message){if(!value)throw new Exception(message);}
 public static void Run(){
  var s=new LabSession();s.LoadExperiment("lab06","demo");Check(s.Preflight().Count==0,"LAB06 demo invalid");
  var saved=JsonUtility.ToJson(s.ExportEdit());s.Start();s.Find("actor").position.x=20;s.Stop();Check(saved==JsonUtility.ToJson(s.ExportEdit()),"LAB06 snapshot changed");
  s.LoadExperiment("lab06","practice");Check(s.Preflight().Count>0,"LAB06 practice must require repair");
  foreach(var kind in LabSession.Kinds){var any=new LabSession();var o=any.Add(kind);any.AttachScript(o.id,"animatorController");Check(o.scripts.Contains("animatorController"),"Animator must attach universally");}
  s.LoadExperiment("lab06","demo");s.Find("actor").settings.animationSpeed=float.NaN;Check(s.Preflight().Exists(x=>x.field=="animationSpeed"),"Invalid Animator speed accepted");
    var host=new GameObject("Animator runtime test");var model=GameObject.CreatePrimitive(PrimitiveType.Cube);
  try {
   var runtime=host.AddComponent<LabRuntime>();var live=(LabSession)typeof(LabRuntime).GetField("session",System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic).GetValue(runtime);live.LoadExperiment("lab06","demo");live.Start();
   var actor=model.AddComponent<LabAnimatorActor>();actor.Owner=runtime;actor.Definition=live.Find("actor");actor.Begin();Check(actor.Animator.runtimeAnimatorController!=null,"Real AnimatorController missing");Check(runtime.AnimationIdleSeen,"Actual Idle state missing");
   actor.Step(.02f,Vector3.right,false);for(int i=0;i<30;i++){actor.Animator.Update(.02f);actor.Observe();}Check(runtime.AnimationWalkSeen&&model.transform.position.x>0,"Actual Walk transition/movement missing");
   actor.Step(.02f,Vector3.zero,true);for(int i=0;i<80;i++){actor.Animator.Update(.02f);actor.Observe();}Check(runtime.AnimationJumpSeen&&runtime.AnimationEvents>0&&runtime.Completed,"Actual Jump/event/return completion missing");
   var export=runtime.ExportSnapshotJson();Check(export.Contains("clientObserved")&&export.Contains("observedResults")&&export.Contains("lab06"),"Snapshot export protocol missing");
  }finally{UnityEngine.Object.DestroyImmediate(model);UnityEngine.Object.DestroyImmediate(host);}
  Debug.Log("COURSE_LAB_ANIMATOR_MODEL_TESTS_PASSED");
 }
}

