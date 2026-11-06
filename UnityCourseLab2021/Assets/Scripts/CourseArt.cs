using UnityEngine;
namespace UnityCourseLab {
 public static class CourseArt {
  public static GameObject Place(Transform parent,string name,Vector3 position,float size){
   var model=Resources.Load<GameObject>("CourseArt/"+name);if(model==null)return null;
   var visual=Object.Instantiate(model);visual.name="CC0 scenery - "+name;
   visual.transform.localPosition=Vector3.zero;visual.transform.localRotation=Quaternion.identity;
   var bounds=new Bounds();bool first=true;foreach(var renderer in visual.GetComponentsInChildren<Renderer>()){if(first){bounds=renderer.bounds;first=false;}else bounds.Encapsulate(renderer.bounds);}
   var scale=size/Mathf.Max(.001f,bounds.size.y);visual.transform.localScale*=scale;
   visual.transform.position+=position-new Vector3(bounds.center.x,bounds.min.y,bounds.center.z)*scale;visual.transform.SetParent(parent,true);
   foreach(var collider in visual.GetComponentsInChildren<Collider>())Object.Destroy(collider);
   return visual;
  }
 }
}
