using System;
using System.Reflection;
using UnityCourseLab;
using UnityEngine;
public static class FeedbackExperimentTests {
 static void Check(bool ok,string message){if(!ok)throw new Exception(message);}
 public static void Run(){
  var s=new LabSession();s.LoadExperiment("lab07","demo");Check(s.Preflight().Count==0,"LAB07 demo invalid");
  var json=JsonUtility.ToJson(s.ExportEdit());s.Start();s.Find("feedback").position.x=25;s.Stop();Check(json==JsonUtility.ToJson(s.ExportEdit()),"LAB07 stop did not restore snapshot");
  s.LoadExperiment("lab07","practice");Check(s.Preflight().Exists(x=>x.field=="effectSource"),"Missing effect source must block Play");bool blocked=false;try{s.Start();}catch(ArgumentException){blocked=true;}Check(blocked,"Invalid feedback scene started");
  s.LoadExperiment("lab07","blank");Check(s.Current.objects.Count==0&&s.Preflight().Count>0,"LAB07 blank must require setup");
  foreach(var kind in LabSession.Kinds){var any=new LabSession();var o=any.Add(kind);any.AttachScript(o.id,"feedbackController");any.AttachScript(o.id,"effectSource");Check(o.scripts.Count==2,"Feedback scripts must attach universally");}
  var host=new GameObject("Feedback test host");var source=new GameObject("Feedback source");var controller=new GameObject("Feedback controller");
  try {
   var runtime=host.AddComponent<LabRuntime>();var live=(LabSession)typeof(LabRuntime).GetField("session",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(runtime);live.LoadExperiment("lab07","demo");live.Start();
   var actorType=typeof(LabRuntime).Assembly.GetType("UnityCourseLab.LabFeedbackActor");Check(actorType!=null,"Real feedback actor missing");var actor=controller.AddComponent(actorType);actorType.GetField("Owner").SetValue(actor,runtime);actorType.GetField("Definition").SetValue(actor,live.Find("feedback"));actorType.GetMethod("Begin").Invoke(actor,new object[]{source});actorType.GetMethod("Step").Invoke(actor,new object[]{.1f});
   var particles=source.GetComponent<ParticleSystem>();var trail=source.GetComponent<TrailRenderer>();var audio=source.GetComponent<AudioSource>();Check(particles!=null&&particles.particleCount>0,"ParticleSystem did not emit real particles");Check(trail!=null&&trail.positionCount>0,"TrailRenderer has no real positions");Check(audio!=null&&audio.clip!=null&&audio.clip.samples>0,"AudioSource has no playable clip");
   var snapshot=runtime.ExportSnapshotJson();Check(snapshot.Contains("feedbackBursts\":1")&&snapshot.Contains("particlesEmitted\":12")&&snapshot.Contains("audioPlays\":1"),"Feedback runtime counters missing from export");
   Check((int)typeof(LabRuntime).GetField("FeedbackBursts").GetValue(runtime)==1,"Burst counter not engine driven");
  }finally{UnityEngine.Object.DestroyImmediate(controller);UnityEngine.Object.DestroyImmediate(source);UnityEngine.Object.DestroyImmediate(host);}
  Debug.Log("COURSE_LAB_FEEDBACK_TESTS_PASSED");
 }
}
