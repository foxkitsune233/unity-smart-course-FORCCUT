using UnityEngine;
namespace UnityCourseLab {
 public sealed class LabFeedbackActor:MonoBehaviour {
  public LabRuntime Owner;public LabObject Definition;
  ParticleSystem particles;TrailRenderer trail;AudioSource sound;AudioClip clip;Material material;Transform source;Vector3 origin;float age,timer;
  public void Begin(GameObject effectSource){
   source=effectSource.transform;origin=source.position;
   particles=effectSource.AddComponent<ParticleSystem>();particles.Stop(true,ParticleSystemStopBehavior.StopEmittingAndClear);
   var main=particles.main;main.loop=true;main.cullingMode=ParticleSystemCullingMode.AlwaysSimulate;main.playOnAwake=false;main.startLifetime=.8f;main.startSpeed=2;main.startSize=.16f;main.startColor=new Color(1,.65f,.1f);main.simulationSpace=ParticleSystemSimulationSpace.World;main.maxParticles=256;
   var emission=particles.emission;emission.enabled=false;var shape=particles.shape;shape.shapeType=ParticleSystemShapeType.Sphere;shape.radius=.15f;
   // Keep simulation active so manually emitted particles move and expire between bursts.
   particles.Play(true);
   material=new Material(Shader.Find("Sprites/Default"));particles.GetComponent<ParticleSystemRenderer>().sharedMaterial=material;
   trail=effectSource.AddComponent<TrailRenderer>();trail.sharedMaterial=material;trail.time=Definition.settings.trailTime;trail.startWidth=.15f;trail.endWidth=.01f;trail.startColor=Color.cyan;trail.endColor=new Color(0,1,1,0);trail.minVertexDistance=.02f;trail.emitting=true;trail.AddPosition(origin);
   sound=effectSource.AddComponent<AudioSource>();sound.playOnAwake=false;sound.spatialBlend=0;sound.volume=Definition.settings.volume;
   clip=AudioClip.Create("Feedback pulse",4410,1,22050,false);var samples=new float[4410];for(int i=0;i<samples.Length;i++)samples[i]=Mathf.Sin(2*Mathf.PI*660*i/22050f)*.2f*(1-i/(float)samples.Length);clip.SetData(samples,0);sound.clip=clip;
  }
  void Update(){Step(Time.deltaTime);}
  public void Step(float dt){if(!Owner.Running)return;age+=dt;timer-=dt;source.position=origin+new Vector3(Mathf.Sin(age*2)*2,.3f+Mathf.Sin(age*3)*.2f,Mathf.Cos(age*2));trail.AddPosition(source.position);Owner.TrailPoints=trail.positionCount;
   if(timer<=0){timer=Definition.settings.interval;var before=particles.particleCount;particles.Emit(Definition.settings.burstCount);Owner.ParticlesEmitted+=Mathf.Max(0,particles.particleCount-before);sound.PlayOneShot(clip,1);Owner.AudioPlays++;Owner.FeedbackBursts++;Owner.Completed=Owner.FeedbackBursts>=3&&Owner.ParticlesEmitted>0&&Owner.TrailPoints>1;}
  }
  void OnDestroy(){if(sound!=null)sound.Stop();if(material!=null)DestroyImmediate(material);if(clip!=null)DestroyImmediate(clip);}
 }
}


