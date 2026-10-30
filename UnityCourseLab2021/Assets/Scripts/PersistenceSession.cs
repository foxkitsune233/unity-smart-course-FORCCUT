using System;
using System.Collections.Generic;
namespace UnityCourseLab {
 public sealed partial class LabSession {
  void LoadPersistence(string mode){Current=new SceneDocument{experimentId="lab08"};if(mode=="blank")return;Preset("ground","ground",0,0);Preset("target","progress",0,0,"persistentState");var controller=Preset("score","storage",-3,0,"persistenceController");controller.settings.target=mode=="practice"?"":"progress";}
  void PersistencePreflight(List<LabIssue> errors){
   if(Current.experimentId=="lab08"){RequireScript(errors,"persistenceController");RequireScript(errors,"persistentState");}
   var slots=new HashSet<string>();var targets=new HashSet<string>();
   foreach(var o in Current.objects){var c=o.settings;
    if(o.scripts.Contains("persistentState"))try{LabPersistenceActor.Parse(c.initialData);}catch(ArgumentException ex){errors.Add(new LabIssue(o.id,"persistentState","initialData",ex.Message));}
    if(!o.scripts.Contains("persistenceController"))continue;
    Reference(errors,o,"persistenceController","target",c.target,"persistentState");
    if(!LabPersistenceActor.ValidSlot(c.storageSlot))errors.Add(new LabIssue(o.id,"persistenceController","storageSlot","存档槽需要1–32个字母、数字、下划线或横线。"));
    if(!slots.Add(c.storageSlot))errors.Add(new LabIssue(o.id,"persistenceController","storageSlot","存档槽不能重复。"));
    if(!string.IsNullOrEmpty(c.target)&&!targets.Add(c.target))errors.Add(new LabIssue(o.id,"persistenceController","target","每个状态对象需要独立的存储控制器。"));
   }
  }
 }
 public sealed partial class LabRuntime {
  string persistenceScope="editor";
  readonly Dictionary<string,LabPersistenceActor> persistence=new Dictionary<string,LabPersistenceActor>();
  public string PersistenceStatus="ready",PersistenceJson="";public int PersistenceScore,PersistenceLevel,PersistenceSaves,PersistenceLoads,PersistenceClears;public bool PersistenceHasSave;
  void ResetPersistence(){persistence.Clear();PersistenceStatus="ready";PersistenceJson="";PersistenceScore=PersistenceLevel=PersistenceSaves=PersistenceLoads=PersistenceClears=0;PersistenceHasSave=false;var controller=session.Current.objects.Find(x=>x.scripts.Contains("persistenceController"));if(controller!=null&&LabPersistenceActor.ValidSlot(controller.settings.storageSlot)){PersistenceHasSave=UnityEngine.PlayerPrefs.HasKey(LabPersistenceActor.KeyFor(persistenceScope,controller.settings.storageSlot));if(PersistenceHasSave)PersistenceStatus="stored";}}
  void StartPersistence(){foreach(var o in session.Current.objects)if(o.scripts.Contains("persistenceController")){var actor=objects[o.settings.target].AddComponent<LabPersistenceActor>();actor.StorageScope=persistenceScope;actor.Begin(o.settings.storageSlot,session.Find(o.settings.target).settings.initialData);persistence[o.id]=actor;ObservePersistence(actor);}}
  void ObservePersistence(LabPersistenceActor actor){PersistenceStatus=actor.Status;PersistenceJson=actor.Json;PersistenceScore=actor.Data.score;PersistenceLevel=actor.Data.level;PersistenceSaves=actor.Saves;PersistenceLoads=actor.Loads;PersistenceClears=actor.Clears;PersistenceHasSave=actor.HasSave;}
  public void ApplyPersistenceAction(string id,string action){if(!Running)throw new InvalidOperationException("请先运行实验。");LabPersistenceActor actor;if(!persistence.TryGetValue(id,out actor))throw new ArgumentException("请选择存储控制器。");
   try{switch(action){case "save":actor.Save();break;case "load":actor.Load();break;case "clear":actor.Clear();break;case "addScore":actor.AddScore();break;default:throw new ArgumentException("未知持久化命令。");}}catch(Exception){actor.Status="error";ObservePersistence(actor);throw;}
   ObservePersistence(actor);Completed=PersistenceSaves>0&&PersistenceLoads>0&&PersistenceClears>0;Emit();
  }
 }
}
