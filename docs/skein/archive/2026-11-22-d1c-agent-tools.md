# D1c Agent 七工具归档（2026-11-22）

> **状态：完成。** 插件 `skein.collect` 0.4.0，源码在 `C:\Project\skein-plugins\skein-collect`
> （本地 git，未推上游）；宿主侧只补了聊天里的工具名，工具本身由插件提供。
> 出处：[Agent 工具契约 §3/§8/§10](../specs/Textus-Agent工具契约.md)、
> [D1b 确认流归档](2026-11-21-d1b-confirm-flow.md)。

## 1. 完成内容

七个工具都挂在插件的 `contributes.aiTools` 下，权限 `ai.tools`，由
`textus.ai.registerTool` 注册：

- 读：`search_notes`、`read_note`、`resolve_assets_for_trigger`。
- 写：`create_draft`、`propose_patch`、`request_confirm`、`record_use`。

写工具只产生草稿文件、pending 请求或使用记录，**不改变卡片状态**；状态变更仍由确认中心
的用户动作完成。`propose_patch` / `request_confirm` 复用 D1b 的 `proposePatch` /
`requestTransitionFor` / `recordUseFor`，同一队列和审计。

实现要点：

- `tools.js` 包在自己的函数作用域里。插件生产环境会把 `manifest.main` 拼成一个 CommonJS
  函数，`tools.js` 与 `host.js` 的同名顶层声明会直接 SyntaxError；单测按文件分别加载，看不见
  这个问题。`node` 编译拼接后的 85,810 字符 `main` 已验证通过。
- 所有卡片引用（`id`、`sourceIds`、`evidenceIds`、`assetId`、`taskId`）先过 `safeRef`：
  `..`、绝对路径、盘符、NUL 一律 `PERMISSION_DENIED`。
- 写工具要求 `requestId`，24 小时账本（`project` 的 `tool-requests`）保证重试返回同一结果。
- 限流按工具每分钟；契约要求“每会话每分钟”，但 `ai.registerTool` 的 `run(args)` 不提供
  `sessionId`，阶段 1 只能做到插件进程级（见 §4）。
- `create_draft` 支持任务只填 `expectedOutcome`；判断/资产必须有来源；任何输入都只能得到
  `inbox` / `draft`。
- 宿主聊天把七个工具和 `:whole` 变体显示成自然语言，并多显示一个 `args.id`；十个语言文件
  同步。

## 2. 证据

- 插件单测 **79/79**：`confirm-core` 23、`confirm-host` 17、`host` 9、`tools-write` 16、
  `tools` 14。
- `node ../../textus-plugins/packages/textus-plugin/cli.mjs check .` → `.: ok`。
- 拼接 `confirm-core.js; tools.js; host.js` 后用 `new Function` 编译通过。
- 桌面 built app（debug，隔离库 `vault-d1c`，插件 0.4.0 装入 `%APPDATA%`）：
  - `textus help` 列出七个 `collect` 工具；`search_notes` / `read_note` /
    `resolve_assets_for_trigger` 均返回 A-1。
  - `create_draft` 建出 `T-20261122-bc3b`（`inbox/`，`status: inbox`，`created_by: agent`）；
    同一 `requestId` 重试仍是同一 id，只有一份文件。
  - `propose_patch` 返回 `REQ-20261122-1853-3aa8` 与字段级 diff，A-1 文件未动；重复同一
    `requestId` 返回同一提案；过期 revision 返回 `REVISION_CONFLICT`；改 `status` 被拒。
  - `request_confirm` 对 A-3 只入 pending，A-3 仍是 `draft`；确认中心打开、原生确认框
    确认后 `status: active` / `revision: 2`，pending 清空。
  - A-1 的提案在确认中心确认后标题变为「报价前检查清单（烟测）」/ `revision: 4`，
    `use_count` 保留。
  - `record_use`：`use_count` 1 → 2、`verified_count` 仍为 0、`last_used_at` 更新，
    `_usage/A-1.jsonl` 一行；同一 `requestId` 重试不重复计数。
  - `request_confirm` 对 J-1 无证据确认被拒；驳回路径清空 pending 且 A-3 不变。
  - 烟测结束已停 dev、还原 `%APPDATA%`（测试插件移到 scratch），未碰真实用户库。

## 3. 契约 §10 的 22 条验收用例

| #   | 用例                             | 覆盖                                                                                         |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | 搜索不到不编造                   | `tools`: a query with no match is an empty list                                              |
| 2   | 不存在的 ID 是 `NOT_FOUND`       | `tools`: a missing card is NOT_FOUND                                                         |
| 3   | 判断缺来源                       | `tools-write`: a judgment without a source is rejected                                       |
| 4   | 不能创建 active                  | `tools-write`: no argument can make an active card                                           |
| 5   | `propose_patch` 不落盘           | `tools-write`: a diff in the queue, no file touched；built app 提案后 A-1 未动               |
| 6   | 过期 revision                    | `tools-write`: a stale revision is REVISION_CONFLICT；built app 同                          |
| 7   | 改 `status` 被拒                 | `tools-write`: a status field is refused                                                     |
| 8   | `request_confirm` 只产生 pending | `tools-write`: pending only, the card keeps its status；built app A-3 仍 draft               |
| 9   | 确认时版本已变                   | `confirm-host`: a card changed after the request is a conflict                               |
| 10  | draft 不能 `record_use`          | `tools-write`: a draft asset is INVALID_STATE                                                |
| 11  | 不改 `verifiedCount`             | `tools-write`: counters move, verified_count stays                                           |
| 12  | 同 `requestId` 不重复计数        | 同 11；`tools-write`: the same requestId returns the same card；built app 两项均验            |
| 13  | 路径含 `..`                      | `tools`: read_note climbs out；`tools-write`: source id / propose id 越界                     |
| 14  | 超限 `RATE_LIMITED`              | `tools`: the 31st search in a minute                                                         |
| 15  | 归档卡默认不出现                 | `tools`: no archived by default；显式 archived 才回来                                        |
| 16  | resolve 只返回 active            | `tools`: active assets with the stage only                                                   |
| 17  | 缺 trigger 不出现                | `tools`: an active asset without a trigger is left out                                       |
| 18  | 缺 boundary/reuseForm 不能激活   | `confirm-host`: asset activation refuses without its boundary, trigger and reuse form        |
| 19  | `lastUsedAt` 更新、verified 不变 | `tools-write`: counters move；built app `last_used_at` 同                                    |
| 20  | 任务只填 expectedOutcome         | `tools-write`: a task with only an expected outcome is allowed                              |
| 21  | boundary 按字段 diff             | `tools-write`: boundary children diff by field, not as a block                               |
| 22  | 无 actualOutcome 不能 done       | `confirm-host`: done gate: no actual outcome offers to fill it, then finishes                |

## 4. 偏差 / 后续

- **限流粒度**：插件进程级 / 分钟，不是契约的会话级 / 分钟。宿主 API 不传 `sessionId`；
  阶段 2 宿主命令可补会话级。此项写进 README 与任务清单，不假装已满足。
- **阶段 1 的约定边界**：插件持有通用写权限，理论上可绕过七工具直接改文件；产品文案不能
  宣称“AI 无法修改正式资产”，要等阶段 2 宿主命令（契约 §8/§9）。
- `create_draft` / `propose_patch` 的入参里出现 manifest 未声明的字段（如 `status`）时，真实
  宿主按 schema 拒绝，单测里工具层选择忽略未知字段；行为测试只断言结果不能产生 active。
- 七个工具**没有内置到 App**：插件从扩展页安装，官方目录仍是 0.3.1；发布 0.4.0 与更新目录
  归插件仓后续。手机入口沿 D1b 的确认中心路径，另见 D3/宿主壳。
- 外部复核（D1r）尚未做；D1c 的实现、契约矩阵与 built app 烟测在本轮完成。

## 5. 改动文件

- `skein-plugins/skein-collect/`：`tools.js`（工具层 + 作用域 + `safeRef`）、
  `tools.test.mjs`、`tools-write.test.mjs`、`host.js`（`createDraft` / `proposePatch` /
  `requestTransitionFor` / `recordUseFor` 与导出）、`textus-plugin.json`（0.4.0、七工具）、
  `README.md`。
- Textus 仓：`src/ai/chat/tool-activity.ts` 与十个 locale、`tool-activity.test.ts`；
  本归档、任务清单。
