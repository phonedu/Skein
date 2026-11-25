---
type: discipline
status: active
summary: fork 住在上游也有的文件里的改动清单（含设置入口两壳、插件 e2e 环境）；上游 tag 合并前后按它核对回归面
updated: 2026-11-25
---

# fork 触点清单（上游合并的回归面）

> **为什么有这份文档**：v1.4.6 合并把上游的 mobile 规则带进来，运行时压掉了
> fork 的设置行/组卡规则，测试只读 CSS 文本没拦住，真机才暴露（裁决 55）。
> 凡是 fork 改动住在**上游也有的文件**里，每次上游 tag 合并都有两类风险：
>
> 1. **冲突**（可见）：upstream:plan 的冲突清单会点名，逐个按本清单解；
> 2. **运行时覆盖**（不可见）：上游新增/改动的选择器在运行时压过 fork 规则，
>    两个文件的文本都没"坏"——只能靠**计算样式契约**拦。
>
> 合并前过本清单，合并后跑第四节的全套守卫。清单一度散在对话记忆里，落档
> 是为了不吃记忆压缩（用户 2026-11-23 要求）。

## 一、不受合并影响的 fork 私有路径

上游不存在这些路径，合并不会带回或覆盖它们（除非上游新增同名文件——
upstream:plan 会显示）：

- `src/phone/`（H0 手机壳：PhoneToday/PhoneHome/PhoneEditorBar 及测试）
- `e2e/ui-contracts.spec.ts`、`e2e/collect-plugin.spec.ts`、`e2e/phone-settings-shell.spec.ts`
- `docs/skein/` 全部
- 插件仓 `C:/Project/skein-plugins`（独立仓，见第三节）

## 二、住在上游文件里的 fork 触点（2026-11-23 现状）

### 图标档位（裁决 58，取代 56/57）

| 上游也有的文件                              | fork 的改动                                                                                                                                  | 守卫                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `src/engine/controls/icons.tsx`             | `ICON_STROKE = 1.35`（上游基线 2/1.15；2026-11-25 由 1.45 收一档）；`iconSize`/`iconMarkup` 只乘 `--icon-scale × --chrome-scale`，无全局倍率 | `ui-contracts` 图标带；全量 vitest |
| `src/engine/tokens/ds-base.css`             | 根 `--icon-scale: 1.4`；手机 `:root[mobile]` `1.35`                                                                                          | `ui-contracts`                     |
| `src/engine/tokens/ds-buttons.css`          | 窗口栏等 svg `scale: 1.125 × chrome-scale`（无 growth）                                                                                      | `ui-contracts` desktop bar         |
| `src/engine/controls/icon-masks.css`        | `.tx-icon` 18 × icon-scale                                                                                                                   | `ui-contracts`                     |
| `src/files/FileTree.css`                    | `--icon-scale: 1.25`（上游 1.2）                                                                                                             | `ui-contracts` desktop tree        |
| `src/features/settings/settings-dialog.css` | 导航图标 `--icon-scale: 1.25`（上游 1.15）                                                                                                   | `ui-contracts` desktop settings    |
| `src/features/settings/settings-phone.css`  | 行图标 `1.55`、chevron `1.2`、返回 `1.1`                                                                                                     | `phone-shell` + `ui-contracts`     |

**上游最可能的覆盖方式**：给 `.tx-icon-button svg`、`.settings-phone-row-ic`、
`.tree-icon` 等选择器新增自己的 width/height/scale。文本 diff 可能很小甚至
没有冲突——只有计算样式测试会红。

### 设置与壳的其他 overlay（既有，v1.4.6 已踩过）

`src/features/settings/*`（行形、组卡单线、代理输入、工坊容器）、
`src/app/App.tsx`、`ActionSheet.css/tsx`、`sidebar-tabs.tsx` 等——这些是
v1.4.6 回归的原发地，守卫是 `phone-shell` 全部断言 + R5 的逐屏走查。

### 设置页的两套实现（2026-11-25 B7r）

上游也有一套设置页，但 fork 的桌面壳把页面移到了 `src/features/settings/pages/*`，手机/旧面板仍在 `src/settings/pages/*`，两边共用 `src/settings/sections/*` 的一部分组件。**上游 1.4.7 的新设置项只加进 `src/settings/pages/*`，而桌面挂载的是 `features/settings` 的页面**——合并不会冲突，页面也能正常渲染，缺的是桌面入口：

| 上游 1.4.7 条目        | 上游落点                              | fork 桌面缺口                          | 修复                                                  |
| ---------------------- | ------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| 复制文件到文件树前询问 | `settings/pages/GeneralPage.tsx`      | 桌面没有开关，勾过「不再询问」无法恢复 | `features/settings/pages/general.tsx`                 |
| 文件图标主题选择器     | `settings/pages/AppearancePage.tsx`   | 桌面外观没有「文件图标」               | `features/settings/pages/appearance.tsx`              |
| 自定义 AI 接口         | `settings/pages/ProvidersPage.tsx`    | 桌面模型页没有添加/编辑/删除           | `settings/sections/providers.tsx`（两壳共用）         |
| 文件图标主题接线       | 上游 `files/TreeNodes` 用主题感知组件 | fork 的树直接画 Lucide，选了主题不生效 | `files/TreeNodes.tsx` 改 `FileIcon`/`FolderEntryIcon` |

**合并时怎么查**：`git diff v<old>..v<new> -- src/settings src/features/settings src/files` 里每一条上游设置项，都在**桌面 Settings 里点一遍入口**；只跑测试不够——页面能正常渲染、e2e 也可能全绿，缺的正是入口。反向也查：fork 的 `features/settings` 页面是否漏掉了上游新增的行。文件图标主题这类“上游在自己组件里接线”的功能，还要查 fork 自己的树/列表/搜索是否也换成了主题感知组件。

## 三、插件（skein.collect，fork 私有仓）

- 插件改动**不触上游源码**。0.5.1（裁决 60/61）只改插件仓的
  `host.js`（notePath → `asset-library/inbox/`；confirmRequest 写/清
  `blocked_reason`）、两个测试、manifest、README。
- 插件的真正合并风险是**插件 API 面**（"接口稳定就一直跟得动；接口破坏
  才是分叉时刻"）。0.5.1 依赖：`commands.register`、`ui.form/pick/notice/
message`、`files.root/find/stat/readText/create/process/writeText/
frontmatter.get/onDid*`、`layout.open/openView`、视图注册
  （sidebarTabs/views contributes）、`aiTools`、`storage.project`、
  `onDidChangeVisibility`、`textus-resource` webview。
- **1.4.7 合并后必做**：插件仓 `node --test *.test.mjs`（93 条）→
  宿主 `e2e/collect-plugin.spec.ts` → 真机装最新插件版走查收集/确认/详情。
- 宿主侧的插件接点：`App.tsx` `captureNote` 优先路由
  `skein.collect.capture`（App.tsx 是上游也有的文件，冲突高发区）。

## 四、上游合并后的固定守卫（= 工程菜谱 R5 步骤 5）

1. `npm run upstream:verify`（默认含 `test:phone-shell` + `test:ui-contracts`；
   发布前 `--full`）——**必须真跑**，不接受"没改这些文件"的推理跳过。
2. **设置入口两壳对照**：上游本次新增/改动的每个设置项，在桌面 Settings 里
   找到入口（第二节「设置页的两套实现」表格是 1.4.7 的实例）；`git diff
v<old>..v<new> -- src/settings src/features/settings` 逐条过，缺的补进
   `features/settings/pages/*` 或共享 section。
3. 全量 vitest；上游改了 Rust/绑定则 `npm run bindings` + cargo test。
4. 插件仓单测 + collect e2e（第三节清单）。官方样例插件的 e2e
   （plugin-touch/plugin-views/phone-plugins）要用 CI 钉住的
   `CatVinci-Studio/textus-plugins@d0207b35756ddcdca63d1dd62a74df5ba5c4b710`
   （1.4.7 版，kanban 0.4.14）：在该 commit 的 worktree 里 `npm ci`（PDF/
   Excalidraw 的 `libs.json` 资源来自 `node_modules`），跑时设
   `TEXTUS_PLUGINS_DIR=<worktree>`。本机 `C:/Project/textus-plugins` 可能停在
   旧版（kanban 0.4.10），红灯先比对版本，别当产品回归改。
5. 桌面 built app + Android 真机逐屏走查，截图进合并记录（裁决 55）。
6. 本清单有变（新 overlay、新档位、新入口）→ 当次合并记录里更新本文件。

## 维护

- 每次裁决改动上游共有文件的样式/行为，把触点补进第二节。
- 清单只列"上游也有的文件"；fork 私有路径进第一节备查即可，不展开。
