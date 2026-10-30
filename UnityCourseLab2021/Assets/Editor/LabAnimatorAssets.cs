using System.IO;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;
public static class LabAnimatorAssets {
 public static void Ensure(){
  const string root="Assets/Resources";Directory.CreateDirectory(root);
  if(AssetDatabase.LoadAssetAtPath<AnimatorController>(root+"/LabAnimator.controller")!=null)return;
  var controller=AnimatorController.CreateAnimatorControllerAtPath(root+"/LabAnimator.controller");
  controller.AddParameter("Speed",AnimatorControllerParameterType.Float);controller.AddParameter("Grounded",AnimatorControllerParameterType.Bool);controller.AddParameter("Jump",AnimatorControllerParameterType.Trigger);
  var machine=controller.layers[0].stateMachine;
  var idle=machine.AddState("Idle");var walk=machine.AddState("Walk");var jump=machine.AddState("Jump");machine.defaultState=idle;
  idle.motion=Clip(root,"Idle",new[]{0f,.5f,1f},new[]{0f,.035f,0f},true,false);
  walk.motion=Clip(root,"Walk",new[]{0f,.25f,.5f,.75f,1f},new[]{0f,.12f,0f,.12f,0f},true,true);
  jump.motion=Clip(root,"Jump",new[]{0f,.4f,.8f},new[]{0f,1f,0f},false,true);
  var toWalk=idle.AddTransition(walk);toWalk.hasExitTime=false;toWalk.duration=.08f;toWalk.AddCondition(AnimatorConditionMode.Greater,.1f,"Speed");
  var toIdle=walk.AddTransition(idle);toIdle.hasExitTime=false;toIdle.duration=.08f;toIdle.AddCondition(AnimatorConditionMode.Less,.1f,"Speed");
  foreach(var state in new[]{idle,walk}){var t=state.AddTransition(jump);t.hasExitTime=false;t.duration=.03f;t.AddCondition(AnimatorConditionMode.If,0,"Jump");t.AddCondition(AnimatorConditionMode.If,0,"Grounded");}
  var land=jump.AddTransition(idle);land.hasExitTime=true;land.exitTime=.95f;land.duration=.05f;
  AssetDatabase.SaveAssets();AssetDatabase.Refresh();
 }
 static AnimationClip Clip(string root,string name,float[] times,float[] values,bool loop,bool events){
  var clip=new AnimationClip{name=name,frameRate=30};var keys=new Keyframe[times.Length];for(int i=0;i<keys.Length;i++)keys[i]=new Keyframe(times[i],values[i]);
  clip.SetCurve("Visual",typeof(Transform),"localPosition.y",new AnimationCurve(keys));
  var settings=AnimationUtility.GetAnimationClipSettings(clip);settings.loopTime=loop;AnimationUtility.SetAnimationClipSettings(clip,settings);
  if(events)AnimationUtility.SetAnimationEvents(clip,new[]{new AnimationEvent{time=times[1],functionName="OnLabAnimationEvent"}});
  AssetDatabase.CreateAsset(clip,root+"/"+name+".anim");return clip;
 }
}
