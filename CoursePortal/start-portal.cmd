@echo off
rem Start Unity course portal server. ASCII only to avoid codepage issues in Task Scheduler.
cd /d "D:\unity\CoursePortal"
"C:\Program Files\nodejs\node.exe" "D:\unity\CoursePortal\serve.mjs" >> "D:\unity\CoursePortal\serve.log" 2>&1
