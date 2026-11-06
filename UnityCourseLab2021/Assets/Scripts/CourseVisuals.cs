using UnityEngine;
namespace UnityCourseLab {
 // Semantic visuals are children of the teaching collider; source bounds are normalized in world space.
 public static class CourseVisuals {
  public static GameObject Apply(GameObject root,LabObject item,string experiment,Material surface){
   if(item.kind=="ground"||item.kind=="sphere"||item.kind=="physicsBody"||item.kind=="parentFrame"||item.kind=="triggerZone"||item.kind=="animatedActor")return null;
   string model=null;float height=.8f;Color? tint=null;
   if(item.kind=="player"||(experiment=="lab09"&&(item.id=="enemy"||item.id=="player"))){model="character";height=1.3f;tint=item.id=="enemy"?new Color(.8f,.15f,.12f):new Color(.1f,.5f,1);}
   else if(item.kind=="coin"){model="coin";height=.5f;tint=Color.yellow;}
   else if(item.kind=="finish"){model="flag";height=1.5f;tint=Color.green;}
   else if(item.kind=="emitter"){model="pot_large";height=.75f;}
   else if(item.kind=="projectile"||item.scripts.Contains("poolItem")){model="crop_melon";height=.3f;}
   else if(item.kind=="feedbackSource"){model="pot_large";height=.5f;}
   else if(item.kind=="inventoryPanel"){model="log_stack";height=.7f;}
   else if(item.kind=="healthPanel"){model="sign";height=1;}
   else if(item.kind=="score"){model="statue_obelisk";height=.8f;}
   else if(item.kind=="target"){model=experiment=="lab03"?"rock_largeA":"sign";height=experiment=="lab03"?1:1.2f;}
   else if(item.kind=="vectorMover"){model="character";height=1;tint=Color.cyan;}
   if(model==null)return null;
   var collider=root.GetComponent<Collider>();float bottom=collider!=null?collider.bounds.min.y:root.transform.position.y;
   var visual=CourseArt.Place(root.transform,model,new Vector3(root.transform.position.x,bottom,root.transform.position.z),height);
   if(visual==null)return null;
   root.GetComponent<Renderer>().enabled=false;
   if(tint.HasValue){var cleanup=visual.AddComponent<CourseVisualMaterials>();foreach(var r in visual.GetComponentsInChildren<Renderer>()){var material=new Material(surface);material.color=tint.Value;r.sharedMaterial=material;cleanup.Materials.Add(material);}}
   return visual;
  }
 }
 public sealed class CourseVisualMaterials:MonoBehaviour {public System.Collections.Generic.List<Material> Materials=new System.Collections.Generic.List<Material>();void OnDestroy(){foreach(var material in Materials)if(material!=null)DestroyImmediate(material);}}
}
