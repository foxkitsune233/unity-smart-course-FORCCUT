using UnityEngine;

namespace UnityCourseLab {
 // 3D 课程实验中的巡逻与追击控制器；状态变化由真实空间距离驱动。
 public sealed class LabEnemyAI : MonoBehaviour {
  public Transform Target;
  public LabRuntime Owner;
  public float Speed = 2f, DetectionRadius = 4f, PatrolRadius = 2f;
  public float ViewAngle=110;public bool Visible;LineRenderer sight;Material sightMaterial;
  public bool CanSee(){if(Target==null)return false;var p=transform.position+Vector3.up*.3f;var delta=Target.position+Vector3.up*.3f-p;if(delta.magnitude>DetectionRadius||Vector3.Angle(transform.forward,delta)>ViewAngle*.5f)return false;foreach(var hit in Physics.RaycastAll(p,delta.normalized,delta.magnitude,~0,QueryTriggerInteraction.Ignore))if(!hit.transform.IsChildOf(transform)&&!hit.transform.IsChildOf(Target))return false;return true;}
  void DrawSight(){if(sight==null){sight=new GameObject("AI detection sight").AddComponent<LineRenderer>();sight.transform.SetParent(transform,false);sightMaterial=new Material(Shader.Find("Sprites/Default"));sight.sharedMaterial=sightMaterial;sight.startWidth=sight.endWidth=.04f;}var p=transform.position+Vector3.up*.3f;sight.positionCount=29;sight.SetPosition(0,p);for(int i=0;i<=24;i++)sight.SetPosition(i+1,p+Quaternion.AngleAxis(-ViewAngle/2+ViewAngle*i/24,Vector3.up)*transform.forward*DetectionRadius);sight.SetPosition(26,p);sight.SetPosition(27,Target.position+Vector3.up*.3f);sight.SetPosition(28,p);sight.startColor=sight.endColor=Visible?Color.green:Color.red;}
  void OnDestroy(){if(sightMaterial!=null)DestroyImmediate(sightMaterial);}
  public string State { get; private set; } = "Patrol";
  public int Transitions { get; private set; }
  Vector3 origin;
  int direction = 1;
  void Start() { origin = transform.position; }
  void Update() { Step(Time.deltaTime); }
  public void Step(float dt) {
   if (Target == null || dt <= 0 || (Owner != null && !Owner.Running)) return;
   Vector3 delta = Target.position - transform.position;
   delta.y = 0;
   Visible=CanSee();string next = Visible ? "Chase" : "Patrol";
   if (next != State) { State = next; Transitions++; }
   Vector3 destination;
   if (State == "Chase") destination = new Vector3(Target.position.x, transform.position.y, Target.position.z);
   else {
    destination = origin + Vector3.right * (PatrolRadius * direction);
    if (Vector3.Distance(transform.position, destination) < .05f) direction = -direction;
   }
   var heading=destination-transform.position;if(heading.sqrMagnitude>.01f)transform.rotation=Quaternion.LookRotation(heading);transform.position = Vector3.MoveTowards(transform.position, destination, Mathf.Max(0, Speed) * dt);DrawSight();
   if(Owner!=null){Owner.AIState=State;Owner.AITransitions=Transitions;Owner.Completed=Transitions>=2;}
  }
 }
}
