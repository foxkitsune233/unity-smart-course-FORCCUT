# Unity 2021 教学实验原型

本工程验证一个完整流程：创建地面和小球 → 选择预设行为 → 运行真实 Unity 物理 → 停止恢复编辑状态 → 保存 → 刷新重新打开。

## 运行

已构建网页位于 `Build/Web`。不要直接双击 HTML；请通过 HTTP 打开。

在终端执行：

```powershell
node D:\unity\UnityCourseLab2021\Tools\serve.mjs
```

然后访问 <http://127.0.0.1:8088/>。服务器仅监听当前电脑。

## 实验操作

1. 从中间“项目资源 / Project”面板，把“地板”和“小球”预制体拖入场景。鼠标决定 X/Z 落点，地板初始Y=-0.1、小球初始Y=3；也可拖到左侧层级区域按默认位置创建。原来的“＋”按钮保留为快捷入口。
2. 左键拖动物体可沿其当前高度的 XZ 平面移动；选中后，红 X、绿 Y、蓝 Z 箭头分别控制单轴平移。拖动过程中按 Esc 取消本次移动，也可在右侧输入精确位置。
3. 从项目资源把“重力下落”脚本拖到小球上；也可拖到左侧小球条目，或选中小球后拖入右侧“脚本组件”面板。“运动脚本快捷选择”保留为另一入口。
4. 点击“运行”，观察高度和接触事件。默认球与地面配置下，小球中心在地面上方约 0.5 米处停止下落。运行中关闭位置输入和鼠标移动。
5. 点击“停止”，小球回到运行前的位置；也可修改位置后再次运行。
6. 点击“保存实验”或按 Ctrl+S，再刷新页面。拖动后的精确位置、对象、行为、朝向和尺寸会从当前浏览器存档恢复。

“水平抛出”使用固定初速度 `(2, 0, 0)`。所有行为都预先编译，学生没有源码编辑入口。右侧代码片段供阅读。

地板可挂载“平台往复移动”，并可组合“自转”；小球可组合“重力下落 / 水平抛出”中的一个与“自转”。每个对象最多一个运动脚本，重复或冲突挂载会保留原配置并提示。点击组件右侧“×”可移除。运行中不能拖入资源或修改组件。

地板和小球来自真正的 `Assets/Prefabs/Ground.prefab` 与 `Sphere.prefab` 资源。当前内置资源拖入不等于支持从电脑任意导入模型或C#文件。

右键拖动旋转视角，滚轮缩放。可以在场景或左侧列表中选择对象。

## 重新构建

编辑器固定为 `G:\unity hud editor\2021.3.45f2c1\Editor\Unity.exe`，已补齐同版本 WebGL Build Support。脚本会拒绝 Unity 6.x。

```powershell
& D:\unity\UnityCourseLab2021\Tools\build.ps1
```

只运行真实引擎物理和 JSON 验收：

```powershell
& D:\unity\UnityCourseLab2021\Tools\build.ps1 -TestOnly
```

纯 C# 状态测试使用单独的 .NET 控制台宿主，与 Unity 的运行时版本无关，不需要联网安装 NuGet 包：

```powershell
$env:DOTNET_CLI_HOME = 'D:\unity\.dotnet-cli'
dotnet run --project D:\unity\UnityCourseLab2021\Tests\SceneModelTests.csproj -p:NuGetAudit=false
```

## 文件说明

- `Assets/Scripts/SceneDocument.cs`：文档验证、行为白名单、运行前快照、停止恢复。
- `Assets/Scripts/LabRuntime.cs`：实际 Unity 场景、对象选择、编辑与运行切换。
- `Assets/Scripts/SceneMoveTool.cs`、`MoveProjection.cs`：实际鼠标拖动、XYZ 轴柄及射线投影约束。
- `Assets/Scripts/DropBehavior.cs`、`LaunchBehavior.cs`：两个固定运动脚本。
- `Assets/Scripts/PlatformMoveBehavior.cs`、`SpinBehavior.cs`：地板往复移动与可组合自转。
- `Assets/Editor/LabBuild.cs`：引擎自测、保留碰撞组件的对象模板、WebGL 构建。
- `Web/`：中文教学操作界面。
- `Web/asset-drag.js`：原生资源拖放、组件列表及移除。
- `Assets/Plugins/WebGL/LabBridge.jslib`：网页状态通信与浏览器保存。
- `Evidence/`：构建记录、实际引擎数据、浏览器验收结果和截图。
- `Course/课程规划.md`：按教材映射的可调整模块草案，总学时待教师确认。
- `Course/实训任务单-01-场景搭建与小球运动.md`：首个实操实验的步骤、观察、提交证据和评分建议。

## 本次范围

这是单个实验的技术验证，尚未接入账户、云端存档、教师端或课程目录。存档仅保存在同一浏览器和站点地址的 localStorage 中；运行中保存的是运行前编辑状态。换域名或浏览器不会自动携带存档。实验保存格式不是桌面 Unity 的 `.unity` 工程。

视频由用户在另一个系统负责，本工程没有新增视频获取、播放器或视频接口。
