using UnityEngine;
namespace UnityCourseLab
{
    public sealed class DropBehavior : MonoBehaviour
    {
        public void Begin()
        {
            var body = gameObject.GetComponent<Rigidbody>(); if(body==null)body=gameObject.AddComponent<Rigidbody>(); body.isKinematic=false;
            body.mass = 1;
            body.useGravity = true;
            body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
        }
    }
}
