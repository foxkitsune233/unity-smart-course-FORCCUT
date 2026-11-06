using UnityEngine;
namespace UnityCourseLab { public sealed class LabAITarget:MonoBehaviour {public LabRuntime Owner;void Update(){if(Owner==null||!Owner.Running)return;var delta=new Vector3(Input.GetAxisRaw("Horizontal"),0,Input.GetAxisRaw("Vertical")).normalized;transform.position+=delta*3*Time.deltaTime;}} }
