# H0 宿主壳一次改 — 归档

> 2026-11-21。批准图 = opencode `opencode-h0-2026-11-21`（用户判「这版很不错」），
> 加三轮追加约束（不要悬浮 FAB、不要卡片侧边条、“记一句”不能藏起来、手机设置排布写回桌面、
> 平板设置必须全屏）。施工口径与逐条裁决见
> [《宿主壳待改清单》§0](../02-方案/Textus-宿主壳待改清单.md)与
> [《界面改造方案》§4.10](../02-方案/Textus-界面改造方案.md)。

## 1. 交付

### 壳与导航

- **活动轨删除**：`ActivityRail`、`rail-drag`、`RailUpdate`、`activity-rail.css` 及其测试删除；
  `WindowBar` 不再请求 rail；桌面的第一列就是视图列。
- **左视图列**：`Sidebar` 头部 = 仓库 chip + `今天 / 文件`分段控件 + 记一句的小圆 `+`；
  文件下再分 `文件 / 大纲 / 搜索`；底部 `设置`。文件树在视图列里不再重复仓库名
  （隐藏 `tree-toolbar` 与“库 · 名字”行，最近保留“最近”标题）。
- **右 340 页边栏**：新 `RightPanel`（懒加载）。两页签 = Agent（`WindowConversation`，
  窗口在前的会话）/ 插件（`PluginListPane` 或插件视图）。桌面与平板 ≥840 显示；
  关闭即归还宽度。顶栏 Agent 按钮改为开/关这一栏（宽布局不再创建 AI 页签）。
- **插件入口**：顶栏“插件”按钮 → QuickPick（插件页面 + 命令，`pluginLauncherPlaceholder`）；
  list 视进右页边、webview/流程页进整页页签；手机/折叠全部整页。扩展页在所有形态可用，
  是桌面/平板的插件管理入口（“加载插件文件夹…”与安装）。
- **布局模型**：`layout-mode.ts`（desktop / phone <600 / compact 600–839 / tablet ≥840），
  `useLayoutMode` 订阅；`phone-layout.ts` 保留薄包装。`app-shell.css` 桌面与移动 ≥600
  都是两列网格 + 按需第三列；<600 单列。

### 今天 / 记一句

- **桌面今天**：`TodayPanel` = 当前交付（只算文档，插件页不算）+ 插件状态项（待确认）+
  今天改动（`useTodayChanges`，按 mtime 递归、跳过 `_history/_usage` 等）。无最近/全部笔记。
- **手机今天**：`PhoneToday` = 顶部仓库 chip、⋯、⚙；页面内**吸顶**“记一句…”；
  当前交付、待确认、今天改动。**没有 FAB、没有底部动作条、没有卡片侧边条。**
- **手机库页**：`PhoneHome` 由今天页进入（⋯ → 文件）；顶部 + / ⚙，返回今天；
  **FAB 删除**，新建笔记回到顶部 +（长按仍问“笔记 / 文件夹”）。
- **多端同一动作**：桌面/平板记一句 = 视图列小圆 +；手机 = 吸顶条；都走
  `skein.collect.capture`，没有插件时落空笔记。

### 设置（多端一致）

- 桌面：880×556 弹窗，左列改为手机的**分组列表**（`SettingsPhoneList`，带选中态、
  `settings-dialog-nav-scroll`），右列内容不变。
- 手机 / 折叠 / 平板：`SettingsHost` 的 `mobile` 分支 = 全屏 `SettingsPhone`
  （列表 → 推子页）；iPad 走 `SettingsPanel`（`phone = isMobileApp`）同样全屏。
  平板上不再是弹窗。

### 插件

- `skein.collect` **0.3.1** 增 `ui.statusItem("pending")`：有待确认时“N 条待确认”，点击开确认中心；
  0 时撤掉。宿主今天页与状态条只显示。启动时的刷新走 `files.onDidChangeRoot`（宿主在窗口
  发布 access 后补发一次根）、`app` 状态与活动文档三路兜底。
- `listenFor("root")` 在订阅时回放当前文件夹：插件在窗口恢复文件夹后才激活，
  否则要等一次永远不会来的变更，启动时状态项就空着。
- 清单平台仍为 `desktop`/`ios`（Android 走 `ios` 运行时），未写 `android`。

## 2. 测试与检查

| 项                       | 结果                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`      | 通过                                                                                                             |
| `npm test`（全量）       | 589 文件 / 5109 用例：4907 过、202 skip；一次满载并行出现 1 个超时，单跑通过（机器噪声）                        |
| 仓库检查                 | eslint / knip / code-shape / cycles / duplicates / sizes / design-values / hover / layout-reads / text-sizes / field-shapes / readmes / links / skein-docs 全通过 |
| 插件 `node --test`       | 49/49                                                                                                            |
| `check:quick`            | typecheck + eslint 通过；prettier 步在 696 改动的 Windows 命令行长度上限处中断（非代码问题）                     |
| 桌面 dev built app       | 隔离库 `C:\Project\d1b-verify-vault`：左今天/文件、待确认 1 条、右 340 资产列表、Agent、插件 QuickPick、设置弹窗、扩展页 |
| Android 华为 PKT0220512001548 | APK 安装、MANAGE_EXTERNAL_STORAGE、Documents 测试库；今天页（吸顶记一句、真 +）、⋯ sheet、资产列表整页、返回、设置全屏、库页 + / ⚙（无 FAB）；打开资产列表后待确认项出现 |
| Android 平板（Pixel Tablet AVD，1280×800dp） | x86_64 APK：≥840 两列（视图列 + 文档）、顶栏 Plugins/✦、右 340 Agent 页边开合、设置全屏；见下方偏差 |

### 2026-11-22 设置弹窗视觉回写（opencode 评审后）

用户判“桌面整体不如手机端，尤其设置页”。opencode（claude-sonnet-5）看了当前桌面壳 / 设置 /
手机设置 / 平板截图与代码后，结论是**设置弹窗左右两列用了两套视觉语言**：左列是手机的卡片
列表，右列是裸行 + 发丝线；200px 左列还把“隐私与数据”截成“隐私与…”。

按用户选定的“方案 + 加高”落地：

- 弹窗 **880×620**（原 556）；左列 **232px**，内边距 12/16，行高 48，图标 28，
  分区标题与滚动列表底部渐隐（不再把“编辑”裁一半）。
- 左列搜索框 `--control-height`（34）并保留圆角矩形（design-language 6）。
- 右列每组套 **`--ui-surface` + 1px `--ui-border`** 卡片（2026-11-22 二次审查后改为与手机
  同款；初版曾用 `--ui-subtle`），内容 `max-width: 560px`，组间距 24，分区标题
  `.tx-section-label`（footnote / 600 / 0.08em），和手机同一套层级。
- `settings-dialog.test.tsx` 的尺寸契约随设计改为 880×620。
- 评审稿与对照图：`C:\Project\skein-plan-scratch\h0-review-2026-11-22\`（proposal.html / 截图）。

### 2026-11-22 全面 UI 审查（opencode opus 5.5）与 P0 收敛

opencode 对全壳 / 设置 / 手机 / 平板 / 动效做了只读审查（报告：
`C:\Project\skein-plan-scratch\ui-audit-2026-11-22\REPORT.md`，17 类一致性问题）。
用户选择 **P0 全做 + 按钮按裁决 shape-s + 设置卡片 surface**，已落：

- 右页边头部 84px → 40（`--header-height - --window-bar-height`），和工具栏同线。
- 右 340 进出动效：`Presence` + nudge 320/200；列宽立即生效，退场期间 `mounted` 保留
  宽度，结束后才归还；关闭标记跟 `presence.state`。
- 桌面设置：打开焦点落到搜索（不再给 × 焦点环）；弹窗 320 进 / 200 出（layer 在退场
  期间保持挂载，Base UI 保持 open），dim 同步淡出。
- 按钮：`.tx-button` / `.tx-icon-button` / 窗栏按钮 / 设置关闭 / 手机设置与文档图标
  全部 `--shape-s`；胶囊只留 chips / 值控件 / 分段控件。
- 设置值控件统一 `--control-height-sm` + `--text-footnote`；快捷键 keycap 最小宽 96。
- 搜索：桌面 `.tx-search` 34 / surface；设置搜索同一高度与字号；手机库页搜索去掉阴影/高光。
- 分区标题统一 `.tx-section-label`（Today / 手机 Today / 设置导航与内容 / ActionSheet /
  列表 heading），不再有 5 套写法。
- 手机顶栏统一：`--phone-bar-row` 56、整条发丝线、48 按钮、共用 `BackChevronIcon`；
  仓库 switcher 一套配方（**无边框、无底色**，只有 28 底块 + body/600；2026-11-22
  用户复看后把此前误加的边框 + surface 去掉）；今天页行补按下态。
- 手机设置推入 / 返回：列表常驻其下，页用 `motion-edge-in-end` / `motion-edge-out-end`
  320 spring，返回后列表原地出现；`translateX(28px)` 裸值删除。
- 平板：视图列、树行、今天行、右页边按钮提到 44 触控目标。**注意平板 chrome 是 `app`
  （`data-window-chrome="mobile"` 只是手机单栏）**，所以触控规则按 `data-platform="ios"/"android"`
  作用；`--phone-bar-row` 也定义在平台级，平板的全屏设置才能拿到 56。
- 壳层侧边竖条清除：设置错误/成功条、通知、Create 示例改为整圈发丝线 + 色调底 + 圆角。

装机复验（2026-11-22）：华为 PKT0220512001548 上顶栏 56、仓库 chip 44 + 28 底块、返回
共用 chevron、库页搜索无阴影、设置全屏推入（CDP 逐帧：从 360px 滑入）与返回（滑出）；
Pixel Tablet AVD 上右栏头部与工具栏同线，视图 tab / 快速添加 / 右栏按钮实测 44（DEV 前后
从 26/28 提到 44）。

全量 vitest 4907 过；typecheck、eslint、knip、code-shape、design-values、hover、sizes、
text-sizes、cycles、duplicates 全过。桌面 dev 复验右栏对齐 / 设置焦点与卡片；手机与平板
另行装机复验。

### 2026-11-22 P1/P2 全量收敛

用户要求把审查里的 P1（20 条）与 P2（14 条）全部做完再截图验收，口径落在
[《界面改造方案》§4.11](../02-方案/Textus-界面改造方案.md)。已落：

- 今天（桌面/手机）：去重复标题；行标题取 frontmatter `title` → 第一个 H1 → 文件名，
  id 变 caption；手机行 62 写 / 56 绘、补 `PhoneSyncStatus` 与空态；桌面补空态与 id。
- 视图列：今天/文件改 `Segmented equal`（同一滑块）；列脚并成一行；子页签“文件”改
  “文件树”（10 语言新 key `treeFileTree`）；文件行 ⋯ 与 `.tree-tool` 补基础按钮样式，
  平板不再露出原生按钮；触控端 ⋯ 为 44。
- 设置：桌面页标题 + 卡片 surface + 左缩发丝线（fold 内同样）；导航/内容/右页边统一
  6px 悬停滚动条；Select pop-in；页切换 `motion-settle-in` 120（内容 keyed，退场不跳）。
- 右页边：列表日期/状态层级；扩展页组头工具统一（icon / `tx-button small`），主题卡
  作者 + 安装数一行；Agent 登录态去卡片与阴影；触控端头部放不下标题时隐藏标题；
  文档 < 480 时右页边覆盖显示（`data-right-panel-overlay`）。
- 动效与状态：行 hover 80 进/即时出；开关 thumb spring；toast 退场 `motion-sink-out`
  （被挤掉的即时消失）；reduced motion 收敛到 150ms、滑块不滑动；`mask-image` 加前缀。
- 手机遗留：sheet 遮罩回 `--ui-overlay`；库页底部 24；More sheet 删重复“设置”；
  首页内联 SVG 换共享 icons；ActionSheet 图标 32 / 退场 `--dur-sheet-exit`；吸顶
  “记一句”只在吸住后显示阴影（`@supports (animation-timeline: scroll())`，不支持时保留
  静态阴影）；字重 650 在壳层清掉（文档排版主题保留原值）。
- AI 侧边竖条：引文/线程线按 §4.11 列为内容例外；thought 去竖条，outline thesis 改
  `--ui-subtle` 面。

复验：桌面 dev（1600 CSS 视口，CDP）逐页截图；华为 PKT0220512001548（今天/库/文档/
设置列表与子页/More sheet/AI）；Pixel Tablet AVD 1280×800dp（今天两栏、今天+右栏、
文件列表、设置）。截图在 `C:\Project\skein-plan-scratch\ui-shots-2026-11-22\`。
typecheck、全量 vitest、eslint、prettier、各 repo 检查全过（见任务清单 v6.18）。

**同日用户复看后的手机回归修复（v6.19）**：仓库切换 chip 在桌面且今天/库三处统一为无边框、
无底色的 switcher（28 图标块 + 名称 + chevron，`:focus-visible` 也不画环）；手机设置推入子页
的 `.settings-phone-page` 绝对定位层补 `inset-top: var(--safe-top)`——它从父级 padding box
起算，不吃 `.settings-phone` 的 safe-top，之前因此把“通用/外观”顶进了状态栏；真机实测
page.top = bar.top = 45px。扩展组头控件间距 4→8；补安全区契约测试。全量 vitest 4909 过。

## 3. 偏差与留白
- 桌面左栏文件树仍带 FileTree 自己的根行（与仓库 chip 同名）；toolbar 与“库 · 名字”
  已按手机样式隐藏，根行留作展开/收起。后续若嫌重复，可给 FileTree 一个“bare”模式。
- 右 340 在窄桌面窗口（三列同时开）不再挤窄文档：文档 < 480 时自动改为覆盖层
  （2026-11-22 补，见 §4.11）。
- AI 页签在宽布局不再创建；旧会话里残留的 AI 页签仍会显示，暂不自动迁移。
- 插件状态项在启动时依赖新的 root 回放；旧版宿主不会回放。**已知缺口**：冷启动时若队列里
  已有待确认，今天页要等插件第一次刷新（打开插件页、文件变化、回到应用）才出现该行；
  插件已加 1.5/3.5/8 秒与 app/活动文档三路兜底，但 Android 冷启动仍可能晚于这些时机。
  下一步可在宿主侧加“UI 就绪后请插件重报状态”，或把状态项落盘。
- 桌面的 `node --test` / CLI 检查在 textus-plugins 仓没有独立 CLI，改由 app 加载与 49 单测覆盖。
