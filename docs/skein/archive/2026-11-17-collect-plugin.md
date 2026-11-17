# 收集入口插件（E 切片）· D1 第一片规格

> 状态：**v1.2 已完成并归档（2026-11-17）**——E0–E4 全部 ☑；E4 证据：打包 exe + CDP 实景，⌘⇧C（预置绑定）唤起表单，真磁盘 `inbox/N-20261117-d5f3.md` front matter 与正文逐项核对无误；数据目录走查后已还原
> 规范的家：《改造方案》§4（数据模型）/ §12.3（纯插件口径）/ 附录 A（D1 验收 16 条）；《插件API要点》（通道与硬边界）；裁决 23（收集 = Dialog、⌘⇧C）；路线 = 裁决 29（小改宿主＋插件优先）
> 关闭时处置：已归档（本册进 `archive/`，不进任何门禁）；插件本体在 `C:/Project/skein-plugins/`，推远端待用户建仓

## 任务六行

```text
问题：笔记 Agent 与资产闭环还没有第一块可用的功能面；宿主 1.4.2 界面保持不动（裁决 29）。
期望：桌面任意处快捷键呼出单输入框，写一句话回车，inbox/ 出现一条带规范 front matter 的原始笔记，格式与《改造方案》§4.2 兼容，后续晋升/确认切片能直接接着用。
标准：①插件命令在宿主命令面板可达；②ui.form 单字段；③写入 <库>/inbox/<id>.md，含 §4.2 字段子集，重名自动回落；④cli check 零警告；⑤test.mjs 单测覆盖格式与回落；⑥e2e 断言 inbox 文件落地（TEXTUS_PLUGINS_DIR 缺席则跳过）。
不做：不选类型；不做晋升/确认/资产列表页签（后续切片）；不做 slash completion（B2 升 API 1.7 后增强）；不改 Textus 仓任何代码（纯插件）；不做手机端；不做插件设置行。
范围：新插件仓 C:/Project/skein-plugins/（独立 git 仓）；工具链用上游 textus-plugins 检出（C:/Project/textus-plugins，Textus 仓 .gitignore 已覆盖该名）；工作线 = 任务清单 §5 的 D1。
证据：cli check 输出 · vitest（test.mjs 替身）· e2e collect spec · 打包实例实测（inbox 文件内容）。
```

## 切片表

| #   | 切片           | 内容                                                                                                                                                                                                                       | 判据（可执行）                                                                                                   |
| --- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| E0  | 工作区         | ①clone 上游 textus-plugins 到 `C:/Project/textus-plugins`（工具链 + 官方活样例 + 满足 Textus 插件 e2e 前置）②`create-textus-plugin skein-collect --from hello --id skein.collect` 落 `C:/Project/skein-plugins/`，git init | `node packages/textus-plugin/cli.mjs check skein-plugins/skein-collect` 通过；Textus 启动后 catalog 能看到该插件 |
| E1  | 骨架与激活     | manifest：`engines.textus` 按 1.6 声明（B2 升 1.7 时同步）、`platforms` 显式标注（catalog 硬要求）；activate 内只注册命令，不 await 长任务（10 秒预算）；权限申请最小集（命令 + inbox 目录文件写 + ui.form）               | cli check 零警告；Textus 实测插件激活、命令出现在命令面板                                                        |
| E2  | 收集核心       | 命令 `skein.collect.capture` → `ui.form` 单字段（不选类型）→ `files.create` 写 `<库>/inbox/`，重名回落自写（1.6 无 `unique`）→ §4.2 字段子集随 create 一次写全                                                             | test.mjs 单测：格式 / 重名回落 / 字段完整性；e2e collect spec（跑命令→输入→提交→断言文件）；打包实例实测一条     |
| E3  | 快捷键         | 宿主快捷键绑定 ⌘⇧C → capture（走宿主 settings.shortcuts 的插件命令位）；命令面板入口兜底。**若宿主不支持插件命令绑键 → 记缺口 G-1，不绕**                                                                                  | 实测绑定生效；或缺口 G-1 记档（《任务清单》偏差/缺口起步口径）                                                   |
| E4  | 实景走查与收尾 | 打包实例（`npm run tauri build -- --debug`，settings.dev.json 注意）实测：收集 → inbox 文件 front matter 与正文正确；spec 头注状态更新；《任务清单》证据列补提交号                                                         | 四块报告：门禁读数 / AI 审查 / 人工验收 / 未验证项                                                               |

## 已裁两项（2026-11-17 批准人裁，随默认执行）

| #   | 事项                   | 裁决                                                              | 备选（未采）                            |
| --- | ---------------------- | ----------------------------------------------------------------- | --------------------------------------- |
| 1   | inbox 笔记 `type` 字段 | **省略 `type`**（未分类是收集的本义；卡片化时由晋升切片补 type）  | `type: raw` 之类的占位枚举              |
| 2   | `id` 前缀              | `N-<YYYYMMDD>-<4位>`（N = note/未分类；与 T-/任务、资产前缀并列） | 沿用通用格式但前缀留空 / 全部先按 T- 走 |

（`status: inbox`、`created_by: skein.collect`、`revision: 1`、`source_ids: []` 按 §4.2 通用字段照写，不另裁。插件 id 按 API 规则带发布者前缀：`skein.collect`。）

## 边界

- **纯插件**：Textus 仓零改动（裁决 29 /《魔改原则》口径）；插件仓 `skein-plugins` **永不上上游**（fork 私有）。
- 硬边界照《插件API要点》§四：activate 10 秒、隐藏文件默认不可见、越权即停。
- B2 拉 1.4.3 正式 tag 时：`engines.textus` 升 1.7，`files.create` 换 `unique` 回落、slash completion 增强随做。

## 落地记录（2026-11-17）

| 切片 | 证据                                                                                                                                                                                                                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E0   | textus-plugins 已检出 `C:/Project/textus-plugins`；`skein-plugins` git 仓已立（脚手架提交 `b9b8e32`）；cli check「ok」                                                                                                                                                                          |
| E1   | manifest：engines `>=1.4.2` · platforms desktop+ios · 权限 `[files.read, files.write]`（ui.* 免权限）；cli check 零警告；激活随 E2 e2e 实证                                                                                                                                                     |
| E2   | host.js：capture → ui.form 单字段 → `inbox/N-*.md`（重名 stat 回落 ×5）；**单测 6/6**（`node --test host.test.mjs`）；**e2e 1/1**（`e2e/collect-plugin.spec.ts`：真实应用里命令→表单→inbox 落盘全链）；无文件夹场景由 create 失败兜底（e2e 反证：dev shim 不应答 root，删除了多余的 root 守卫） |
| E3   | 宿主快捷键页有「插件命令」组（`shortcuts.tsx` 的 pluginCommands）；`mod+shift+c` 未被占用——绑定可用，**无缺口 G-1**；绑定 = 用户在设置页一次性配置                                                                                                                                              |
| E4   | ☐ 待打包实例实景走查（真实文件系统 + 打包二进制）                                                                                                                                                                                                                                               |
