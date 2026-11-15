# 设置页 × Base UI — 设计文档

日期：2026-11-15 · 分支：`base-ui-settings`（基于 `ui-alignment`）
状态：待批准（builder check 后呈交）

## 意图与为什么

设置页是第一个引入 Base UI（`@base-ui/react@1.9.0`，MIT，Radix 原班人马的续作）的界面。
选设置页的理由：它是交互最重的一块面（浮层 + 焦点管理 + 下拉选择 + 开关），
headless 库的收益（无障碍、键盘、浮层定位）在这里最值，而且它自成一个模块，
动不到编辑器和 engine/controls 的任何既有组件。

库选 Base UI 而非 Radix 的裁决已记入台账：Radix 维护停摆、作者转做 Base UI；
两者 API 同源，约束照用户的六条走。

## 画板说什么（.ryugi/artifacts/artboard/textus-breakpoints/pages/screens/ui-d-settings.html）

- 设置是**浮在当前界面上的面板**：1440×900 上叠 **880×556** 的弹窗，圆角 18，
  背景**不卸载不重载**——关掉立刻回到文档，编辑内容不丢。
- 唤起三处统一：⌘, · 轨道末端齿轮 · 「更多」菜单 → 同一个面板。
- 左侧分类导航 **200**（画板 .setnav 224 含 10px 内边距），右侧内容行：
  `.srow` = 左标签 + 小字描述（12px muted），右侧一个**值控件**（pill）。
  行间 1px 发丝线（border-bottom），行内 padding 13px 0。
- 选中态：导航行 = surface 底 + 1px hair 环 + 500 字重；pill 选中 = `--sel` 底 +
  accent 字色、去边。
- 两档灰阶文字（muted / faint），无第三档。

## 目标

1. `src/features/settings/` 新模块：外壳（Dialog 浮层 + 左导航 + 行列表）+
   控件皮肤（Select / Switch / Checkbox），皮肤照 Apple 不透明面板。
2. 唤起三处指向新面板；关闭回原处；背景不卸载。
3. 构建后 entry chunk 不超过 900KB 预算门（`vite.startup-budget.ts`）——
   模块经 `src/lazy/lazy-module.ts` 懒加载，设置本就只在 ⌘,/点击后出现。

## 非目标

- 不替换 `engine/controls` 的任何组件；其余 surface 继续用旧控件。
- 不做新 IA 的页面重组：画板的 7 项导航（库与同步/模型与 Agent/技能…）
  属于「新 IA 内容」阶段——**本次沿用现有页面清单**（我的裁决）。
- 手机端不动（手机的设置 = Phone sheet，后续 pass）。
- 不动文档排版、主题系统、复制文案（除新行的描述文字按画板写法补写）。

## 反目标

- 不引入 blur/半透明材质（Apple 不透明面板是硬约束）。
- 不深浅两套各写一份皮肤——只用语义 token，深色由 token 翻译。
- 不做统一包全量 import：只按组件单件引，`package.json` 精确锁 `1.9.0`（无 `^`）。

## 约束（用户已定，不可谈判）

- Base UI 只进 `src/features/settings/`；别处要引必须回到本文档增补。
- 懒加载经 `lazyModule`；构建记录 entry 大小前后对比，过 900KB 门。
- 版本锁 `1.9.0`；许可证 MIT 已核实（npm registry，2026-11-15）。
- 皮肤：不透明面板、1px 分隔、10–12px 弹性圆角（行/pill 圆角映射最近的
  `--shape-*` token，禁止发明裸值）、`--font-sans`（SF 栈）字色两档灰。

## Base UI 组件映射（本次引四件）

| 画板元素                                 | Base UI 组件 | 皮肤                                                                |
| ---------------------------------------- | ------------ | ------------------------------------------------------------------- |
| 浮层本体（含焦点困住、Escape、背景 dim） | `Dialog`     | surface 底、圆角 18→最近 shape token、0 34px 80px 阴影→`--shadow-*` |
| srow 右侧的值选择                        | `Select`     | pill：paper 底 1px line 边，选中 sel 底 accent 字                   |
| 开关行                                   | `Switch`     | iOS 式不透明开关（accent 填充）                                     |
| 多选行                                   | `Checkbox`   | 画板 .tick 方盒 16px 圆角 5                                         |

需要更多组件（Menu、ScrollArea…）时先回本文档增补，再动 package.json。

## 标准修订（随本功能入 design-language.md）

§5.5 说弹出层一律 Textus 自绘。本功能在 `src/features/*` 范围内开一个
受控例外：Base UI 提供行为（焦点/键盘/定位），皮肤完全用本文档的 token
规范画。随 PR 在 §5.5 增补一句，注明例外范围与理由。

## 留给 builder 的

- `--shape-*`/`--shadow-*` 到画板值的映射（就近取，不发明）。
- 行高与间距全部落 `--space-*`/`--control-height` 体系；画板的 13px 行内距
  落到 12（4px 栅格就近）。
- 测试切片（TDD，每片先红后绿）：依赖+骨架 → 外壳 Dialog → 导航 →
  Select 皮肤 → Switch/Checkbox → 唤起接线 → 预算门核对 + e2e
  `settings-pages.spec.ts` + 键盘走查（Tab 顺序、Escape、输入法合成时
  Escape 归输入法）+ 亮暗两态截图。
- 分批换页：第一批 = 外壳 + 通用 + 外观两页用新行渲染；其余页暂在
  新外壳内沿用旧渲染，随后 PR 逐页迁移。

## 本文档用到的产物

- 画板 `ui-d-settings.html`（路径见上）：浮层 880×556、左导航 200、
  srow 行式、pill 选中态、唤起三处、背景不卸载——全部已写进正文。
- 台账 `.ryugi/sdd/textus-redesign.zh.md/progress.md`：Base UI 裁决行。
- `npm view @base-ui/react`：1.9.0 / MIT（2026-11-15 核实）。

## 请批准人重点看的（我的裁决）

1. 本次沿用现有页面清单，不切画板的 7 项新 IA 导航。
2. 保留设置搜索（画板没画，但它是既有功能，删除属倒退）。
3. 第一批只重画「通用」「外观」两页，其余页过渡期旧渲染。
4. §5.5 的受控例外（Base UI 提供行为、皮肤完全自绘）。

## 裁决补记（builder check 后，2026-11-15；批准人已授权裁决权）

Builder check 提出 7 问，分拣如下——**1–5 为已定或我顺手定，6–7 也是我的裁决**，全部亮出可推翻：

1. **替换而非共存（桌面）**：浮层 Dialog 本次**取代**「侧栏设置列表 + 设置页签」机制。
   `settings-nav.ts` 的页面登记数据保留；`SettingsTab`/`SettingsNavPanel` 的 UI 退役；
   深链（`OPEN_SETTINGS_PAGE_EVENT`，来自插件页/搜索）改为打开浮层并定位到该页。
   代价：`settings-nav.test.ts` 与 `settings-pages.spec.ts` 随之改写——接受。
2. **唤起第三处** = 现有原生应用菜单的设置项（Windows/Linux）；「更多」菜单属新 IA，
   本次不新建菜单 UI，三处 = ⌘, · 齿轮 · 原生菜单项。
3. **iPad 本次不切**：新浮层按桌面门控（capabilities 门），iPad 沿用现有
   SettingsPanel，双壳暂时并存，平板 pass 再收敛（iOS 规矩：门控平台做不到的，
   不藏功能）。
4. **搜索落位**：搜索框放导航列顶部（§5.4 的 capsule 形制）；⌘F 绑定不变，
   设置开着时即聚焦浮层的搜索框；搜索结果在浮层内跳行（沿用 `setJump`/reveal）。
5. **插件页**：插件注册的设置页与内建页一样在浮层内容列渲染（它们就是组件）；
   插件列表打开的插件专属设置页同样进浮层（不再开页签，见 1）。
   §15.3–15.4 的插件契约（自带样式表、按比例缩放）在内容列照旧成立。
6. **导航呈现**：保留现有分组/折叠（插件的 `group` 语义不变），画成
   画板式的分组标题 + 折叠列表；13 页塞进 556 高靠折叠，画板的平铺 7 项随 IA pass 来。
7. **Escape/IME 兜底**：引擎规矩为上——先包一层补齐（合成中的 Escape 归输入法、
   关最内层）；若 Base UI Dialog 有硬冲突，关闭语义退回引擎自管、Base UI 只留
   焦点困住，§5.5 修订按此措辞。
