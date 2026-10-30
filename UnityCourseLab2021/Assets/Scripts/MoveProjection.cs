using System;
namespace UnityCourseLab
{
    public static class MoveProjection
    {
        public static LabVector Apply(LabVector start, LabVector startHit, LabVector currentHit, string axis)
        {
            if (!Finite(start) || !Finite(startHit) || !Finite(currentHit)) throw new ArgumentException("Invalid drag coordinates.");
            var delta = new LabVector(currentHit.x-startHit.x, currentHit.y-startHit.y, currentHit.z-startHit.z);
            switch (axis)
            {
                case "xz": return new LabVector(start.x+delta.x, start.y, start.z+delta.z);
                case "x": return new LabVector(start.x+delta.x, start.y, start.z);
                case "y": return new LabVector(start.x, start.y+delta.y, start.z);
                case "z": return new LabVector(start.x, start.y, start.z+delta.z);
                default: throw new ArgumentException("Unknown movement axis.");
            }
        }
        public static bool TryIntersect(LabVector rayOrigin, LabVector rayDirection, LabVector planePoint, LabVector planeNormal, out LabVector hit)
        {
            hit = new LabVector();
            if (!Finite(rayOrigin) || !Finite(rayDirection) || !Finite(planePoint) || !Finite(planeNormal)) return false;
            var denominator = Dot(rayDirection,planeNormal);
            if (Math.Abs(denominator)<0.00001f) return false;
            var distance = Dot(new LabVector(planePoint.x-rayOrigin.x,planePoint.y-rayOrigin.y,planePoint.z-rayOrigin.z),planeNormal)/denominator;
            if (distance<0 || float.IsInfinity(distance) || float.IsNaN(distance)) return false;
            hit = new LabVector(rayOrigin.x+rayDirection.x*distance,rayOrigin.y+rayDirection.y*distance,rayOrigin.z+rayDirection.z*distance);
            return Finite(hit);
        }
        private static float Dot(LabVector a, LabVector b) { return a.x*b.x+a.y*b.y+a.z*b.z; }
        private static bool Finite(LabVector v) { return !float.IsNaN(v.x) && !float.IsInfinity(v.x) && !float.IsNaN(v.y) && !float.IsInfinity(v.y) && !float.IsNaN(v.z) && !float.IsInfinity(v.z); }
    }
}
