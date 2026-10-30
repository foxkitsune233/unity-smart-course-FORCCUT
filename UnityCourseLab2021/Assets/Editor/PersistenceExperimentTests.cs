using System;
using UnityCourseLab;
using UnityEngine;
public static class PersistenceExperimentTests {
 static void Check(bool ok,string message){if(!ok)throw new Exception(message);}
 public static void Run(){
  var s=new LabSession();s.LoadExperiment("lab08","demo");Check(s.Preflight().Count==0,"LAB08 demo invalid");
  s.LoadExperiment("lab08","practice");Check(s.Preflight().Exists(x=>x.field=="target"),"Missing persistence state must block Play");
  bool blocked=false;try{s.Start();}catch(ArgumentException){blocked=true;}Check(blocked,"Invalid persistence scene started");
  s.LoadExperiment("lab08","blank");Check(s.Current.objects.Count==0&&s.Preflight().Count>0,"Blank needs persistence scripts");
  foreach(var kind in LabSession.Kinds){var a=new LabSession();var o=a.Add(kind);a.AttachScript(o.id,"persistenceController");a.AttachScript(o.id,"persistentState");Check(o.scripts.Count==2,"Persistence presets must attach universally");}
  s.LoadExperiment("lab08","demo");s.Find("progress").settings.initialData="{bad";Check(s.Preflight().Exists(x=>x.field=="initialData"),"Malformed JSON must block Play");
  s.Find("progress").settings.initialData="{\"schemaVersion\":1,\"playerName\":\"A\",\"score\":-1,\"level\":1}";Check(s.Preflight().Count>0,"Invalid data ranges must block Play");
  s.LoadExperiment("lab08","demo");s.Find("storage").settings.storageSlot="bad slot";Check(s.Preflight().Exists(x=>x.field=="storageSlot"),"Invalid slot must block Play");
  s.LoadExperiment("lab08","demo");var edit=JsonUtility.ToJson(s.ExportEdit());s.Start();s.Find("progress").position.x=9;s.Stop();Check(edit==JsonUtility.ToJson(s.ExportEdit()),"Stop must restore edit document");
  var host=new GameObject("Persistence test");var slot="test-"+Guid.NewGuid().ToString("N").Substring(0,12);var key="UnityCourseLab.LAB08."+slot;
  try {
   var a=host.AddComponent<LabPersistenceActor>();a.Begin(slot,"{\"schemaVersion\":1,\"playerName\":\"Student\",\"score\":12,\"level\":2}");a.Clear();Check(!PlayerPrefs.HasKey(key),"Clear did not delete PlayerPrefs");a.Save();Check(PlayerPrefs.HasKey(key)&&PlayerPrefs.GetString(key).Contains("Student"),"Real JSON not saved in PlayerPrefs");a.AddScore();Check(a.Data.score==13,"Runtime state not changed");a.Load();Check(a.Data.score==12,"Load did not restore saved score");
   UnityEngine.Object.DestroyImmediate(a);a=host.AddComponent<LabPersistenceActor>();a.Begin(slot,"{\"schemaVersion\":1,\"playerName\":\"Other\",\"score\":0,\"level\":1}");a.Load();Check(a.Data.score==12&&a.Data.level==2,"New runtime must load only saved state");
   PlayerPrefs.SetString(key,"invalid");bool rejected=false;try{a.Load();}catch(ArgumentException){rejected=true;}Check(rejected&&a.Data.score==12,"Malformed saved JSON must not mutate state");a.Clear();Check(!a.Load()&&a.Data.score==12,"Missing load must preserve live state");
  }finally{PlayerPrefs.DeleteKey(key);PlayerPrefs.Save();UnityEngine.Object.DestroyImmediate(host);}
  var bridgeHost=new GameObject("Persistence bridge test");var stateHost=new GameObject("State receiver");var bridgeSlot="bridge-"+Guid.NewGuid().ToString("N").Substring(0,12);var bridgeKey="UnityCourseLab.LAB08.editor."+bridgeSlot;
  try {
   var runtime=bridgeHost.AddComponent<LabRuntime>();var flags=System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic;var live=(LabSession)typeof(LabRuntime).GetField("session",flags).GetValue(runtime);live.LoadExperiment("lab08","demo");live.Find("storage").settings.storageSlot=bridgeSlot;live.Start();
   var objects=(System.Collections.Generic.Dictionary<string,GameObject>)typeof(LabRuntime).GetField("objects",flags).GetValue(runtime);objects["progress"]=stateHost;typeof(LabRuntime).GetMethod("StartPersistence",flags).Invoke(runtime,null);
   runtime.ApplyPersistenceAction("storage","addScore");runtime.ApplyPersistenceAction("storage","save");runtime.ApplyPersistenceAction("storage","addScore");runtime.ApplyPersistenceAction("storage","load");Check(runtime.PersistenceScore==1&&runtime.PersistenceSaves==1&&runtime.PersistenceLoads==1,"Runtime command bridge did not restore saved state");
   var exported=runtime.ExportSnapshotJson();Check(exported.Contains("persistenceScore\":1")&&exported.Contains("persistenceStatus\":\"loaded"),"Observed persistence results missing from export");
   live.Stop();typeof(LabRuntime).GetMethod("ResetPersistence",flags).Invoke(runtime,null);Check(PlayerPrefs.HasKey(bridgeKey)&&runtime.PersistenceHasSave&&runtime.PersistenceSaves==0,"Stop must retain saved payload and reset runtime counters");
   live.Start();typeof(LabRuntime).GetMethod("StartPersistence",flags).Invoke(runtime,null);Check(runtime.PersistenceScore==0,"Reopen must start from configured data, without implicit load");runtime.ApplyPersistenceAction("storage","load");Check(runtime.PersistenceScore==1,"Reopen load lost saved data");
   var isolated=stateHost.AddComponent<LabPersistenceActor>();isolated.StorageScope="another-student";isolated.Begin(bridgeSlot,live.Find("progress").settings.initialData);Check(!isolated.Load()&&PlayerPrefs.HasKey(bridgeKey),"Account scopes must isolate saved state");runtime.ApplyPersistenceAction("storage","clear");Check(!runtime.PersistenceHasSave&&runtime.PersistenceScore==1,"Clear must remove storage only");
  }finally{PlayerPrefs.DeleteKey(bridgeKey);PlayerPrefs.Save();UnityEngine.Object.DestroyImmediate(stateHost);UnityEngine.Object.DestroyImmediate(bridgeHost);}
  Debug.Log("COURSE_LAB_PERSISTENCE_TESTS_PASSED");
 }
}

