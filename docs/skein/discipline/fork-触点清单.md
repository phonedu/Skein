---
type: discipline
status: active
summary: fork 住在上游也有的文件里的改动清单；上游 tag 合并（如 1.4.7）前后按它核对回归面
updated: 2026-11-23
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

| 上游也有的文件                              | fork 的改动                                                                                                       | 守卫                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `src/engine/controls/icons.tsx`             | `ICON_STROKE = 1.45`（上游基线 2/1.15）；`iconSize`/`iconMarkup` 只乘 `--icon-scale × --chrome-scale`，无全局倍率 | `ui-contracts` 图标带；全量 vitest |
| `src/engine/tokens/ds-base.css`             | 根 `--icon-scale: 1.4`；手机 `:root[mobile]` `1.35`                                                               | `ui-contracts`                     |
| `src/engine/tokens/ds-buttons.css`          | 窗口栏等 svg `scale: 1.125 × chrome-scale`（无 growth）                                                           | `ui-contracts` desktop bar         |
| `src/engine/controls/icon-masks.css`        | `.tx-icon` 18 × icon-scale                                                                                        | `ui-contracts`                     |
| `src/files/FileTree.css`                    | `--icon-scale: 1.25`（上游 1.2）                                                                                  | `ui-contracts` desktop tree        |
| `src/features/settings/settings-dialog.css` | 导航图标 `--icon-scale: 1.25`（上游 1.15）                                                                        | `ui-contracts` desktop settings    |
| `src/features/settings/settings-phone.css`  | 行图标 `1.55`、chevron `1.2`、返回 `1.1`                                                                          | `phone-shell` + `ui-contracts`     |

**上游最可能的覆盖方式**：给 `.tx-icon-button svg`、`.settings-phone-row-ic`、
`.tree-icon` 等选择器新增自己的 width/height/scale。文本 diff 可能很小甚至
没有冲突——只有计算样式测试会红。

### 设置与壳的其他 overlay（既有，v1.4.6 已踩过）

`src/features/settings/*`（行形、组卡单线、代理输入、工坊容器）、
`src/app/App.tsx`、`ActionSheet.css/tsx`、`sidebar-tabs.tsx` 等——这些是
v1.4.6 回归的原发地，守卫是 `phone-shell` 全部断言 + R5 的逐屏走查。

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
2. 全量 vitest；上游改了 Rust/绑定则 `npm run bindings` + cargo test。
3. 插件仓单测 + collect e2e（第三节清单）。
4. 桌面 built app + Android 真机逐屏走查，截图进合并记录（裁决 55）。
5. 本清单有变（新 overlay、新档位）→ 当次合并记录里更新本文件。

## 维护

- 每次裁决改动上游共有文件的样式/行为，把触点补进第二节。
- 清单只列"上游也有的文件"；fork 私有路径进第一节备查即可，不展开。
