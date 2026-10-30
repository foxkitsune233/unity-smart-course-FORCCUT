using UnityEngine;
namespace UnityCourseLab {
 // Movement belongs to the scene object; clips animate its visual child.
 public sealed class LabAnimatorActor : MonoBehaviour {
  public LabRuntime Owner;public LabObject Definition;public Animator Animator {get;private set;}
  string previous="";bool returned;GameObject visual;
  public void Begin(){
   var controller=Resources.Load<RuntimeAnimatorController>("LabAnimator");if(controller==null)throw new System.InvalidOperationException("缺少 LAB06 AnimatorController 资源。");
   visual=new GameObject("Visual");visual.transform.SetParent(transform,false);
   var filter=visual.AddComponent<MeshFilter>();filter.sharedMesh=GetComponent<MeshFilter>().sharedMesh;
   var renderer=visual.AddComponent<MeshRenderer>();renderer.sharedMaterial=GetComponent<Renderer>().sharedMaterial;GetComponent<Renderer>().enabled=false;
   Animator=gameObject.AddComponent<Animator>();Animator.runtimeAnimatorController=controller;Animator.applyRootMotion=false;Animator.cullingMode=AnimatorCullingMode.AlwaysAnimate;Animator.speed=Definition.settings.animationSpeed;
   Animator.Rebind();Animator.Update(0);Observe();
  }
  void Update(){if(!Owner.Running)return;Step(Time.deltaTime,new Vector3(Input.GetAxisRaw("Horizontal"),0,Input.GetAxisRaw("Vertical")),Input.GetKeyDown(KeyCode.Space));}
  public void Step(float dt,Vector3 input,bool jump){
   if(!Owner.Running)return;input=Vector3.ClampMagnitude(input,1);var state=Animator.GetCurrentAnimatorStateInfo(0);
   bool airborne=state.IsName("Jump")||Animator.IsInTransition(0)&&Animator.GetNextAnimatorStateInfo(0).IsName("Jump");
   Animator.SetFloat("Speed",input.magnitude);Animator.SetBool("Grounded",!airborne);
   if(jump&&!airborne){Animator.SetTrigger("Jump");Owner.AnimationJumps++;}
   transform.position+=input*Definition.settings.speed*dt;
  }
  void LateUpdate(){if(Owner.Running)Observe();}
  public void Observe(){
   var info=Animator.GetCurrentAnimatorStateInfo(0);string state=info.IsName("Idle")?"Idle":info.IsName("Walk")?"Walk":info.IsName("Jump")?"Jump":"Unknown";
   Owner.AnimationState=state;Owner.AnimationSpeed=Animator.GetFloat("Speed");
   if(state!=previous){if(previous!="")Owner.AnimationTransitions++;if(previous=="Jump"&&state=="Idle")returned=true;previous=state;}
   if(state=="Idle")Owner.AnimationIdleSeen=true;if(state=="Walk")Owner.AnimationWalkSeen=true;if(state=="Jump")Owner.AnimationJumpSeen=true;
   if(Owner.AnimationIdleSeen&&Owner.AnimationWalkSeen&&Owner.AnimationJumpSeen&&returned&&Owner.AnimationEvents>0)Owner.Completed=true;
  }
  public void OnLabAnimationEvent(){if(Owner!=null&&Owner.Running){Owner.AnimationEvents++;}}
 }
}
