using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Events;
namespace UnityCourseLab {
 public sealed class LabPoolActor:MonoBehaviour {
  public LabRuntime Owner;public LabSettings Settings;public GameObject Prototype;
  public UnityEvent OnRecycle=new UnityEvent();public int Created,Reused,Returned,Events;
  readonly List<GameObject> items=new List<GameObject>();readonly List<float> ages=new List<float>();float timer;
  public void Begin(){for(int i=0;i<Settings.capacity;i++){var item=Instantiate(Prototype,transform);item.SetActive(false);items.Add(item);ages.Add(0);Created++;}OnRecycle.AddListener(()=>Events++);}
  public void Step(float dt){if(!Owner.Running)return;timer-=dt;
   for(int i=0;i<items.Count;i++)if(items[i].activeSelf){ages[i]+=dt;items[i].transform.position+=Vector3.right*Settings.speed*dt;if(ages[i]>=Settings.lifetime){items[i].SetActive(false);Returned++;OnRecycle.Invoke();}}
   if(timer<=0){timer=Settings.interval;for(int i=0;i<items.Count;i++)if(!items[i].activeSelf){items[i].transform.position=transform.position;ages[i]=0;items[i].SetActive(true);Reused++;break;}}
   Owner.PoolCreated=Created;Owner.PoolReused=Reused;Owner.PoolReturned=Returned;Owner.PoolEvents=Events;Owner.Completed=Returned>=3&&Reused>Created;
  }
  void Update(){Step(Time.deltaTime);}
 }
 public sealed partial class LabSession {
  void LoadPool(string mode){Current=new SceneDocument{experimentId="lab10"};if(mode=="blank")return;Preset("ground","ground",0,0);var proto=Preset("target","pooled",0,-3,"poolItem");proto.scale=new LabVector(.3f,.3f,.3f);var pool=Preset("emitter","pool",-3,0,"objectPool");pool.settings.projectile=mode=="practice"?"":"pooled";pool.settings.capacity=3;pool.settings.lifetime=2;}
  void PoolPreflight(List<LabIssue> e){if(Current.experimentId=="lab10")RequireScript(e,"objectPool");foreach(var o in Current.objects)if(o.scripts.Contains("objectPool")){Reference(e,o,"objectPool","projectile",o.settings.projectile,"poolItem");if(o.settings.projectile==o.id)e.Add(new LabIssue(o.id,"objectPool","projectile","不能引用自身。"));Range(e,o,"objectPool","capacity",o.settings.capacity,1,8);Range(e,o,"objectPool","lifetime",o.settings.lifetime,.5f,5);Range(e,o,"objectPool","interval",o.settings.interval,.5f,3);Range(e,o,"objectPool","speed",o.settings.speed,1,8);}} 
 }
 public sealed partial class LabRuntime {public int PoolCreated,PoolReused,PoolReturned,PoolEvents;void StartPool(){PoolCreated=PoolReused=PoolReturned=PoolEvents=0;foreach(var o in session.Current.objects)if(o.scripts.Contains("objectPool")){var actor=objects[o.id].AddComponent<LabPoolActor>();actor.Owner=this;actor.Settings=o.settings;actor.Prototype=objects[o.settings.projectile];actor.Begin();}}}
}
