using UnityEngine;
namespace UnityCourseLab
{
    public sealed class PlatformMoveBehavior : MonoBehaviour
    {
        private Rigidbody body;
        private Vector3 origin;
        private float startTime;
        public void Begin()
        {
            origin=transform.position;startTime=Time.fixedTime;
            body=gameObject.GetComponent<Rigidbody>();if(body==null)body=gameObject.AddComponent<Rigidbody>();
            body.isKinematic=true;body.useGravity=false;
        }
        private void FixedUpdate()
        {
            body.MovePosition(origin+Vector3.right*Mathf.Sin(Time.fixedTime-startTime)*1.5f);
        }
    }
}
