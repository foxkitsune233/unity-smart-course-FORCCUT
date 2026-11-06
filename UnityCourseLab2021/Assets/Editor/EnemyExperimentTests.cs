using System;
using UnityEngine;
using UnityCourseLab;
public static class EnemyExperimentTests {
 public static void Run(){
  var session=new LabSession();session.LoadExperiment("lab09","demo");
  if(session.Preflight().Count!=0)throw new Exception("LAB09 demo invalid");
  session.LoadExperiment("lab09","practice");if(session.Preflight().Count==0)throw new Exception("Missing AI target accepted");
  var enemy=new GameObject("AI test");var target=new GameObject("AI target");
  var wall=GameObject.CreatePrimitive(PrimitiveType.Cube);wall.transform.position=new Vector3(0,.3f,1);wall.transform.localScale=new Vector3(2,2,.2f);
  try{var probe=enemy.AddComponent<LabEnemyAI>();probe.Target=target.transform;target.transform.position=new Vector3(0,0,2);Physics.SyncTransforms();if(probe.CanSee())throw new Exception("Wall must block AI sight");wall.SetActive(false);Physics.SyncTransforms();if(!probe.CanSee())throw new Exception("Unblocked target must be visible");target.transform.position=new Vector3(0,0,-2);if(probe.CanSee())throw new Exception("Rear target outside view cone");target.transform.position=new Vector3(0,0,20);if(probe.CanSee())throw new Exception("Distant target outside radius");UnityEngine.Object.DestroyImmediate(probe);}finally{UnityEngine.Object.DestroyImmediate(wall);}
  try{var ai=enemy.AddComponent<LabEnemyAI>();ai.Target=target.transform;target.transform.position=new Vector3(0,0,1);ai.Step(.1f);if(ai.State!="Chase"||enemy.transform.position.z<=0)throw new Exception("AI failed to chase");target.transform.position=new Vector3(20,0,0);ai.Step(.1f);if(ai.State!="Patrol"||ai.Transitions!=2)throw new Exception("AI failed to return to patrol");}
  finally{UnityEngine.Object.DestroyImmediate(enemy);UnityEngine.Object.DestroyImmediate(target);}
  Debug.Log("COURSE_LAB_AI_TESTS_PASSED");
 }
}
