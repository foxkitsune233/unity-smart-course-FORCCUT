param([switch]$TestOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$editorPath = 'G:\unity hud editor\2021.3.45f2c1\Editor\Unity.exe'
if (!(Test-Path -LiteralPath $editorPath)) { throw "Unity 2021 editor not found: $editorPath" }
$method = if ($TestOnly) { 'LabBuild.SelfTest' } else { 'LabBuild.BuildWeb' }
$logPath = Join-Path $projectRoot 'Evidence\unity-build.log'
New-Item -ItemType Directory -Path (Split-Path -Parent $logPath) -Force | Out-Null
$arguments = '-batchmode -nographics -quit -projectPath "' + $projectRoot + '" -executeMethod ' + $method + ' -logFile "' + $logPath + '"'
if (!$TestOnly) { $arguments += ' -buildTarget WebGL' }
$run = Start-Process -FilePath $editorPath -ArgumentList $arguments -WindowStyle Hidden -Wait -PassThru
Get-Content -LiteralPath $logPath -Tail 35
if ($run.ExitCode -ne 0) { throw "Unity exited with code $($run.ExitCode). Log: $logPath" }
