using System;
using System.Text.Json;
using UnityCourseLab;

internal static class Program
{
    private static int failures;
    private static int tests;
    private static readonly JsonSerializerOptions Json = new JsonSerializerOptions { IncludeFields = true };

    private static void Main()
    {
        Test("create ground and sphere with stable unique IDs", () => {
            var session = new LabSession();
            var ground = session.Add("ground");
            var ball = session.Add("sphere");
            Check(session.Current.objects.Count == 2, "two objects expected");
            Check(ground.id != ball.id && ground.id.Length > 0, "unique IDs expected");
            Near(ball.position.y, 3, "ball begins three units above origin");
        });
        Test("stop restores deep edit state after simulated movement", () => {
            var session = new LabSession();
            var ball = session.Add("sphere");
            session.SetBehavior(ball.id, "drop");
            session.Start();
            session.Current.objects[0].position.y = 0.5f;
            session.Current.objects[0].rotation.z = 75;
            session.Stop();
            Near(session.Current.objects[0].position.y, 3, "edit height restored");
            Near(session.Current.objects[0].rotation.z, 0, "edit rotation restored");
            Check(session.Current.objects[0].behavior == "drop", "behavior restored");
            Check(session.Current.objects[0].id == ball.id, "identity restored");
            Check(!session.Playing, "edit mode expected");
        });
        Test("save during play exports edit snapshot rather than moving ball", () => {
            var session = new LabSession();
            session.Add("sphere"); session.Start();
            session.Current.objects[0].position.y = -5;
            var saved = session.ExportEdit();
            Near(saved.objects[0].position.y, 3, "snapshot height persisted");
            saved.objects[0].position.y = 9;
            Near(session.ExportEdit().objects[0].position.y, 3, "export is independent");
        });
        Test("scene survives JSON round trip with launch behavior", () => {
            var source = new LabSession();
            source.Add("ground"); var ball = source.Add("sphere");
            source.SetBehavior(ball.id, "launch");
            source.SetPosition(ball.id, new LabVector(-2, 4, 1));
            var json = JsonSerializer.Serialize(source.ExportEdit(), Json);
            var restored = new LabSession();
            restored.Import(JsonSerializer.Deserialize<SceneDocument>(json, Json));
            Check(restored.Current.objects.Count == 2, "restored object count");
            Check(restored.Current.objects[1].id == ball.id, "ID preserved");
            Check(restored.Current.objects[1].behavior == "launch", "behavior preserved");
            Near(restored.Current.objects[1].position.x, -2, "position preserved");
        });
        Test("unknown behavior is rejected and previous scene remains intact", () => {
            var session = new LabSession(); var ball = session.Add("sphere");
            Throws(() => session.SetBehavior(ball.id, "execute-custom-code"));
            Check(ball.behavior == "none", "previous behavior kept");
            var bad = session.ExportEdit(); bad.objects[0].behavior = "execute-custom-code";
            Throws(() => session.Import(bad));
            Check(session.Current.objects[0].behavior == "none", "import atomic");
        });
        Test("reject nonfinite coordinates and retain current position", () => {
            var session = new LabSession(); var ball = session.Add("sphere");
            Throws(() => session.SetPosition(ball.id, new LabVector(0, float.NaN, 0)));
            Near(ball.position.y, 3, "valid position retained");
        });
        Test("reject duplicate IDs and incompatible ground behavior", () => {
            var session = new LabSession(); var ground = session.Add("ground"); session.Add("sphere");
            var bad = session.ExportEdit(); bad.objects[1].id = ground.id;
            Throws(() => session.Import(bad));
            Throws(() => session.SetBehavior(ground.id, "drop"));
            Check(session.Current.objects.Count == 2, "valid scene retained");
        });
        Test("reject edits during play without corrupting stop snapshot", () => {
            var session = new LabSession(); var ball = session.Add("sphere"); session.Start();
            Throws(() => session.Add("ground"));
            Throws(() => session.SetBehavior(ball.id, "launch"));
            Throws(() => session.SetPosition(ball.id, new LabVector(2, 4, 0)));
            session.Stop();
            Check(session.Current.objects.Count == 1, "snapshot retained");
            Check(session.Current.objects[0].behavior == "none", "snapshot behavior retained");
        });
        Test("reject null document and unknown schema without erasing scene", () => {
            var session = new LabSession(); session.Add("sphere");
            Throws(() => session.Import(null));
            var bad = session.ExportEdit(); bad.schemaVersion = 999;
            Throws(() => session.Import(bad));
            Check(session.Current.objects.Count == 1, "existing scene retained");
        });
        Test("horizontal drag retains starting height and grabbing offset", () => {
            var moved = MoveProjection.Apply(new LabVector(2,3,4), new LabVector(2.4f,3,4.2f), new LabVector(3.4f,3,3.2f), "xz");
            Near(moved.x,3,"horizontal x"); Near(moved.y,3,"height retained"); Near(moved.z,3,"horizontal z");
        });
        Test("X handle changes only X", () => {
            var moved = MoveProjection.Apply(new LabVector(2,3,4), new LabVector(0,0,0), new LabVector(5,6,7), "x");
            Near(moved.x,7,"x changed"); Near(moved.y,3,"y retained"); Near(moved.z,4,"z retained");
        });
        Test("Y handle changes only Y", () => {
            var moved = MoveProjection.Apply(new LabVector(2,3,4), new LabVector(0,0,0), new LabVector(5,6,7), "y");
            Near(moved.x,2,"x retained"); Near(moved.y,9,"y changed"); Near(moved.z,4,"z retained");
        });
        Test("Z handle changes only Z", () => {
            var moved = MoveProjection.Apply(new LabVector(2,3,4), new LabVector(0,0,0), new LabVector(5,6,7), "z");
            Near(moved.x,2,"x retained"); Near(moved.y,3,"y retained"); Near(moved.z,11,"z changed");
        });
        Test("camera ray intersects horizontal plane at hand calculated point", () => {
            LabVector hit;
            Check(MoveProjection.TryIntersect(new LabVector(0,10,-10),new LabVector(0,-1,1),new LabVector(0,3,0),new LabVector(0,1,0),out hit),"intersection expected");
            Near(hit.x,0,"hit x"); Near(hit.y,3,"hit height"); Near(hit.z,-3,"hit depth");
        });
        Test("parallel and backward rays do not cause a drag jump", () => {
            LabVector hit;
            Check(!MoveProjection.TryIntersect(new LabVector(0,10,0),new LabVector(1,0,0),new LabVector(0,3,0),new LabVector(0,1,0),out hit),"parallel rejected");
            Check(!MoveProjection.TryIntersect(new LabVector(0,10,0),new LabVector(0,1,0),new LabVector(0,3,0),new LabVector(0,1,0),out hit),"backward rejected");
        });
        Test("invalid drag axis and nonfinite rays are rejected", () => {
            Throws(()=>MoveProjection.Apply(new LabVector(0,3,0),new LabVector(),new LabVector(1,2,3),"unknown"));
            LabVector hit;
            Check(!MoveProjection.TryIntersect(new LabVector(float.NaN,0,0),new LabVector(0,-1,0),new LabVector(),new LabVector(0,1,0),out hit),"nonfinite ray rejected");
        });
        Test("prefab placement validates before inserting a scene object", () => {
            var session=new LabSession();
            Throws(()=>session.AddAt("sphere",new LabVector(float.NaN,3,0)));
            Check(session.Current.objects.Count==0,"invalid drop must not create an object");
            var ball=session.AddAt("sphere",new LabVector(2,3,-1));
            Near(ball.position.x,2,"drop x");Near(ball.position.z,-1,"drop z");
        });
        Test("floor accepts platform movement and independent spin component", () => {
            var session=new LabSession();var ground=session.Add("ground");
            session.AttachScript(ground.id,"platform");session.AttachScript(ground.id,"spin");
            Check(ground.scripts.Count==2 && ground.scripts.Contains("platform") && ground.scripts.Contains("spin"),"floor components attached");
            Check(ground.behavior=="platform","motion compatibility field updated");
        });
        Test("duplicate and conflicting motion scripts are rejected atomically", () => {
            var session=new LabSession();var ball=session.Add("sphere");
            session.AttachScript(ball.id,"drop");session.AttachScript(ball.id,"spin");
            Throws(()=>session.AttachScript(ball.id,"drop"));Throws(()=>session.AttachScript(ball.id,"launch"));
            Check(ball.scripts.Count==2 && ball.behavior=="drop","existing components retained");
            var floor=session.Add("ground");Throws(()=>session.AttachScript(floor.id,"drop"));
            Throws(()=>session.AttachScript(ball.id,"platform"));
        });
        Test("removing a motion script preserves independent component", () => {
            var session=new LabSession();var ball=session.Add("sphere");
            session.AttachScript(ball.id,"drop");session.AttachScript(ball.id,"spin");
            session.RemoveScript(ball.id,"drop");
            Check(ball.behavior=="none" && ball.scripts.Count==1 && ball.scripts[0]=="spin","spin retained");
        });
        Test("play snapshot and export deep copy attached script list", () => {
            var session=new LabSession();var floor=session.Add("ground");session.AttachScript(floor.id,"platform");session.AttachScript(floor.id,"spin");
            session.Start();Throws(()=>session.AttachScript(floor.id,"spin"));Throws(()=>session.RemoveScript(floor.id,"platform"));
            session.Current.objects[0].scripts.Clear();var exported=session.ExportEdit();
            Check(exported.objects[0].scripts.Count==2,"snapshot survives current list mutation");
            exported.objects[0].scripts.Clear();session.Stop();
            Check(session.Current.objects[0].scripts.Count==2,"snapshot survives export mutation");
        });
        Test("legacy behavior-only scene migrates to attached script component", () => {
            var old=new SceneDocument();old.objects.Add(new LabObject {id="legacy-ball",kind="sphere",behavior="launch",position=new LabVector(0,3,0),rotation=new LabVector(),scale=new LabVector(1,1,1),scripts=null});
            var session=new LabSession();session.Import(old);
            Check(session.Current.objects[0].scripts.Count==1 && session.Current.objects[0].scripts[0]=="launch","legacy component recovered");
        });
        Test("import rejects unknown script without modifying valid scene", () => {
            var session=new LabSession();var ball=session.Add("sphere");session.AttachScript(ball.id,"drop");
            var invalid=session.ExportEdit();invalid.objects[0].scripts.Add("arbitrary-code");Throws(()=>session.Import(invalid));
            Check(session.Current.objects[0].scripts.Count==1,"unknown component import is atomic");
        });
        Console.WriteLine("RESULT: " + (tests - failures) + "/" + tests + " passed");
        Environment.ExitCode = failures == 0 ? 0 : 1;
    }

    private static void Test(string name, Action body)
    {
        tests++;
        try { body(); Console.WriteLine("PASS " + name); }
        catch (Exception ex) { failures++; Console.WriteLine("FAIL " + name + ": " + ex.Message); }
    }
    private static void Check(bool value, string message) { if (!value) throw new Exception(message); }
    private static void Near(float actual, float expected, string message) { Check(Math.Abs(actual - expected) < 0.0001f, message + ": " + actual); }
    private static void Throws(Action body)
    {
        try { body(); } catch (ArgumentException) { return; } catch (InvalidOperationException) { return; }
        throw new Exception("expected rejection");
    }
}
