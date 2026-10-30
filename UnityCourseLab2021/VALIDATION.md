# 实验验证结果

日期：2026-10-26（北京时间）

结论：核心流程已在真实 Unity 2021 WebGL 程序和本机浏览器中跑通。

## 使用的环境

- 引擎：Unity 2021.3.45f2c1，编辑器路径 `G:\unity hud editor\2021.3.45f2c1\Editor\Unity.exe`。
- 已补齐同版本官方 WebGL Build Support；安装包数字签名验证有效。
- 程序：C# 经 IL2CPP 转为 WebAssembly；渲染和物理由 Unity 执行。
- 浏览器：独立配置的 Microsoft Edge headless，通过 Browser Harness/CDP 执行真实界面操作。
- 地址：<http://127.0.0.1:8088/>，仅监听本机。
- 含资源拖入与脚本组件的最新构建成功，构建报告总大小 15,735,186 字节，耗时约 1 分 21 秒。当前为方便验证的未压缩构建。

## 浏览器验收：9/9 通过

| 检查 | 实际结果 |
|---|---|
| 创建地面和小球 | 两个对象和稳定 ID 正确建立 |
| 修改坐标后直接 Ctrl+S | 未离开输入框也保存新高度 4 |
| 选择预设脚本 | DropBehavior 正确挂载 |
| 重力与碰撞 | 小球中心下降至约 0.499 米，记录 1 次接触事件 |
| 运行中保存 | 保存的是运行前位置 Y=3，而非触地后的 Y≈0.5 |
| 停止恢复 | 对象 ID、行为、位置、朝向和尺寸全部与运行前一致 |
| 硬刷新重开 | 自动恢复地面、小球、DropBehavior 和编辑状态 |
| 非法行为 ID | 拒绝执行，并保留现有场景 |
| 水平抛出 | 小球横向位置达到 X≈0.64，同时高度下降 |

另外，纯状态、拖动投影与组件模型23/23测试通过；Unity编辑器内真实PhysX与JsonUtility检查4/4通过，其中JSON检查包含多个脚本组件列表。

## 场景鼠标移动验收：9/9 通过

本轮依据真实画面的彩色轴柄定位，再发出实际鼠标按下、移动、松开及键盘输入；没有用设置坐标的接口代替被测拖动。

| 检查 | 实际结果 |
|---|---|
| 左键拖动物体 | X/Z改变，Y保持3，抓取偏移保留 |
| 红色X轴柄 | X约增加0.924，Y/Z不变 |
| 绿色Y轴柄 | Y约增加0.663，X/Z不变 |
| 蓝色Z轴柄 | Z约增加1.239，X/Y不变 |
| Esc取消 | 回到本次拖动前的位置 |
| 移动后保存 | 保留精确坐标，不被面板两位小数覆盖 |
| 刷新恢复 | 恢复拖动后的坐标与对象配置 |
| 运行中禁止编辑 | 鼠标拖动不会修改静止实验对象，移动轴柄隐藏 |
| 停止恢复 | 回到运行前已经拖动过的布局，继续可编辑 |

证据：`Evidence/browser-movement-tests.json`、`Evidence/browser-scene-movement.png`。原有9项流程同时回归通过。测试浏览器需处于活动标签页；首次原生画面绘制需等待实际轴柄出现，不能把JavaScript初始化事件当作画面已绘制。

## 预制体与脚本拖入：14/14通过

使用真实鼠标按下、移动、停留和松开，从Project资源卡片触发原生dragstart与drop。预制体是工程内真正的`Assets/Prefabs/Ground.prefab`和`Sphere.prefab`。

| 验收范围 | 结果 |
|---|---|
| 预制体放置 | 从Project把地板和小球拖入场景，鼠标决定XZ落点 |
| 场景挂载 | 脚本拖到小球实体，由Unity相机射线确定接收对象 |
| 面板挂载 | 自转拖入属性面板，与下落组成两个组件 |
| 地板挂载 | 平台移动拖到地板层级条目，自转拖到场景地板，组成两个组件 |
| 约束与移除 | 冲突运动脚本、地板不适用的下落脚本均拒绝且保留原配置；组件可移除 |
| 真正执行与物理稳定性 | 运行超过2秒，平台X位移约1.364、Y轴旋转约90度；小球仍接触平台，球心Y约0.5，接触事件1次 |
| 状态与存档 | 运行中禁用资源拖入；停止恢复对象与组件；保存刷新恢复完整脚本列表 |

组件状态沿用v1存档兼容字段，旧的仅behavior存档自动转换为脚本列表，不要求清除原存档。一个对象允许一个运动脚本加自转。

强化物理检查曾复现Transform直接旋转与运动学MovePosition互相干扰，导致小球被异常甩出。修复为FixedUpdate中对已有刚体使用MoveRotation；保留修复前数据`Evidence/spin-composition-before-fix.json`。最终加强后的14项资源验收及原有18项流程均通过。

证据：`Evidence/browser-asset-tests.json`、`Evidence/browser-asset-drag.png`。

## 发现并修复的问题

首次浏览器测试发现小球穿过地面。控制台报告 BoxCollider、SphereCollider 类不存在，构建裁剪报告也未保留这两个类型。已改为随场景序列化的静态对象模板，确保网格和碰撞组件一并打包；重新构建后真实浏览器碰撞测试通过。

独立代码审查发现坐标输入未失焦时 Ctrl+S 会保存旧值，修复前已复现“输入显示 4、存档仍为 3”。现在保存前会验证并提交位置，再保存。网页输入框也已释放 Unity 的默认键盘独占。

首次失败证据保留在 `Evidence/browser-tests-before-collider-fix.json`，最终成功证据在 `Evidence/browser-tests.json`。

## 证据文件

- `Evidence/browser-tests.json`：9 项真实浏览器验收数据。
- `Evidence/browser-experiment.png`：刷新恢复后的实际程序截图。
- `Evidence/browser-movement-tests.json`、`Evidence/browser-scene-movement.png`：新增移动功能的真实鼠标验收及截图。
- `Evidence/browser-asset-tests.json`、`Evidence/browser-asset-drag.png`：资源与脚本原生拖放、地板组合脚本及保存恢复证据。
- `Evidence/engine-tests.json`：Unity 2021 内部真实物理及 JSON 检查数据。
- `Evidence/model-tests.txt`：纯 C# 状态测试输出。
- `Evidence/build-result.txt`、`Evidence/unity-build.log`：构建结果及完整日志。

## 验证边界

本次证明单个实验可行。尚未测试学生大规模并发、不同学校电脑、移动浏览器或公网部署。没有账户和云端存档；存档只属于当前浏览器及站点地址。未提供学生代码编辑，未实现完整桌面 Unity 编辑器，也未接入第三方商业编辑器插件。
