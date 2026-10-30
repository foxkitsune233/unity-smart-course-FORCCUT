using System;
using System.Collections.Generic;
using UnityEngine;
namespace UnityCourseLab {
 public sealed partial class LabRuntime {
  public string AnimationState="Idle";public float AnimationSpeed;public int AnimationTransitions,AnimationEvents,AnimationJumps;public bool AnimationIdleSeen,AnimationWalkSeen,AnimationJumpSeen;
  public bool Grounded,CoordinateArrived;public int Jumps,RejectedJumps,RayHits,Triggers,PhysicsContacts,Health,InventoryCount,InventoryRejected,HealthChanges;public float CoordinateDistance;public LabVector WorldPosition,LocalPosition;
  readonly Dictionary<string,int> healthValues=new Dictionary<string,int>(),inventoryValues=new Dictionary<string,int>();LabCanvas labCanvas;
  public GameObject ObjectFor(string id){return objects[id];}
  public int HealthFor(string id){int v;return healthValues.TryGetValue(id,out v)?v:0;}
  public int InventoryFor(string id){int v;return inventoryValues.TryGetValue(id,out v)?v:0;}
  public void ApplyUIAction(string id,string action){if(!Running)throw new InvalidOperationException("请先运行实验。");var o=session.Find(id);var c=o.settings;
   if((action=="damage"||action=="heal")&&o.scripts.Contains("healthController")){var before=HealthFor(id);healthValues[id]=Mathf.Clamp(before+(action=="damage"?-c.damage:c.heal),0,c.maxHealth);Health=healthValues[id];if(before!=Health)HealthChanges++;}
   else if((action=="addItem"||action=="removeItem")&&o.scripts.Contains("inventoryController")){var count=InventoryFor(id);if(action=="addItem"){if(count>=c.capacity)InventoryRejected++;else count++;}else count=Mathf.Max(0,count-1);inventoryValues[id]=count;InventoryCount=count;}
   else throw new ArgumentException("不支持的按钮白名单事件或缺少接收组件。");
   Completed=HealthChanges>=2&&InventoryRejected>0&&InventoryCount>0;if(labCanvas!=null)labCanvas.Refresh();Emit();
  }
  void ResetAdvanced(){ResetPersistence();ResetFeedback();if(labCanvas!=null){labCanvas.gameObject.SetActive(false);Destroy(labCanvas.gameObject);labCanvas=null;}AnimationState="Idle";AnimationSpeed=0;AnimationTransitions=AnimationEvents=AnimationJumps=0;AnimationIdleSeen=AnimationWalkSeen=AnimationJumpSeen=false;healthValues.Clear();inventoryValues.Clear();Grounded=CoordinateArrived=false;Jumps=RejectedJumps=RayHits=Triggers=PhysicsContacts=Health=InventoryCount=InventoryRejected=HealthChanges=0;CoordinateDistance=0;WorldPosition=LocalPosition=new LabVector();}
  void StartAdvanced(){StartPersistence();StartFeedback();LabObject h=null,i=null;
   foreach(var o in session.Current.objects){var go=objects[o.id];if(!string.IsNullOrEmpty(o.settings.parent))go.transform.SetParent(objects[o.settings.parent].transform,true);
    if(o.scripts.Contains("physicsMove")||o.scripts.Contains("triggerProbe")||o.scripts.Contains("coordinateMove")||o.scripts.Contains("lookAtTarget")){var actor=go.AddComponent<AdvancedActor>();actor.Owner=this;actor.Definition=o;actor.Begin();}
    if(o.scripts.Contains("animatorController")){var actor=go.AddComponent<LabAnimatorActor>();actor.Owner=this;actor.Definition=o;actor.Begin();}
    if(o.scripts.Contains("healthController")){healthValues[o.id]=o.settings.maxHealth;Health=o.settings.maxHealth;h=o;}
    if(o.scripts.Contains("inventoryController")){inventoryValues[o.id]=0;i=o;}
   }
   if(h!=null||i!=null){labCanvas=new GameObject("Real Unity UGUI Canvas").AddComponent<LabCanvas>();labCanvas.Initialize(this,h,i);}
  }
 }
}


