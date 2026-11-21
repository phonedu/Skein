# 宿主壳待改清单（D1a 手机入口 → D3）

> 状态：**待办，随 D3 / 宿主壳改造一起做**（2026-11-21 记录）。
> 来源：D1a 资产列表（`skein.collect` 0.2.0）桌面片已完成；手机入口在现有宿主壳里不可达。
> 规则：宿主只做“功能挡路才改”的小改；不新增第三套 IA，能复用 `Sidebar` / `PluginListPane` / `PhoneHome` 的复用。

## 1. D1a 资产列表的手机入口

现状（2026-11-21 实测）：

- 插件 `skein.collect` 0.2.0 已注册 `contributes.sidebarTabs`，id `skein.collect.assets`，type `list`。
- 桌面 built app 正常：按资产 / 任务 / 判断 / 待整理分组，显示状态、日期、语义 id，点击开卡，文件变化刷新；插件单测 9/9、CLI 通过。
- Android 模拟器与华为真机都能安装、启用插件（`plugins_state` 为 enabled + granted），但**手机首页和编辑器侧栏都没有出现“资产”页签**；手机首页本身是文件树，编辑器侧栏只有内置页签。
- 插件平台必须写 `desktop` / `ios`；Android 走 `ios` 运行时。**不要写 `android`**（manifest 会判 broken，页签完全不注册）。

需要一起改的清单：

- [ ] **手机侧栏出现插件页签**：在手机壳里把 `sidebarTabs` 的插件页签（至少 `skein.collect.assets`）列出来；复用 `PluginListPane`，不新写列表。
- [ ] **入口位置**：在手机首页头（Documents 行）或编辑器推入侧栏的页签行放“资产”；位置与 D3 的手机 IA 一次定，避免做两遍。
- [ ] **列表渲染**：手机宽度下分组、状态徽标、日期、id 不溢出；筛选框和空态（“资产库还没有卡”）可用。
- [ ] **点击与返回**：点卡片打开文档；Back 回到资产列表/侧栏，不直接退出到首页。
- [ ] **刷新**：文件创建/修改/重命名/删除、根文件夹切换后列表刷新；插件被停用/卸载时页签消失或显示不可用。
- [ ] **插件安装/启用**：从手机 Settings › Extensions 安装并启用 `skein.collect`；确认 Android 插件根（`plugins/` 的 app data 位置）与状态文件一致；不依赖 adb 手工拷贝。
- [ ] **平台字段**：保持 `platforms: ["desktop","ios"]`；补一条回归测试/检查，防止再把 `android` 写进去。
- [ ] **真机验收**：华为 PKT0220512001548 + 模拟器各一次；用 `asset-library/{assets,tasks,judgments,inbox}` 夹具，确认 4 张卡与桌面一致。

## 2. D3 手机入口（原本的多端完善）

在宿主壳改造时一并处理，不要拆成多次壳改动：

- [ ] 手机首页的“收集”入口（`skein.collect.capture` 的手机可达面）。
- [ ] 手机上的资产卡详情 / 确认流（D1b 的 sheet 在手机壳里的落点）。
- [ ] 手机上的同步状态面与冲突提示（S2/S3 已有，确认与新壳不冲突）。
- [ ] D1a 资产列表与 D1b 确认流共用一个手机入口，不新增第二个列表。
- [ ] PH3 / PH4 的手机一致性项在同一个壳 pass 里核查（若届时仍未做）。

## 3. 不该在这份清单里做的

- 不重画桌面 IA；D1a 桌面片已按现有侧栏完成。
- 不把 `android` 加进插件平台枚举；Android 继续走 `ios` 运行时。
- 不为资产列表单独做一套手机页面组件；优先复用 `PluginListPane`。
- 不在宿主壳里写资产业务逻辑；列表数据仍由插件 `files.find` + `frontmatter.get` 提供。

## 4. 证据

- 插件：`C:\Project\textus-plugins\plugins\skein.collect`（本地工作区，0.2.0；该仓只有上游远端，未推上游）。
- 桌面：built app + D1a 临时库，4 张卡分组、打开、刷新通过。
- Android：模拟器安装插件、`plugins_state` enabled，但首页/编辑器侧栏无资产页签；这是本清单第 1 项的直接证据。
- 相关文档：[D1a 归档](../archive/2026-11-21-d1a-assets-list.md)、[任务清单](../05-状态/Textus-改造任务清单.md)。
