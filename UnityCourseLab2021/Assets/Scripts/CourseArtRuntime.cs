using UnityEngine;
namespace UnityCourseLab {
 public sealed partial class LabRuntime {
  GameObject courseArt;
  void RebuildCourseArt(){
   if(courseArt!=null){courseArt.SetActive(false);Destroy(courseArt);}
   courseArt=new GameObject("Kenney CC0 scenery");
   CourseArt.Place(courseArt.transform,"tree_pineDefaultA",new Vector3(-6,0,-3),2.4f);
   CourseArt.Place(courseArt.transform,"tree_pineDefaultA",new Vector3(6,0,3),2.8f);
   CourseArt.Place(courseArt.transform,"tree_pineDefaultA",new Vector3(6,0,-4),1.9f);
   CourseArt.Place(courseArt.transform,"rock_largeA",new Vector3(-6,0,2),.8f);
   CourseArt.Place(courseArt.transform,"rock_largeA",new Vector3(5.8f,0,-2),.6f);
  }
 }
}
