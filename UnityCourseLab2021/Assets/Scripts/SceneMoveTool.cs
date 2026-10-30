using System;
using UnityEngine;

namespace UnityCourseLab
{
    // Editor interaction is separate from simulation and never introduces colliders.
    public sealed class SceneMoveTool : MonoBehaviour
    {
        private LabRuntime owner;
        private Camera view;
        private Transform gizmo;
        private readonly Vector3[] axes = { Vector3.right, Vector3.up, Vector3.forward };
        private readonly string[] axisNames = { "x", "y", "z" };
        private readonly Material[] materials = new Material[3];
        private readonly Color[] colors = { new Color(0.98f,0.35f,0.3f), new Color(0.45f,0.9f,0.4f), new Color(0.3f,0.6f,1) };
        private Mesh cone;
        private float handleLength = 1;
        private bool dragging, moved;
        private Vector3 pointerStart, origin, anchorHit, planeNormal;
        private string dragAxis, dragObject;
        public bool IsDragging { get { return dragging; } }

        public void Initialize(LabRuntime runtime, Camera camera, Material overlay)
        {
            owner=runtime; view=camera;
            gizmo=new GameObject("Move Handles").transform;
            cone=CreateArrowMesh();
            for(var i=0;i<3;i++)
            {
                materials[i]=new Material(overlay) { color=colors[i] };
                var axisObject=new GameObject(axisNames[i].ToUpper()+" Move Handle");
                axisObject.transform.SetParent(gizmo,false);
                axisObject.transform.localRotation=Quaternion.FromToRotation(Vector3.up,axes[i]);
                var line=axisObject.AddComponent<LineRenderer>();
                line.useWorldSpace=false; line.positionCount=2;
                line.SetPosition(0,Vector3.up*0.12f); line.SetPosition(1,Vector3.up*0.78f);
                line.startWidth=line.endWidth=0.025f; line.sharedMaterial=materials[i];
                var arrow=new GameObject("Arrow"); arrow.transform.SetParent(axisObject.transform,false);
                arrow.AddComponent<MeshFilter>().sharedMesh=cone;
                arrow.AddComponent<MeshRenderer>().sharedMaterial=materials[i];
            }
            gizmo.gameObject.SetActive(false);
        }

        private void Update()
        {
            if(owner==null) return;
            if(!owner.CanEdit)
            {
                dragging=false; gizmo.gameObject.SetActive(false); return;
            }
            RefreshHandles();
            if(dragging)
            {
                if(Input.GetKeyDown(KeyCode.Escape)) { owner.MoveObject(dragObject,origin,false); Finish(true); return; }
                if(!Input.GetMouseButton(0)) { Finish(false); return; }
                if((Input.mousePosition-pointerStart).sqrMagnitude>9) moved=true;
                Vector3 hit;
                if(moved && Intersect(Input.mousePosition,origin,planeNormal,out hit))
                {
                    var projected=MoveProjection.Apply(Value(origin),Value(anchorHit),Value(hit),dragAxis);
                    if(!owner.MoveObject(dragObject,new Vector3(projected.x,projected.y,projected.z),false)) dragging=false;
                }
                return;
            }
            if(!PointerInside()) return;
            var picked=PickAxis(Input.mousePosition);
            for(var i=0;i<3;i++) materials[i].color=axisNames[i]==picked ? Color.Lerp(colors[i],Color.white,0.45f) : colors[i];
            if(!Input.GetMouseButtonDown(0) || Input.GetMouseButton(1)) return;
            if(picked!=null && owner.SelectedObject!=null) { Begin(picked); return; }
            RaycastHit objectHit;
            if(Physics.Raycast(view.ScreenPointToRay(Input.mousePosition),out objectHit))
            {
                var body=objectHit.collider.GetComponent<LabBody>();
                if(body!=null) { owner.SelectObject(body.ObjectId); Begin("xz"); }
            }
        }

        private void LateUpdate() { if(owner!=null && owner.CanEdit) RefreshHandles(); }

        private void Begin(string axis)
        {
            var selected=owner.SelectedObject;
            if(selected==null) return;
            origin=selected.transform.position; dragObject=owner.SelectedId; dragAxis=axis;
            planeNormal=Vector3.up;
            if(axis!="xz")
            {
                var direction=axes[Array.IndexOf(axisNames,axis)];
                planeNormal=Vector3.ProjectOnPlane(view.transform.forward,direction).normalized;
                if(planeNormal.sqrMagnitude<0.001f) planeNormal=Vector3.ProjectOnPlane(view.transform.up,direction).normalized;
            }
            if(!Intersect(Input.mousePosition,origin,planeNormal,out anchorHit)) return;
            pointerStart=Input.mousePosition; dragging=true; moved=false;
        }

        private void Finish(bool canceled)
        {
            dragging=false;
            if(moved && !canceled && owner.SelectedObject!=null) owner.MoveObject(dragObject,owner.SelectedObject.transform.position,true);
            for(var i=0;i<3;i++) materials[i].color=colors[i];
        }

        public void EndInteraction()
        {
            if(dragging) Finish(false);
        }

        private bool Intersect(Vector3 pointer, Vector3 point, Vector3 normal, out Vector3 hit)
        {
            var ray=view.ScreenPointToRay(pointer); LabVector value;
            var success=MoveProjection.TryIntersect(Value(ray.origin),Value(ray.direction),Value(point),Value(normal),out value);
            hit=new Vector3(value.x,value.y,value.z); return success;
        }

        private string PickAxis(Vector3 pointer)
        {
            var selected=owner.SelectedObject;
            if(selected==null) return null;
            var center=selected.transform.position;
            var best=10f; string picked=null;
            for(var i=0;i<3;i++)
            {
                var a=view.WorldToScreenPoint(center+axes[i]*handleLength*0.22f);
                var b=view.WorldToScreenPoint(center+axes[i]*handleLength);
                if(a.z<=0 || b.z<=0) continue;
                var segment=(Vector2)(b-a);
                if(segment.sqrMagnitude<1) continue;
                var t=Mathf.Clamp01(Vector2.Dot((Vector2)(pointer-a),segment)/segment.sqrMagnitude);
                var distance=Vector2.Distance(pointer,(Vector2)a+segment*t);
                if(distance<best) {best=distance;picked=axisNames[i];}
            }
            return picked;
        }

        private void RefreshHandles()
        {
            var selected=owner.SelectedObject;
            gizmo.gameObject.SetActive(selected!=null && owner.CanEdit);
            if(selected==null) return;
            gizmo.position=selected.transform.position;
            var depth=Vector3.Dot(gizmo.position-view.transform.position,view.transform.forward);
            handleLength=Mathf.Max(0.15f,2*depth*Mathf.Tan(view.fieldOfView*Mathf.Deg2Rad*0.5f)*86/Mathf.Max(Screen.height,1));
            gizmo.localScale=Vector3.one*handleLength;
        }

        private static bool PointerInside() { var p=Input.mousePosition; return p.x>=0 && p.x<=Screen.width && p.y>=0 && p.y<=Screen.height; }
        private static LabVector Value(Vector3 value) { return new LabVector(value.x,value.y,value.z); }
        private static Mesh CreateArrowMesh()
        {
            const int sides=16;
            var vertices=new Vector3[sides+2]; var triangles=new int[sides*6];
            vertices[0]=Vector3.up;
            vertices[sides+1]=Vector3.up*0.74f;
            for(var i=0;i<sides;i++)
            {
                var angle=i*Mathf.PI*2/sides;
                vertices[i+1]=new Vector3(Mathf.Cos(angle)*0.085f,0.74f,Mathf.Sin(angle)*0.085f);
                var next=(i+1)%sides+1;
                triangles[i*6]=0; triangles[i*6+1]=i+1; triangles[i*6+2]=next;
                triangles[i*6+3]=sides+1; triangles[i*6+4]=next; triangles[i*6+5]=i+1;
            }
            var mesh=new Mesh { name="Move Arrow",vertices=vertices,triangles=triangles };
            mesh.RecalculateNormals(); mesh.RecalculateBounds(); return mesh;
        }
        private void OnDestroy()
        {
            if(gizmo!=null) Destroy(gizmo.gameObject);
            if(cone!=null) Destroy(cone);
            foreach(var material in materials) if(material!=null) Destroy(material);
        }
    }
}
