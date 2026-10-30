using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityCourseLab;

public static class LabBuild
{
    [Serializable] private sealed class EngineEvidence
    {
        public string version;
        public bool jsonRoundTrip, editSnapshotRestored, gravityCollision, launchMotion;
        public float dropHeight, launchX;
    }

    [MenuItem("Course Lab/Build Web Experiment")]
    public static void BuildWeb()
    {
        Require2021();
        if (!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.WebGL, BuildTarget.WebGL))
            throw new Exception("Matching Unity 2021 WebGL Build Support is required.");
        SelfTest();
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        Directory.CreateDirectory("Assets/Scenes");
        Directory.CreateDirectory("Assets/Materials");
        Directory.CreateDirectory("Assets/Prefabs");
        var surface = AssetDatabase.LoadAssetAtPath<Material>("Assets/Materials/Surface.mat");
        if (surface == null) { surface = new Material(Shader.Find("Standard")); AssetDatabase.CreateAsset(surface, "Assets/Materials/Surface.mat"); }
        surface.SetFloat("_Glossiness", 0.3f);
        var grid = AssetDatabase.LoadAssetAtPath<Material>("Assets/Materials/Grid.mat");
        if (grid == null) { grid = new Material(Shader.Find("Sprites/Default")); AssetDatabase.CreateAsset(grid, "Assets/Materials/Grid.mat"); }
        var runtime = new GameObject("LabBridge").AddComponent<LabRuntime>();
        runtime.SurfaceMaterial = surface; runtime.GridMaterial = grid;
        var gizmo=AssetDatabase.LoadAssetAtPath<Material>("Assets/Materials/Gizmo.mat");
        if(gizmo==null) { gizmo=new Material(Shader.Find("CourseLab/GizmoOverlay")); AssetDatabase.CreateAsset(gizmo,"Assets/Materials/Gizmo.mat"); }
        runtime.GizmoMaterial=gizmo;
        runtime.GroundTemplate=CreatePrefab(PrimitiveType.Cube,"Ground",surface);
        runtime.SphereTemplate=CreatePrefab(PrimitiveType.Sphere,"Sphere",surface);
        if(!PrefabUtility.IsPartOfPrefabAsset(runtime.GroundTemplate) || !PrefabUtility.IsPartOfPrefabAsset(runtime.SphereTemplate))
            throw new Exception("Experiment templates must be genuine prefab assets.");
        EditorSceneManager.SaveScene(scene, "Assets/Scenes/Lab.unity");
        AssetDatabase.SaveAssets();
        PlayerSettings.companyName = "Course Lab";
        PlayerSettings.productName = "Unity Course Lab";
        PlayerSettings.runInBackground = true;
        PlayerSettings.colorSpace = ColorSpace.Gamma;
        PlayerSettings.SetScriptingBackend(BuildTargetGroup.WebGL, ScriptingImplementation.IL2CPP);
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
        PlayerSettings.WebGL.memorySize = 256;
        PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.FullWithoutStacktrace;
        QualitySettings.shadows = ShadowQuality.All;
        QualitySettings.shadowDistance = 30;
        QualitySettings.antiAliasing = 2;
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions {
            scenes = new[] { "Assets/Scenes/Lab.unity" },
            locationPathName = "Build/Web", target = BuildTarget.WebGL, options = BuildOptions.None
        });
        if (report.summary.result != BuildResult.Succeeded) throw new Exception("Web build failed: " + report.summary.result);
        foreach (var name in new[] { "index.html", "lab.js", "lab.css", "asset-drag.js" }) File.Copy("Web/" + name, "Build/Web/" + name, true);
        Directory.CreateDirectory("Evidence");
        File.WriteAllText("Evidence/build-result.txt", "Unity " + Application.unityVersion + "\nResult: " + report.summary.result + "\nBytes: " + report.summary.totalSize + "\nDuration: " + report.summary.totalTime);
        Debug.Log("COURSE_LAB_WEB_BUILD_SUCCEEDED " + Application.unityVersion);
    }

    public static void SelfTest()
    {
        Require2021();
        LabAnimatorAssets.Ensure();
        AnimatorExperimentTests.Run();
        FeedbackExperimentTests.Run();
        PersistenceExperimentTests.Run();
        LabExperimentTests.Run();
        var evidence = new EngineEvidence { version = Application.unityVersion };
        var session = new LabSession(); session.Add("ground"); var item = session.Add("sphere");
        session.SetBehavior(item.id, "drop");
        session.AttachScript(item.id,"spin");
        var saved = JsonUtility.ToJson(session.ExportEdit());
        var restored = new LabSession(); restored.Import(JsonUtility.FromJson<SceneDocument>(saved));
        evidence.jsonRoundTrip = restored.Current.objects.Count == 2 && restored.Current.objects[1].id == item.id && restored.Current.objects[1].behavior == "drop" && restored.Current.objects[1].scripts.Count==2 && restored.Current.objects[1].scripts.Contains("spin");
        session.Start(); session.Current.objects[1].position.y = -9; session.Stop();
        evidence.editSnapshotRestored = Math.Abs(session.Current.objects[1].position.y - 3) < 0.001f;
        var previousAuto = Physics.autoSimulation;
        GameObject ground = null, ball = null;
        try
        {
            Physics.autoSimulation = false;
            ground = GameObject.CreatePrimitive(PrimitiveType.Cube);
            ground.transform.position = new Vector3(0, -0.1f, 0); ground.transform.localScale = new Vector3(10, 0.2f, 10);
            ball = GameObject.CreatePrimitive(PrimitiveType.Sphere); ball.transform.position = new Vector3(0, 3, 0);
            ball.AddComponent<DropBehavior>().Begin(); Physics.SyncTransforms();
            for (var i = 0; i < 100; i++) Physics.Simulate(0.02f);
            evidence.dropHeight = ball.transform.position.y;
            evidence.gravityCollision = evidence.dropHeight > 0.45f && evidence.dropHeight < 0.55f;
            UnityEngine.Object.DestroyImmediate(ball);
            ball = GameObject.CreatePrimitive(PrimitiveType.Sphere); ball.transform.position = new Vector3(0, 3, 0);
            ball.AddComponent<LaunchBehavior>().Begin(); Physics.SyncTransforms();
            for (var i = 0; i < 20; i++) Physics.Simulate(0.02f);
            evidence.launchX = ball.transform.position.x;
            evidence.launchMotion = evidence.launchX > 0.5f && ball.transform.position.y < 3;
        }
        finally
        {
            if (ball != null) UnityEngine.Object.DestroyImmediate(ball);
            if (ground != null) UnityEngine.Object.DestroyImmediate(ground);
            Physics.autoSimulation = previousAuto;
        }
        Directory.CreateDirectory("Evidence");
        File.WriteAllText("Evidence/engine-tests.json", JsonUtility.ToJson(evidence, true));
        if (!evidence.jsonRoundTrip || !evidence.editSnapshotRestored || !evidence.gravityCollision || !evidence.launchMotion)
            throw new Exception("Engine acceptance test failed; inspect Evidence/engine-tests.json.");
        Debug.Log("COURSE_LAB_ENGINE_TESTS_PASSED " + JsonUtility.ToJson(evidence));
    }

    private static GameObject CreatePrefab(PrimitiveType type,string name,Material material)
    {
        var temporary=GameObject.CreatePrimitive(type);temporary.name=name;
        temporary.GetComponent<Renderer>().sharedMaterial=material;temporary.SetActive(false);
        try { return PrefabUtility.SaveAsPrefabAsset(temporary,"Assets/Prefabs/"+name+".prefab"); }
        finally { UnityEngine.Object.DestroyImmediate(temporary); }
    }
    private static void Require2021()
    {
        if (!Application.unityVersion.StartsWith("2021.3.")) throw new Exception("This experiment must run in Unity 2021.3.");
    }
}


