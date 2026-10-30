using UnityEngine;
namespace UnityCourseLab {
 public sealed class ExperimentActor : MonoBehaviour {
  public LabRuntime Owner;public LabObject Definition;public bool Spawned;public string Target,EmitterId;float age,timer;bool collected;Rigidbody body;
  public void Begin(){body=GetComponent<Rigidbody>();if(Definition.scripts.Contains("playerMove")){body.isKinematic=false;body.useGravity=false;body.constraints=RigidbodyConstraints.FreezeRotation|RigidbodyConstraints.FreezePositionY;}if(Definition.scripts.Contains("collectible")||Definition.scripts.Contains("finish"))GetComponent<Collider>().isTrigger=true;}
  void Start(){if(Definition!=null&&Definition.scripts.Contains("lifecycleProbe"))Owner.LifecycleStart++;}
  void Update(){if(Definition==null||!Owner.Running)return;if(Definition.scripts.Contains("lifecycleProbe"))Owner.LifecycleUpdate++;age+=Time.deltaTime;
   if(Spawned&&age>=Definition.settings.lifetime){Owner.RemoveProjectile(this);return;}
   if(Definition.scripts.Contains("spawnEmitter")){timer-=Time.deltaTime;if(timer<=0){timer=Definition.settings.interval;Owner.SpawnProjectile(this);}}
  }
  void FixedUpdate(){if(Definition==null||!Owner.Running)return;if(Definition.scripts.Contains("lifecycleProbe"))Owner.LifecycleFixed++;
   if(Definition.scripts.Contains("playerMove")){var delta=new Vector3(Input.GetAxisRaw("Horizontal"),0,Input.GetAxisRaw("Vertical")).normalized*Definition.settings.speed*Time.fixedDeltaTime;var p=body.position+delta;p.x=Mathf.Clamp(p.x,-4.5f,4.5f);p.z=Mathf.Clamp(p.z,-4.5f,4.5f);body.MovePosition(p);}
  }
  void OnTriggerEnter(Collider other){if(collected||!Owner.Running)return;var a=other.GetComponent<ExperimentActor>();if(a==null||!a.Definition.scripts.Contains("playerMove"))return;
   if(Definition.scripts.Contains("collectible")){collected=true;Owner.Collect(Definition.settings.scoreTarget);if(Spawned)Owner.RemoveProjectile(this);else gameObject.SetActive(false);}
   if(Definition.scripts.Contains("finish"))Owner.TryFinish(Definition.settings.scoreTarget);
  }
  void OnCollisionEnter(Collision collision){if(!Spawned||!Owner.Running)return;var a=collision.gameObject.GetComponent<ExperimentActor>();if(a!=null&&a.Definition.id==Target&&a.Definition.scripts.Contains("targetHitReceiver")){Owner.Hit();Owner.RemoveProjectile(this);}}
 }
}
