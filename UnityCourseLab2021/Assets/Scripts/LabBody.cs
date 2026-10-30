using UnityEngine;
namespace UnityCourseLab
{
    public sealed class LabBody : MonoBehaviour
    {
        public string ObjectId;
        public LabRuntime Owner;
        private void OnCollisionEnter(Collision collision)
        {
            var other = collision.gameObject.GetComponent<LabBody>();
            if (other != null) Owner.ReportContact(ObjectId, other.ObjectId);
        }
    }
}
