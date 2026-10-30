using System;
using System.Collections.Generic;
namespace UnityCourseLab {
 public sealed partial class LabSession {
  void AdvancedPreflight(List<LabIssue> e) {
   if(Current.experimentId=="lab03"){RequireScript(e,"physicsMove");RequireScript(e,"triggerProbe");}
   if(Current.experimentId=="lab04"){RequireScript(e,"coordinateMove");RequireScript(e,"lookAtTarget");}
   if(Current.experimentId=="lab05"){RequireScript(e,"healthController");RequireScript(e,"inventoryController");}
   if(Current.experimentId=="lab06")RequireScript(e,"animatorController");
   foreach(var single in new[]{"healthController","inventoryController"})if(Current.objects.FindAll(x=>x.scripts.Contains(single)).Count>1)e.Add(new LabIssue("",single,"scene","场景只允许一个 "+single+" 控制器。")); foreach(var o in Current.objects) {
    var c=o.settings;if(o.scripts.Contains("physicsMove")&&(o.scripts.Contains("triggerProbe")||o.scripts.Contains("collectible")||o.scripts.Contains("finish")))e.Add(new LabIssue(o.id,"physicsMove","scripts","刚体碰撞运动不能与把同一碰撞体改为触发器的脚本共用。"));
    if(!string.IsNullOrEmpty(c.parent)) {
     var seen=new HashSet<string>{o.id};var id=c.parent;
     while(!string.IsNullOrEmpty(id)){var p=Current.objects.Find(x=>x.id==id);if(p==null||!seen.Add(id)){e.Add(new LabIssue(o.id,"transform","parent","父节点不存在或形成循环。"));break;}id=p.settings.parent;}
     if(o.rigidbody)e.Add(new LabIssue(o.id,"transform","parent","物理刚体不能挂在可变换父节点下。"));
    }
    foreach(var s in o.scripts) {
     if(s=="physicsMove") {
      if(!o.rigidbody)e.Add(new LabIssue(o.id,s,"rigidbody","需要 Rigidbody。"));
      Range(e,o,s,"mass",c.mass,.5f,5);Range(e,o,s,"friction",c.friction,0,1);Range(e,o,s,"bounce",c.bounce,0,1);Range(e,o,s,"jumpForce",c.jumpForce,2,8);Range(e,o,s,"speed",c.speed,1,8);
     }
     if(s=="coordinateMove"||s=="lookAtTarget") {
      var t=Current.objects.Find(x=>x.id==c.target);if(t==null||t.id==o.id)e.Add(new LabIssue(o.id,s,"target","请选择其他目标对象。"));
      Range(e,o,s,"speed",c.speed,1,8);Range(e,o,s,"stopDistance",c.stopDistance,.1f,3);
      if(c.space!="local"&&c.space!="world")e.Add(new LabIssue(o.id,s,"space","坐标模式必须为 local 或 world。"));
      if(o.rigidbody)e.Add(new LabIssue(o.id,s,"rigidbody","向量运动与动态刚体冲突，请移除 Rigidbody。"));
     }
     if(s=="animatorController"){Range(e,o,s,"speed",c.speed,1,8);Range(e,o,s,"animationSpeed",c.animationSpeed,.25f,3);if(o.rigidbody)e.Add(new LabIssue(o.id,s,"rigidbody","动画运动与动态刚体冲突，请移除 Rigidbody。"));}
     if(s=="healthController") {Range(e,o,s,"maxHealth",c.maxHealth,1,100);Range(e,o,s,"damage",c.damage,1,100);Range(e,o,s,"heal",c.heal,1,100);Layout(e,o,s);}
     if(s=="inventoryController") {Range(e,o,s,"capacity",c.capacity,1,8);Layout(e,o,s);}
    }
   }
  }
  void Layout(List<LabIssue> e,LabObject o,string s){if(o.settings.layout!="compact"&&o.settings.layout!="wide")e.Add(new LabIssue(o.id,s,"layout","布局必须为 compact 或 wide。"));}
  void Range(List<LabIssue> e,LabObject o,string s,string f,float v,float min,float max){if(!Finite(v)||v<min||v>max)e.Add(new LabIssue(o.id,s,f,f+" 必须为 "+min+"–"+max+"。"));}
  public void SetRotation(string id,LabVector v){RequireEdit();ValidateVector(v,false);Find(id).rotation=v;}
  void LoadAdvanced(string id,string mode) {
   Current=new SceneDocument{experimentId=id};if(mode=="blank")return;
   Preset("ground","ground",0,0);
   if(id=="lab03") {
    var p=Preset("physicsBody","ball",-3,0,"physicsMove");p.rigidbody=true;p.position.y=1;
    var ramp=Preset("ground","ramp",-2,-2);ramp.position.y=.5f;ramp.scale=new LabVector(3,.25f,2);ramp.rotation=new LabVector(0,0,-12);
    var obstacle=Preset("target","obstacle",2,1);obstacle.scale=new LabVector(.5f,1,3);
    var zone=Preset("triggerZone","zone",0,0,"triggerProbe");zone.scale=new LabVector(1,2,3);
    if(mode=="practice")p.rigidbody=false;
   } else if(id=="lab04") {
    var parent=Preset("parentFrame","frame",-2,0);parent.rotation=new LabVector(0,45,0);parent.scale=new LabVector(.3f,.3f,.3f);
    var mover=Preset("vectorMover","mover",-2,0,"coordinateMove","lookAtTarget");mover.settings.parent="frame";mover.settings.target="destination";
    var target=Preset("target","destination",3,2);target.scale=new LabVector(.4f,.4f,.4f);
    if(mode=="practice")mover.settings.target="";
   } else if(id=="lab06") { var actor=Preset("animatedActor","actor",0,0,"animatorController");if(mode=="practice")actor.settings.animationSpeed=0; } else {
    Preset("healthPanel","health",-2,0,"healthController");var inv=Preset("inventoryPanel","inventory",2,0,"inventoryController");
    if(mode=="practice")inv.settings.capacity=0;
   }
  }
 }
}





