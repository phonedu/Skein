# D1a 资产列表归档（桌面片，2026-11-21）

> **状态：桌面片完成；手机入口转 [D3 宿主壳待改清单](../02-方案/Textus-宿主壳待改清单.md)。**
> 插件：`skein.collect` 0.2.0（本地 `textus-plugins/plugins/skein.collect`，未推上游）。
> 设计依据：[改造方案 §8 阶段 1](../02-方案/Textus-改造方案.md)、[插件 API 要点](../03-调研/插件API要点.md)。

## 1. 完成内容

- `contributes.sidebarTabs`：`skein.collect.assets`，`type: "list"`。
- `views.registerList`：读 `asset-library/**/*.md`（跳过 `_history/`），按资产 / 任务 / 判断 / 待整理分组。
- 行：标题、状态徽标、更新日期、语义 id、类型图标、位置；点击打开卡片。
- 筛选框、空态“资产库还没有卡”，`asset-library` 不存在时自然空。
- 文件创建/修改/重命名/删除与根切换后刷新。
- 平台：`desktop` + `ios`（Android 走 iOS 运行时）；**不写 `android`**，否则 manifest 判 broken。
- 插件单测 9/9；CLI check 通过。

## 2. 证据

- 桌面 built app（portable debug，隔离 D1a 临时库）：
  - 4 张卡：资产 A-1、任务 T-1、判断 J-1、待整理 N-1；
  - 分组顺序、状态、日期、id 正确；
  - 点击“报价前检查清单”打开 `A-1.md`；
  - 文件变化后列表刷新。
- Android 模拟器：插件可安装/启用（`plugins_state` enabled + granted），但手机首页/编辑器侧栏没有资产页签；这是宿主壳入口缺口，不是插件列表逻辑错误。

## 3. 手机入口

不在 D1a 继续做；全部待改项、证据、验收见 [宿主壳待改清单](../02-方案/Textus-宿主壳待改清单.md)。要点：

- 手机侧栏列出插件页签并复用 `PluginListPane`；
- 入口位置与 D3 手机 IA 一次定；
- Back、空态、筛选、刷新、插件停用/卸载、Android 插件安装路径；
- 保持 `platforms: ["desktop","ios"]`。
