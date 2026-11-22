# D1b 确认流归档（2026-11-21）

> **状态：完成。** 插件 `skein.collect` 0.3.0（本地 `C:\Project\textus-plugins\plugins\skein.collect`，未推上游）。
> 出处：[改造方案 §8 阶段 1](../specs/Textus-改造方案.md)、[界面改造方案 §4.4 裁决 22/26–28](../specs/Textus-界面改造方案.md)、[Agent 工具契约 §3.5/§5/§6](../specs/Textus-Agent工具契约.md)。

## 1. 完成内容

宿主不动（裁决 29），全部在插件侧：

- **确认中心**：`contributes.views` 的 webview 页（`skein.collect.confirm`），**Plugins › 确认中心**打开。
  三栏 = 待确认列表 / 卡片与 diff / 证据；窄屏（≤720 CSS px）为单列：列表 → 详情（含证据、返回）。
  底部动作常驻：打开卡片 / 稍后 / 驳回 / 确认；方向键选行，Esc 返回（窄屏），`Cmd/Ctrl+Enter` 确认。
- **请求**：列表行右键「请求变更状态…」或命令；`ui.pick` 选目标 →（激活/确认时）`ui.pick` 多选证据 →
  `ui.form` 写理由。待确认队列存 `ctx.storage.project`（`.textus/plugins/skein.collect/kv/pending.json`），
  审计追加 `audit.jsonl`；同一卡片同一目标只留一条，24 小时过期，稍后 1 小时。
- **状态机**（契约 §5）：任务 / 判断 / 资产三套迁移矩阵；激活门槛（boundary 三项、trigger、reuse_form）、
  判断确认门槛（证据 + 至少一个 `actual_outcome` 非空的任务）、任务 done 门槛（`actual_outcome`）。
- **确认**：`ui.confirm` 二次确认；重读卡片校验 `revision`，不一致即冲突（面板标「卡片已修改，请重新请求。」、
  确认禁用）；旧版本写 `asset-library/_history/<card-id>/`，经 `files.process` 一次写入（revision +1、
  `updated_at`、状态、done 时同写结果）。
- **驳回 / 稍后**：驳回记理由并出队，卡片不动；稍后隐藏 1 小时。
- **裁决 26**：资产 / 判断的派生标注（只读）：观察期（未用且 < 7 天）、未验证（未用且 ≥ 7 天）、
  复查（confirmed 判断 90 天无任务引用）。列表行与确认中心都显示。
- **裁决 27**：active 资产「记一次使用…」：`ui.pick` 结果 → `ui.form` 场景 → `use_count` +1、
  `last_used_at`、`verified_count` 不动；一行进 `asset-library/_usage/<card-id>.jsonl`。
- **裁决 28**：done 请求无 `actual_outcome` 时，确认先问「补结果后完成 / 转为阻塞」；补的结果与状态同一次写入。
- **D1c 接缝**：`proposePatch` 已实现（字段级提案入队、diff、确认落盘；`sourceIds` 只追加、禁改 status），
  供 D1c 的 `propose_patch` 调用；本轮没有 UI 生产者。
- 平台保持 `desktop + ios`（Android 走 iOS 运行时），**不写 `android`**。

## 2. 证据

- 插件单测 **49/49**：`confirm-core.test.mjs` 23（front matter 文本编辑 / diff / 迁移与门槛 / 标注 /
  pending）、`confirm-host.test.mjs` 17（请求 / 确认 / 冲突 / 驳回 / 稍后 / done 门槛 / 记一次使用 /
  patch / Windows 路径）、D1a `host.test.mjs` 9。
- `node ../../packages/textus-plugin/cli.mjs check .` → `.: ok`。
- 桌面 built app（portable debug，隔离库 `C:\Project\d1b-verify-vault`，5 张卡夹具）：
  - 资产列表 5 张卡；A-2 显示「2026-11-01 · 未验证」；`_history/` 不再被当成卡片（Windows 分隔符修复后）。
  - A-1 激活请求：目标/证据/理由 → 队列；确认中心 diff（`- status: draft` / `+ status: active`）、
    证据卡（标题、状态、摘要）；确认后 `status: active`、`revision: 4`、`_history/A-1/` 留旧版，
    pending 清空，审计两条（request / confirm）。
  - T-1 done：确认时弹「补结果后完成 / 转为阻塞」；补「10 天完成，客户一次通过」+ 偏差后，
    `status: done`、`actual_outcome`、`variance` 一次写入。
  - J-1 确认请求：驳回并写理由；J-1 保持 `draft` / `revision: 1`；审计 reject。
  - A-1 → 停用：稍后 → 队列隐藏，pending 留 `snoozedUntil`（1 小时）。
  - 外部把 A-1 `revision: 4` 改成 `5` 后刷新：行与详情标「卡片已修改，请重新请求。」，确认按钮禁用。
  - A-2「记一次使用」：`use_count: 1`、`last_used_at` 写入、未验证标注消失；`_usage/A-2.jsonl` 一行；
    `_history/A-2/` 留旧版。
  - 窄屏（WebView 344 CSS px）：列表 → 详情单列、返回按钮、证据在 diff 下、动作换行；
    宽屏（1280）：三栏 + 底部常驻动作。
  - 最终构建新建请求的 pending `path` 为相对路径（`asset-library/assets/A-2.md`）。

## 3. 改动文件

- `textus-plugins/plugins/skein.collect/`：新增 `confirm-core.js`、`confirm.html`、`confirm.css`、
  `confirm.js`、`confirm-core.test.mjs`、`confirm-host.test.mjs`；改 `host.js`、
  `textus-plugin.json`（0.3.0，`views`/commands/`project.data`/l10n）、`README.md`。
- Textus 仓：本归档、《改造方案》§4.1 目录树加 `_usage/`、任务清单、宿主壳待改清单注记。

## 4. 未验证 / 后续

- **手机入口**：窄屏页面在桌面 WebView 按 344 CSS px 验过；Android/iOS 上打开确认中心仍需 D3 宿主壳入口
  （与 D1a 列表同一个入口），见[宿主壳待改清单 §2](2026-11-21-h0-host-shell-spec.md)。
- **观察期锚点**：卡片没有 `activated_at`，观察期 / 未验证按 `created_at` 计；D1f 指标若要真激活时间再补字段。
- **修复入口**：裁决 26 的「未经结果验证」判断标注（预防性判断）本轮未做，归 D1e 详情面。
- **提案生产者**：`proposePatch` 只有接缝，没有 UI；D1c 接入 AI 工具后才会产生 patch 请求。
- 插件仍在 `textus-plugins` 本地检出、未提交/未推（与 D1a 同）。
