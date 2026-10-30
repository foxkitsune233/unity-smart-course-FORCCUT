using UnityEngine;
namespace UnityCourseLab
{
    public sealed class SpinBehavior : MonoBehaviour
    {
        private Rigidbody body;
        private void Awake() { body=GetComponent<Rigidbody>(); }
        private void FixedUpdate()
        {
            var delta=Quaternion.AngleAxis(45f*Time.fixedDeltaTime,Vector3.up);
            // Compose with MovePosition without overwriting its pending kinematic pose.
            if(body!=null) body.MoveRotation(delta*body.rotation);
            else transform.rotation=delta*transform.rotation;
        }
    }
}
