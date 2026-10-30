' Start the Unity course portal server fully detached from any console.
' Using WScript.Shell with window style 0 avoids Ctrl+C / console-group termination.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "D:\unity\CoursePortal"
sh.Run """C:\Program Files\nodejs\node.exe"" ""D:\unity\CoursePortal\serve.mjs""", 0, False
