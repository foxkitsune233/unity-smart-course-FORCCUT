using System.Collections.Generic;
using UnityEngine;
namespace UnityCourseLab {
 public sealed partial class LabSession {
  void LoadFeedback(string mode){Current=new SceneDocument{experimentId="lab07"};if(mode=="blank")return;Preset("ground","ground",0,0);var source=Preset("feedbackSource","effects",0,0,"effectSource");source.scale=new LabVector(.5f,.5f,.5f);var controller=Preset("target","feedback",-3,0,"feedbackController");controller.settings.effectSource=mode=="practice"?"":"effects";}
  void FeedbackPreflight(List<LabIssue> errors){
   if(Current.experimentId=="lab07"){RequireScript(errors,"feedbackController");RequireScript(errors,"effectSource");}
   var used=new HashSet<string>();
   foreach(var o in Current.objects){var c=o.settings;
    if(o.scripts.Contains("effectSource")&&(o.rigidbody||o.scripts.Exists(Motion)))errors.Add(new LabIssue(o.id,"effectSource","scripts","反馈源由反馈控制器移动，请移除刚体与其他运动脚本。"));
    if(!o.scripts.Contains("feedbackController"))continue;
    Reference(errors,o,"feedbackController","effectSource",c.effectSource,"effectSource");
    if(!string.IsNullOrEmpty(c.effectSource)&&!used.Add(c.effectSource))errors.Add(new LabIssue(o.id,"feedbackController","effectSource","每个反馈控制器需要独立的反馈源。"));
    Range(errors,o,"feedbackController","interval",c.interval,.5f,3);Range(errors,o,"feedbackController","burstCount",c.burstCount,1,64);Range(errors,o,"feedbackController","trailTime",c.trailTime,.1f,3);Range(errors,o,"feedbackController","volume",c.volume,0,1);
   }
  }
 }
 public sealed partial class LabRuntime {
  public int FeedbackBursts,ParticlesEmitted,TrailPoints,AudioPlays;
  void ResetFeedback(){FeedbackBursts=ParticlesEmitted=TrailPoints=AudioPlays=0;}
  void StartFeedback(){foreach(var o in session.Current.objects)if(o.scripts.Contains("feedbackController")){var actor=objects[o.id].AddComponent<LabFeedbackActor>();actor.Owner=this;actor.Definition=o;actor.Begin(objects[o.settings.effectSource]);}}
 }
}
