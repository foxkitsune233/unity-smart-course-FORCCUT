using System;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityCourseLab;
// Batch entry point deliberately stays alive to observe real Play Mode frames.
[InitializeOnLoad]
public static class FeedbackFrameTests {
 const string Key="CourseLab.FeedbackFrameTest";
 static LabRuntime runtime;static ParticleSystem particles;static int stage,lastFrame;static float started,burstAt,lifetime;static Vector3 position;static double deadline;
 static FeedbackFrameTests(){EditorApplication.playModeStateChanged+=ModeChanged;}
 public static void Run(){SessionState.SetBool(Key,true);EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);EditorApplication.EnterPlaymode();}
 static void ModeChanged(PlayModeStateChange state){if(state==PlayModeStateChange.EnteredPlayMode&&SessionState.GetBool(Key,false)){deadline=EditorApplication.timeSinceStartup+30;EditorApplication.update+=Tick;}}
 static void Check(bool ok,string message){if(!ok)throw new Exception(message);}
 static void Tick(){try{
  if(EditorApplication.timeSinceStartup>deadline)throw new Exception("LAB07 real frame test timed out at stage "+stage);
  if(lastFrame==Time.frameCount)return;lastFrame=Time.frameCount;
  if(stage==0){var host=new GameObject("LAB07 production dispatch integration");runtime=host.AddComponent<LabRuntime>();runtime.SurfaceMaterial=new Material(Shader.Find("Standard"));runtime.GridMaterial=new Material(Shader.Find("Sprites/Default"));runtime.GizmoMaterial=new Material(Shader.Find("CourseLab/GizmoOverlay"));runtime.GroundTemplate=GameObject.CreatePrimitive(PrimitiveType.Cube);runtime.SphereTemplate=GameObject.CreatePrimitive(PrimitiveType.Sphere);runtime.GroundTemplate.SetActive(false);runtime.SphereTemplate.SetActive(false);stage=1;return;}
  if(stage==1){runtime.Dispatch("{\"action\":\"experiment\",\"id\":\"lab07\",\"kind\":\"demo\"}");runtime.Dispatch("{\"action\":\"configure\",\"id\":\"feedback\",\"settings\":{\"effectSource\":\"effects\",\"interval\":3,\"burstCount\":12,\"trailTime\":1,\"volume\":0.3}}");runtime.Dispatch("{\"action\":\"play\"}");Check(runtime.Running,"LAB07 Dispatch play failed on primitive effect source");var source=runtime.ObjectFor("effects");Check(source.GetComponent<MeshRenderer>()!=null,"Effect source lost its primitive renderer");particles=source.GetComponentInChildren<ParticleSystem>();Check(particles!=null,"LAB07 Dispatch did not create real ParticleSystem");Check(particles.GetComponent<ParticleSystemRenderer>()!=null,"LAB07 particles lack renderer on primitive source");Check(particles.isPlaying,"LAB07 ParticleSystem simulation was never started");Check(!particles.emission.enabled,"LAB07 automatic emission must remain disabled");started=Time.time;stage=2;return;}
  if(stage==2){if(particles.particleCount==0)return;var observed=new ParticleSystem.Particle[64];particles.GetParticles(observed);position=observed[0].position;lifetime=observed[0].remainingLifetime;burstAt=Time.time;Check(runtime.FeedbackBursts==1&&runtime.ParticlesEmitted==12,"LAB07 burst did not emit configured particles");stage=3;return;}
  if(stage==3){if(Time.time-burstAt<.15f)return;var observed=new ParticleSystem.Particle[64];Check(particles.GetParticles(observed)>0,"Particles vanished before configured lifetime");Check(observed[0].remainingLifetime<lifetime-.05f,"Particle lifetime did not advance over runtime frames");Check(Vector3.Distance(position,observed[0].position)>.05f,"Particles did not move over runtime frames");stage=4;return;}
  if(stage==4){if(Time.time-burstAt<1.1f)return;Check(particles.particleCount==0,"LAB07 particles did not expire before next burst");Check(runtime.FeedbackBursts==1,"LAB07 emitted an unexpected burst");stage=5;return;}
  if(stage==5){if(Time.time-started<6.3f)return;Check(particles.isPlaying,"Particle simulation stopped after default duration");Check(runtime.FeedbackBursts>=3&&runtime.Completed,"LAB07 did not continue periodic feedback after particle expiration");Check(runtime.ObjectFor("effects").GetComponentInChildren<TrailRenderer>().positionCount>1,"LAB07 real frame trail missing");runtime.Dispatch("{\"action\":\"stop\"}");Check(!runtime.Running&&runtime.FeedbackBursts==0,"LAB07 stop did not reset feedback");Debug.Log("COURSE_LAB_FEEDBACK_RUNTIME_FRAMES_PASSED");Finish(0);}
 }catch(Exception error){Debug.LogException(error);Finish(1);}}
 static void Finish(int code){SessionState.SetBool(Key,false);EditorApplication.update-=Tick;EditorApplication.Exit(code);}
}

