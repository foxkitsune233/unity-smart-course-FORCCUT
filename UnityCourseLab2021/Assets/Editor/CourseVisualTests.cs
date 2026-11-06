using System;
using UnityEngine;
using UnityCourseLab;
public static class CourseVisualTests {
 public static void Run(){
  foreach(var name in new[]{"character","coin","flag","sign","pot_large","log_stack","statue_obelisk","crop_melon"})if(Resources.Load<GameObject>("CourseArt/"+name)==null)throw new Exception("Missing course visual "+name);
  var root=GameObject.CreatePrimitive(PrimitiveType.Cube);var surface=new Material(Shader.Find("Standard"));
  try{foreach(var kind in new[]{"player","coin","finish","emitter","projectile","target","inventoryPanel","healthPanel","score","vectorMover","feedbackSource"}){
    var item=new LabObject{kind=kind,id=kind};var visual=CourseVisuals.Apply(root,item,"sandbox",surface);if(visual==null||root.GetComponent<Renderer>().enabled||root.GetComponent<Collider>()==null)throw new Exception("Invalid semantic visual "+kind);
    UnityEngine.Object.DestroyImmediate(visual);
   }}finally{UnityEngine.Object.DestroyImmediate(root);UnityEngine.Object.DestroyImmediate(surface);}
  Debug.Log("COURSE_LAB_VISUAL_TESTS_PASSED");
 }
}
