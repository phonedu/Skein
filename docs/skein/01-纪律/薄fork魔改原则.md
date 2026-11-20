# 薄 fork 魔改原则

> 状态：v1.1（2026-11-19 修订：基线 v1.4.5、接入点补同步/宿主新增、十屏封存）
> 规范的家：《改造方案》§12（维护与升级策略）——本文是它对日常改动的操作化，不重复论证；冲突时以《改造方案》为准并回改本文
> 关闭时处置：长期有效，随 §12 修订同步

## 一、一句话

**核心功能上游决定；我们的每一处魔改，都必须以「不影响跟随下一个 release tag」为前提。**

跟随上游不是偏好，是裁决（《改造方案》§12.7）：上游持续供给的恰是独立维护最不该自己扛的部分——编辑器内核、安全修复、五端适配、插件生态。独立维护只是触发点后的退路，不是默认姿态。

## 二、归谁决定（分界表）

| 归上游（我们不改含义）                                                | 归我们（差异化，住新增目录）                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------- |
| 编辑器内核（Milkdown / ProseMirror / CodeMirror）、Markdown roundtrip | 新产品面：今天 / 资产 / 收集 / 确认 / Agent 时间线            |
| 保存、文档模型、页签与窗口机制                                        | 数据层：资产状态机、inbox、聚合（`src-tauri/src/assets/` 等） |
| 安全修复、平台适配（WebView2 / macOS / iOS）                          | 界面目标：宿主现状＋插件承载；旧十屏画板已删除（2026-11-20）  |
| 插件 API 底座（registries、权限体系）                                 | Agent 契约与工具（《Agent工具契约》）                         |
| 工程机制（门禁、i18n 机制、测试分层）                                 | 接入点的「接线方式」（见下节）                                |

冲突读法：**产品与界面裁决按 skein；工程机制按上游**（skein README §六）。

## 三、改动形态规则（违反 = 跟随成本失控）

1. **新功能住新增目录**，不散落修改现有文件：`src/features/<域>/`、`src-tauri/src/assets/` 等（《改造方案》§12.4）。
2. **接入点集中记录**（《改造方案》§12.4，《任务清单》B2）：原五处 = 一级导航注册入口 · `src/platform/capabilities.ts` · `src-tauri/tauri.conf.json` · i18n（只新增 key，不改既有 key）· 插件权限表（仅当新增 API）；**2026-11-19 同步/宿主新增** = `src-tauri/Cargo.toml` · `src-tauri/src/lib.rs` · `src-tauri/src/invoke_handler.rs` · `src-tauri/src/bindings.rs` · Settings 页注册（`settings-pages.tsx` / `builtin-pages.tsx`）· 移动端文件/回收站原生 API（若做）。出现清单外的新接入点 = 先改《改造方案》§12.4 再动代码。
3. **生成文件不碰**：`src/platform/bindings/`、`docs/dev/plugins/reference.md`（各自生成命令重出）。
4. **未完成功能用 feature flag 包住**，不让半成品裸奔在工作线里。
5. **不重写上游公共文件**：AGENTS.md、docs/README.md、.gitignore 这类只在 fork 专属提交里做最小补丁——rebase 冲突面才小（AGENTS.md 顶部 fork 注记即此形态）。

## 四、跟随节拍（B 组操作手册）

- **只跟正式 release tag**，不追 main、不追 rc（现基线 v1.4.5，2026-11-18 已并线；下一节拍 v1.4.6；rc 已取下仅书签）。
- 六步（《改造方案》§12.5）：拉 tag → rebase patch 清单（五旧接入点 + 同步/宿主新增，逐一核对）→ 四层门禁 → 桌面 + 真机 smoke → 处理冲突更新清单 → 打自己的版本号（保留上游版本号可追溯）。
- **防冲突三件套**（2026-11-17 起）：
  1. **fork-clean 提交**：上游死重（README 译文、ROADMAP、`docs/design/`、`docs/images/`、历史 release notes）在一个提交里删净，rebase 自动重放，不逐次手工删；
  2. **rerere**：`git config rerere.enabled true`（本机已配）——冲突解法第一次记录、其后自动复用；
  3. **闸门复活检测**：`.githooks/gate.mjs` 的 `absentPaths` 每次 push 核对死重不得回来；上游同类**新**文件把路径记进清单再推。
- 推送与上游 PR：一律按 [publishing-gate.md](publishing-gate.md)——本仓只推 origin；上游贡献在**全新克隆**里做。

## 五、违反信号（历次事故都出在这）

1. 拿上游文档当本仓规划、当审美来源——上游界面截图与 `docs/design/` 已删，别去找；
2. 为旧实现画对照稿——旧实现是宿主，不是目标；
3. 悄悄「沿用上游做法」替代已裁事项——推翻裁决要留档，不是换做法；
4. 改动散落进上游文件、超出 patch 清单——B2 的 rebase 成本就是这么涨起来的（B 组冲突预警见《任务清单》§6 B2）。
