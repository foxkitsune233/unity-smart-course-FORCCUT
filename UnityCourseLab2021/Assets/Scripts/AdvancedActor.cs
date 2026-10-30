using UnityEngine;
namespace UnityCourseLab {
 public sealed class AdvancedActor : MonoBehaviour {
  public LabRuntime Owner; public LabObject Definition; Rigidbody body; Collider shape; bool jumpRequested; PhysicMaterial material;
  public void Begin(){shape=GetComponent<Collider>();var c=Definition.settings;
   if(Definition.scripts.Contains("triggerProbe")){shape.isTrigger=true;GetComponent<Renderer>().material.color=new Color(.2f,.8f,.7f,.5f);}
   if(Definition.scripts.Contains("physicsMove")){body=GetComponent<Rigidbody>();body.isKinematic=false;body.useGravity=true;body.mass=c.mass;body.constraints=RigidbodyConstraints.None;body.collisionDetectionMode=CollisionDetectionMode.ContinuousDynamic;material=new PhysicMaterial("Student physics"){dynamicFriction=c.friction,staticFriction=c.friction,bounciness=c.bounce,frictionCombine=PhysicMaterialCombine.Average,bounceCombine=PhysicMaterialCombine.Maximum};shape.sharedMaterial=material;}
  }
  void Update(){if(!Owner.Running)return;if(body!=null&&Input.GetKeyDown(KeyCode.Space))jumpRequested=true;StepCoordinates(Time.deltaTime,new Vector3(Input.GetAxisRaw("Horizontal"),0,Input.GetAxisRaw("Vertical")));} public void StepCoordinates(float deltaTime,Vector3 input){if(!Owner.Running)return;
   var c=Definition.settings;
   if(Definition.scripts.Contains("coordinateMove")) {
    var target=Owner.ObjectFor(c.target);var difference=target.transform.position-transform.position;var distance=difference.magnitude;Owner.CoordinateDistance=distance;
    Owner.WorldPosition=new LabVector(transform.position.x,transform.position.y,transform.position.z);var local=transform.localPosition;Owner.LocalPosition=new LabVector(local.x,local.y,local.z);
    if(distance>c.stopDistance+.001f){
     // Keyboard demonstrates the selected axes; otherwise approach the target with a clamped step.

     if(input.sqrMagnitude>.01f){var direction=c.space=="local"&&transform.parent!=null?transform.parent.TransformDirection(input.normalized):input.normalized;transform.position+=direction*c.speed*deltaTime;}
     else transform.position+=difference.normalized*Mathf.Min(c.speed*deltaTime,distance-c.stopDistance);
    } else {Owner.CoordinateArrived=true;Owner.Completed=true;}
   }
   if(Definition.scripts.Contains("lookAtTarget")){var t=Owner.ObjectFor(c.target);if((t.transform.position-transform.position).sqrMagnitude>.00001f)transform.LookAt(t.transform.position);}
  }
  void FixedUpdate(){if(!Owner.Running||body==null)return;
   var bounds=shape.bounds;var origin=new Vector3(bounds.center.x,bounds.min.y+.04f,bounds.center.z);RaycastHit hit;
   bool grounded=Physics.Raycast(origin,Vector3.down,out hit,.14f,~0,QueryTriggerInteraction.Ignore)&&hit.collider!=shape&&body.velocity.y<=.1f;
   Owner.Grounded=grounded;if(grounded)Owner.RayHits++;
   var c=Definition.settings;var input=new Vector3(Input.GetAxisRaw("Horizontal"),0,Input.GetAxisRaw("Vertical")).normalized;
   if(input.sqrMagnitude>.01f){body.AddForce(input*c.speed*3,ForceMode.Acceleration);var horizontal=new Vector3(body.velocity.x,0,body.velocity.z);if(horizontal.magnitude>c.speed){var limited=horizontal.normalized*c.speed;body.velocity=new Vector3(limited.x,body.velocity.y,limited.z);}}
   if(jumpRequested){jumpRequested=false;if(grounded){body.AddForce(Vector3.up*c.jumpForce,ForceMode.Impulse);Owner.Jumps++;Owner.Grounded=false;}else Owner.RejectedJumps++;}
   if(Owner.Jumps>0&&Owner.Triggers>0&&Owner.PhysicsContacts>0&&grounded)Owner.Completed=true;
  }
  void OnCollisionEnter(Collision c){if(Owner.Running&&Definition.scripts.Contains("physicsMove"))Owner.PhysicsContacts++;}
  void OnTriggerEnter(Collider c){if(!Owner.Running||!Definition.scripts.Contains("triggerProbe"))return;var actor=c.GetComponent<AdvancedActor>();if(actor!=null&&actor.Definition.scripts.Contains("physicsMove"))Owner.Triggers++;}
  void OnDestroy(){if(material!=null){if(Application.isPlaying)Destroy(material);else DestroyImmediate(material);}}
 }
}






