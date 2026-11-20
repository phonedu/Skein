# outl 对照调研与吸收清单

> 版本：v1.0（2026-11-20）
> 对象：`outlmd/outl`（本地 checkout `C:\Project\ref\outl-analysis`，commit `308d232`，2026-11-19；MIT）
> 对照：Skein / Textus v1.4.5（本仓）
> 方法：outl 源码通读（18 个 crate）+ 官方 `DESIGN.md` / `UX.md` / `CLAUDE.md` / `docs/`；Textus 侧按 `docs/skein/` 与源码逐项核对
> 性质：参考调研，不是裁决。文中「可吸收」= 值得立项评估，不等于已排期；推翻任何已裁事项按《界面改造方案》§4 留档。

## 0. 结论先行

**一句话：同源不同路。** 两边都信「Markdown 是用户的、文件在本地、离线优先、Tauri + Rust」，但 outl 把「块」当原子单位、把「并发编辑收敛」当核心问题；Textus 把「文档」当原子单位、把「Agent 加工与资产闭环」当核心问题。outl 的强项里，一部分是 Textus **已明确不做**的（CRDT / P2P / 多人实时 / outliner 数据层），一部分只是**当前没做或路线不同**（TUI、对外 MCP server、稳定块身份、导入器等）；真正能吸收的是**机制与交互纪律**，不是数据层。

**三件不要跟：**

1. **树 CRDT + 每设备 op log + iroh P2P**——Textus 的同步已裁为文件级三路合并 + 用户自有 S3/WebDAV + E2EE（《同步方案》），换 CRDT 是重写同步模型，不是吸收。
2. **outliner 的 Markdown 方言**（`key::`、`TODO` 前缀、`((blk-xxxx))`、转义规则）——Textus 是 CommonMark/Obsidian 兼容的文档编辑器，引入第二套语法会伤互操作与 roundtrip。
3. **TUI 优先**——outl 的 TUI 是一等公民，Textus 没有 TUI 且当前主线是桌面小改 + 手机 + 资产闭环；新开 TUI 是资源黑洞。

**八件值得吸收（按优先级）：**

| #   | 吸收项                                                                      | 为什么                                                                                                                                                | 落点           |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | 能力 / 拒绝矩阵（每功能 × 每端一个裁决 + 用户可读的替代说法 + 生成对照表）  | Textus 的 `capabilities.ts` 只是布尔开关，没有「这个功能在手机上是什么状态、用户按了没反应时说什么」的所有者                                          | D1c / D2 / PH3 |
| 2   | 用户可见的 Vault Doctor（只读体检 → 安全修复）                              | 资产库、同步、外部编辑都需要一个「哪里坏了、能不能修」的入口；outl 的 `doctor`/`reconcile`/`recover` 分离是成熟形态                                   | S5 / D2        |
| 3   | 今天 / 快速收集的交互规则（落地即今天、收集永远进今天、不在编辑中移动用户） | 计划里已有「今天 / 收集」，但缺可执行的交互口径；outl 的 journal-first 规则可直接改写                                                                 | D1 / D3 / PH   |
| 4   | 有界列表 + 真实总数（任何无自然边界的列表都要封顶并显示总数）               | 资产、任务、反链、搜索结果都会随库增长；这是 outl 用 2,500 页 / 64k 块校准出的硬规则                                                                  | D1a / D1e      |
| 5   | 首帧 / 不阻塞键击 / 不在 UI 路径上持锁的核查清单                            | outl 有实测事故（启动 2,557 ms 持锁、iOS 看门狗、同步轮询吃满核）；Textus 的 S3 手机端会踩同一类坑                                                    | S3 / S5        |
| 6   | 插件 API 版本与 lockfile（API 版本与应用版本解耦；安装版本可复现）          | Textus 插件已有 `engine` 范围，但缺 API 版本与 lockfile；薄 fork 每次 rebase 都需要这层保护                                                           | 插件线         |
| 7   | MCP server（先只读，写只走 propose/confirm）                                | Textus 目前只是 MCP **客户端**；把库暴露给外部 Agent 是「Agent 工作台」定位的天然延伸，但必须与现有提案机对接                                         | D1c 之后       |
| 8   | 稳定身份（先文档，块后置；先 spike）                                        | Textus 的文档身份是路径，改名 + 改内容会丢历史；块 id 是内容哈希，编辑即失效。资产证据、评论、AI 锚点都需要更稳的地址；但同步冲突不会因块 id 自动变少 | D1e / AI 锚点  |

**已经同构、不必吸收的：** 原子写、回收站/归档代替删除、空扫描与大批删除保护、同步状态与冲突中心、插件代码块渲染（`frame`/`size`）、主题多预设、外部修改重载。这些 Textus 已有自己的实现，outl 只是验证了方向。

---

## 1. 两个项目是什么

### 1.1 outl

本地优先的**大纲工具**（Roam / Logseq 的替代），一句话卖点：_两台设备离线编辑同一棵树，同步不会把树弄坏_。核心选择：

- Markdown 是唯一内容真相，`.md` 里不出现任何 id / UUID / HTML 注释；
- 块 id 存在同名 `.outl` JSON 旁车，旁车只放结构匹配元数据，不是同步面；
- 每设备一个 append-only `ops/ops-<actor>.jsonl`，HLC 排序，树 CRDT（Kleppmann 2022）合并，块文本用 Yrs；
- 客户端：TUI（一等公民）、桌面（Tauri 2 + SolidJS）、移动（Tauri 2 + SolidJS）、CLI、MCP server；
- 同步：iroh QUIC P2P 默认，文件同步（iCloud / Syncthing）可显式退选；
- 插件：Boa JS 运行时 + `plugin.json` 清单 + capability/permission + lockfile；
- 明确非目标：不做 Notion、不做 Web、不做联邦、不做团队协作。

### 1.2 Textus / Skein

本地优先的 **Markdown 笔记工作台**，方向是「Agent 常驻在真实笔记上工作，把每次交付沉淀成可复用资产」。核心选择：

- Markdown + YAML front matter 是唯一真相，Obsidian vault 兼容；
- 文档级编辑（Milkdown / ProseMirror 富文本，CodeMirror 6 源码模式），文件树 + 页签/岛布局；
- 插件沙箱 + RPC + 40+ 贡献点（列表 / 视图 / 文件编辑器 / AI 工具 / 代码块 / 自定义编辑器…）；
- AI 是内嵌的：provider、agent loop、tools、skills、memory、`propose_edit` + margin 审阅、MCP **客户端**；
- 同步（S 组）：文件级三路合并，S3/WebDAV transport，E2EE，冲突副本 + 冲突中心 + 历史/锁；
- 手机端：Android 线，PH1 格式工具栏已完成，文件树首页 + 编辑器 + sheet。

### 1.3 规模与栈

数字为源码行数（含测试，粗算，用于量级对照）：

| 维度        | outl                                                         | Textus                                                     |
| ----------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| 许可证      | MIT                                                          | MIT                                                        |
| 后端        | Rust workspace，18 个 crate，约 245k 行                      | Tauri 2 + Rust，约 360k 行（含 `aicompat`、`textus-sync`） |
| 前端        | SolidJS + Tailwind（桌面 + 移动），约 65k 行；TUI 用 ratatui | React 19 + TS + Vite，约 249k 行；另有约 25k 行 CSS        |
| 编辑器      | 自研大纲编辑器（块 + Yrs 文本）                              | Milkdown / ProseMirror + CodeMirror 6                      |
| 桌面 / 移动 | Tauri 2 / Tauri 2（iOS、Android）                            | Tauri 2 / Tauri 2（iOS、Android）                          |
| 测试        | CRDT 四个核心函数 100% 覆盖 + 收敛/属性测试 + TS parity      | 约 570 个测试文件，分层单测 / e2e / perf / roundtrip       |

**量级结论**：Textus 的体量更大、面更宽；outl 的 Rust 比例更高、核心更集中。outl 不是「更成熟的 Textus」，而是一个把复杂度压在 CRDT 与三端一致性上的精品化单点工具。

---

## 2. 源码对照

### 2.1 分层

**outl**（依赖方向严格向下）：

```
outl-core     树 CRDT、op log、Storage trait、领域模型（Workspace/Page/Block/Property/Tag）
outl-md       .md 解析/渲染、旁车、三级块匹配、diff、inline token
outl-actions  所有会改工作区的操作 + SyncEngine（TUI/桌面/移动/CLI/MCP 共用）
outl-ws       工作区启动、锁/actor 协议、分片注册、slug 修复
outl-shortcuts (chord, action) 目录 + 每端 support 矩阵
outl-plugins  Boa JS 运行时、manifest、权限、lockfile
outl-sync-iroh / outl-import / outl-config / outl-theme / outl-exec / outl-telemetry
outl-cli / outl-tui / outl-desktop / outl-mobile / outl-tauri-shared / outl-frontend-shared
```

关键纪律：**客户端不许自己写树遍历/op 构造**，必须先放 `outl-actions`；`outl-core` 不依赖文件、Markdown、网络；`outl-theme::Palette` 是唯一色板，客户端只能读。

**Textus**（ESLint 强制分层）：

```
shell     app/ document-view/ lazy/ playground/ help/
features  ai/ clipboard/ document/ editor/ export/ files/ mobile/ onboarding/ plugins/ settings/ theme/
registry  commands / menu / sidebar tabs / context-menu items
engine    tokens/ motion/ frame/ drag/ controls/ layout/
base      platform/ utils/ i18n/ storage/ prefs/
```

关键纪律：`src/platform/` 与 `src/dev/` 之外不直接 import `@tauri-apps/*`；`editor/` 不 import AI/文档/导出/文件/移动/插件；`plugins/host/` 只被 `plugins/` 内部使用；生成文件不手改。

**同**：都把「核心逻辑与客户端分离」当第一原则；都用穷举/类型/测试把某类错误变成编译错误。
**异**：outl 的共享面在 Rust（一套 action 给五个 surface），Textus 的共享面在 TS/Rust 两层（React 组件 + Rust 命令 + 插件 API）。outl 的模型更接近「一个内核，多个壳」；Textus 更接近「一个宿主，插件扩展」。

### 2.2 数据模型

| 维度     | outl                                                               | Textus                                                      |
| -------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| 原子单位 | Block（一条 bullet）                                               | 文档（一个 `.md` 文件）                                     |
| 身份     | ULID；页面/块都有稳定 id                                           | 路径是文档身份；块 id 是内容哈希（`doc-blocks.ts`，FNV-1a） |
| 元数据   | 页面/块 `key:: value`；旁车 `.outl` 存 id/位置/内容哈希/ref handle | YAML front matter；`.textus/` 存项目/同步/插件数据          |
| 文本     | 每块一个 Yrs TextRef                                               | ProseMirror 文档树 + Markdown 序列化                        |
| 结构     | 树（parent + fractional position）                                 | 文档块序列（顶层节点）                                      |
| 同步单位 | Op（Move/Edit/SetProp/Create/SetCollapsed/SnoozeRemind）           | 文件（整文件三路合并）                                      |

**关键差异**：outl 的块 id 稳定，所以能做块引用、块嵌入、跨设备 move、块级 undo；Textus 的块 id 是「内容哈希」，注释写明 _stale id names nothing rather than the wrong block_——这是为 AI 提案与 `^id` 链接服务的**短命地址**，不是持久身份。两者对「块」的承诺不同：outl 承诺「这个块还是那个块」，Textus 承诺「这个 id 只对应这段文字」。

### 2.3 Markdown 管线

**outl**：

- 方言是标准 Markdown 无序列表 + 两空格缩进；`TODO`/`DOING`/`DONE` 是文本前缀；`key:: value` 是属性；`[[page]]`、`#tag`、`((blk-xxxxxx))`、`!((...))`、`![[...]]` 是引用；` ```query ` 是动态查询。
- 解析器**从不丢行**：不认识的标记变成 verbatim block + `ParseWarning`（行号、原文、类型）；页面无法读取时拒绝覆盖。
- 旁车匹配三级：内容哈希 + 父节点 → 数量相等时的位置回退 → ±2 DFS 内 >80% 相似度；匹配不上则新 ULID 或进 trash，先写 `orphans.log`。
- round-trip 是属性测试：`parse(render(ast)) == ast`，只允许 tab/尾空白/属性顺序归一化。

**Textus**：

- CommonMark + Obsidian wikilinks / `^id` 块链接；front matter；Milkdown 的 mdast 管线；`verbatim.ts` 把文档类型声明保留的语法当原文保存（`html` 节点），不画、不丢。
- `save-roundtrip` 有独立语料与编辑级测试；`markdown-roundtrip.md` 是门禁文档。
- 对未知语法：以「保留原文」为主，但没有 outl 那种「解析警告 + 恢复块」的用户可见面。

**同**：都把「不丢用户字节」当底线；都用 round-trip 测试守。
**异**：outl 的方言是产品的一部分（大纲语义），Textus 的方言必须服从 CommonMark/Obsidian 兼容；outl 的旁车匹配是为「外部编辑器改了 md 还能认回块」服务的，Textus 目前靠内容哈希 + 路径，不需要这套复杂度——除非要做稳定块身份。

### 2.4 同步

| 维度     | outl                                                                   | Textus                                                 |
| -------- | ---------------------------------------------------------------------- | ------------------------------------------------------ |
| 模型     | op log 为真相，树/ `.md` 是投影                                        | 文件为真相，base 是上次同步的哈希                      |
| 并发     | 树 CRDT + HLC；并发 move 一个赢，另一个在树上是 no-op 但留在日志       | 文件级三路：本地/远端/base；两端都改 → 冲突副本        |
| 传输     | iroh QUIC P2P（默认）/ 文件同步（opt-out）                             | S3 / WebDAV；用户自己的存储；无自建云                  |
| 加密     | QUIC + TLS 1.3；op 本身不签名；relay 可见元数据                        | E2EE（每库密码）；凭据 Keychain/Keystore               |
| 删除     | `Move(node, TRASH_ROOT)`                                               | 远端从 head 移除，旧内容进 history；移动端 App trash   |
| 恢复     | `doctor` / `reconcile` / `recover`；旁车/未入日志内容拒绝覆盖          | 冲突中心；锁恢复；空扫描/大批删除保护；history         |
| 已知限制 | 单文件 op log 规模、无因果交付、Yrs undo best-effort、移动端配对仅 CLI | 文本三方合并后置（U12）；rename 历史不跟随；SAF 非原子 |

**结论**：两者解决的不是同一个问题。outl 解决「同一棵块树被多端同时改」；Textus 解决「同一批文件被多端改，且用户可能用任意编辑器」。**不要用 outl 的 CRDT 替换 Textus 的同步**；但 outl 的「删除是 move」「拒绝覆盖未入日志内容」「空扫描/大批删除先停」与 Textus 的 H2/H3/冲突中心是同一套数据安全直觉，可以互证。

### 2.5 插件

| 维度     | outl                                                                                        | Textus                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 运行时   | Boa（纯 Rust JS，无 JIT，可上 iOS）                                                         | 沙箱 webview + RPC broker，多运行时                                                                                      |
| 清单     | `plugin.json`：id、version、`api` 范围、`engines`、capabilities、permissions、`contributes` | `textus-plugin.json`：id、version、`engine` 范围、permissions、40+ 贡献点                                                |
| 权限     | 声明式 + 安装时批准 + 运行时检查                                                            | 158 行权限表 + `guarded()` + 安装期代码扫描                                                                              |
| 贡献点   | commands、keybindings、config schema、toolbar、content transformers                         | aiTools、slash commands、decorations、hover、diagnostics、code blocks、custom editors、sidebar tabs、list views、embeds… |
| 渲染扩展 | `contributes.transformers`：fence 语言 → text/rich descriptor；rich 在沙箱 iframe           | `contributes.codeBlocks`：language、title、`frame: none`、`size: interface`；插件 webview/embed                          |
| 版本治理 | API 版本与二进制版本解耦 + lockfile                                                         | 有 `engine` 范围与 catalog，未见 lockfile/API 版本                                                                       |

**结论**：Textus 的插件系统明显更成熟、贡献面更宽；outl 值得借的是**治理细节**（API 版本、lockfile、声明式 contributions 可在不执行 JS 时被宿主读取、capability 与客户端实现取交集），不是运行时。

### 2.6 AI / Agent

| 维度     | outl                                                                           | Textus                                                                                      |
| -------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 拓扑     | Agent 在**外部**：CLI / MCP server / 插件 `onOp` 钩子；应用本身没有内嵌聊天    | Agent 在**内部**：provider、agent loop、工具、skills、memory、margin 审阅；MCP 只是工具来源 |
| 写权限   | CLI/MCP 的工具面 = 全部工作区操作；删除/合并需 `confirm:true`；错误用稳定 code | AI 只能 `propose_edit` / 创建草稿；用户接受才落盘；资产状态机规定 AI 只能建 `draft`         |
| 审阅     | 文本变更以 diff 返回，MCP 结果剥离 GUI 字段                                    | 流式提案、逐条接受/拒绝、margin 批注、`ProposalLedger`、每请求预算                          |
| 外部生态 | `outl mcp serve` + `outl_*` 工具 + resources/prompts                           | MCP 客户端；插件 `aiTools`；无对外 MCP server                                               |
| 记忆     | 无跨会话用户记忆（页面/属性即记忆）                                            | `.textus/library` 项目记忆 + workspace + skills                                             |

**结论**：Textus 的 HITL（human-in-the-loop）与审阅体验强于 outl；outl 的**对外动作面**强于 Textus。Textus 吸收 MCP server 时，应把 outl 的「稳定错误码 / `confirm` 门 / 批量 `failed_at`」与自己的「提案-确认」合并，而不是把 outl 的直写工具面照搬。

### 2.7 工程纪律

**outl** 的 `CLAUDE.md` 有 15 条「不可违反」不变式，其中 8–15 每条都由一次实测事故买来，且写明「问题现在住在哪」。配套：`/check` 双半（Rust + TS）、生成式 `client-parity.md`、文件大小钩子、语义换行、专用 agent（CRDT 不变式检查、论文核对、roundtrip 测试）。

**Textus** 有 AGENTS/CONTRIBUTING、ESLint 分层、生成 bindings、`check:quick`/`check`、570 个测试文件、10 语言 i18n、thin-fork 纪律。

**同**：规则都写进仓库、都靠测试/门禁而不是记忆。
**异**：outl 更偏「把规则变成编译错误/生成表」；Textus 更偏「lint + 测试 + 文档」。outl 的「不变式 = 事故 + 改动 + 测试」写法值得 Skein 的纪律文档借鉴，但不必新开一套。

---

## 3. 功能对照

图例：✅ 有且为核心；◐ 部分/插件/计划中；✖ 没有。

| 功能              | outl                                 | Textus                                       | 说明                           |
| ----------------- | ------------------------------------ | -------------------------------------------- | ------------------------------ |
| Markdown 文档     | ✅                                   | ✅                                           | 都是本地 md                    |
| 大纲/块嵌套       | ✅ 核心                              | ◐ 编辑器列表，非数据模型                     | 数据模型差异的根               |
| 日记 / 今天       | ✅ journal-first                     | ◐ 日期文件名；「今天」在计划里               | outl 是产品入口                |
| 反链              | ✅ 内联、按最近排序                  | ◐ 元数据有，未见 UI                          | Textus 有 `metadata.backlinks` |
| 块引用 / 嵌入     | ✅ 稳定 handle                       | ◐ Obsidian `^id`，内容哈希                   | 稳定块身份是 gap               |
| 页面引用 / 嵌入   | ✅                                   | ✅ wikilink/embed                            | 同                             |
| 属性              | ✅ 页面/块 `key::`                   | ✅ front matter                              | 同，语法不同                   |
| 标签 / 命名空间   | ✅ `#a/b/c`                          | ✅ 标签；无命名空间页                        | outl 的 namespace 页是可选参考 |
| 任务              | ✅ TODO/DOING/DONE + 任务面板        | ✅ checkbox；资产任务在计划                  | DOING 与任务面板可参考         |
| 查询 DSL          | ✅ ` ```query `                      | ◐ 插件列表/搜索；无核心查询 fence            | 插件轨道可做                   |
| 提醒              | ✅ `remind::` + snooze + quiet hours | ◐ 资产触发（阶段），无时间提醒               | 后续可选                       |
| 导入              | ✅ Roam/Logseq/Obsidian + dry-run    | ◐ Obsidian 兼容；Word 导入；未见 Logseq/Roam | 增长项                         |
| 导出              | ✅ md/json/hugo                      | ✅ PDF/pandoc/HTML…                          | Textus 更强                    |
| 同步              | ✅ P2P/文件 CRDT                     | ✅ S3/WebDAV 三路 + E2EE                     | 两条路                         |
| 插件              | ✅ JS                                | ✅ 沙箱/RPC，更强                            | Textus 领先                    |
| AI 聊天           | ✖                                    | ✅ 内嵌                                      | Textus 领先                    |
| MCP               | ✅ server                            | ✅ client                                    | 互补                           |
| CLI               | ✅ 完整                              | ◐ 安装 `textus` 终端命令                     | outl 领先                      |
| TUI               | ✅ 一等公民                          | ✖                                            | 不建议跟                       |
| 移动端            | ✅ journal-first                     | ✅ 文件树 + 编辑器                           | 形态不同                       |
| 主题              | ✅ 10 预设 + 对比度守卫              | ✅ Typora 兼容内容主题 + 导入导出            | Textus 生态更宽                |
| 回收站            | ✅                                   | ✅                                           | 同                             |
| 代码执行          | ✅ Lua/Python/JS/Scheme              | ◐ 插件/工具相关                              | 可选                           |
| Vault 体检 / 修复 | ✅ doctor/reconcile/recover          | ◐ 同步恢复，无用户可见 doctor                | 可吸收                         |
| 冲突中心          | ✖（静默收敛）                        | ✅                                           | 理念相反但都成立               |
| 版本历史          | ✅ 页面/块 history                   | ✅ `_history` + history sources              | 同                             |
| 自定义编辑器      | ◐ 插件视图                           | ✅ custom editors                            | Textus 领先                    |
| i18n              | ✖ 英文                               | ✅ 10 语言                                   | Textus 领先                    |

---

## 4. 界面与交互理念

### 4.1 outl 的八条原则（`UX.md`）

1. **Journal-first**：打开就是今天的日记，光标就位；不是 dashboard、不是文件树。
2. **Never block a keystroke**：op log 同步写，`.md` 投影异步；任何键击、命令回复、帧都不等渲染/fsync/反链重建；读也一样，工作要落在页面**后面**，不是页面上。
3. **Silence is the defect**：拒绝写不能只进日志；每个 surface（TUI/桌面/移动/CLI/MCP）都要给用户一句话。
4. **Refuse rather than delete**：不能证明安全的写就拒绝并说清楚；陈旧视图可恢复，删掉的字节不可恢复。
5. **View state is local; disagreement converges**：两端会分歧的状态 → `Op`；不会分歧的（缩放、主题、反链顺序、免打扰）→ 设备本地。
6. **Interruption is always opt-in**：日期链接不自动变成提醒；通知权限在第一次真正触发时才问。
7. **Structure on demand, prose always**：折叠箭头/行内 chrome 静息时隐藏、hover/focus/选中时出现；缩进参考线始终可见。
8. **One owner per user-visible fact**：一个用户可见事实只有一个所有者；TS/Swift 里的第二份意见是漂移。

### 4.2 Textus 的现状

- 桌面：三段式工作台——活动栏 + 侧栏（文件树 / 大纲 / 搜索 / 插件）+ 页签岛 + 编辑器 + AI 面板；设置是浮层；Base UI。
- 手机：文件树首页 + 编辑器 + 格式工具栏；sheet 承载设置/同步/插件；PH1 已完成，PH3/PH4 待核查。
- 方向：小改宿主 + 插件优先；今天 / 笔记 / 资产 / Agent / 设置五个一级入口（计划）；十屏 IA 已封存。
- 资产闭环：收集 → 整理 → 晋升 → 调用 → 记录；确认中心 + diff + 证据；AI 只能建草稿。

### 4.3 相同点

1. **本地优先、文件可被别的工具打开**——两边都拒绝把用户锁进专有库。
2. **键盘优先 + 命令面板 / slash 菜单**——power user 是共同用户。
3. **回收站/归档代替删除**——数据安全的同一直觉。
4. **反链、日记/今天、任务**——都把「时间 + 引用 + 待办」当笔记的基本维度（Textus 的反链 UI 还没做，但元数据在）。
5. **「不打断」**——outl 写成原则，Textus 写成「不在编辑中移动用户」「AI 提案不自动落盘」。
6. **插件扩展 + 权限**——都认为核心不该无限膨胀。
7. **多端同一份 Markdown**——桌面/手机共享文件，不做云端真相。

### 4.4 差异

| 轴             | outl                               | Textus                                                         |
| -------------- | ---------------------------------- | -------------------------------------------------------------- |
| 第一屏回答什么 | 「今天写什么」                     | 「我要打开/继续哪份文档」；计划改为「今天该做什么/用哪条资产」 |
| 原子单位       | 块                                 | 文档                                                           |
| 主编辑形态     | 大纲 bullet，TUI 还是 modal vim    | 富文本文档，页签/岛，格式栏                                    |
| chrome 密度    | 极简，结构按需出现                 | 工作台，列表/卡片/确认中心是产品的一部分                       |
| 手机形态       | 单栏 journal-first + 底栏四入口    | 文件树首页 + 编辑器 + sheet；计划四入口                        |
| Agent 位置     | 外部（CLI/MCP），应用是数据面      | 内嵌（面板/提案/审阅），MCP 是工具来源                         |
| 分歧处理       | 静默收敛；只有「页面领先日志」要人 | 冲突副本 + 冲突中心；资产状态迁移要人确认                      |
| 扩展方式       | 一套 Rust action 给所有壳          | 宿主 + 插件贡献点 + AI 工具                                    |
| 主题           | Rust 单一色板，固定预设            | CSS/Typora 兼容主题，用户可导入                                |
| 错误声音       | 「你能做什么」的 nudge，禁止开发词 | i18n 文案 + notice/toast；无集中拒绝目录                       |

### 4.5 相反但都成立的选择

- **outl 静默收敛 vs Textus 冲突中心**：outl 的块树可以用 CRDT 确定性合并，所以「冲突」不该打扰用户；Textus 的文件可能被任意编辑器改，冲突副本是唯一诚实的选择。**不要把 outl 的「不弹冲突」当成 Textus 的目标**。
- **outl 无 dashboard vs Textus 工作台**：outl 的用户只做一件事（写大纲）；Textus 的用户要在笔记、任务、资产、Agent 之间切换，列表和确认中心是必要的。**可以借「编辑区内的结构按需出现」，但不要借「整个产品只有一个大纲」。**
- **outl 外部 Agent vs Textus 内嵌 Agent**：outl 的 Agent 可组合、可脚本化；Textus 的 Agent 可审阅、可确认。两者不是替代关系，Textus 可以**同时**有内嵌 Agent 和对外 MCP。

### 4.6 outl 的强项：哪些是「明确不做」，哪些只是「没做」

把「强项」和「裁决」分开，避免把「没做」误读成「永远不做」，也避免把「明确不做」误读成「只是没排期」：

| outl 强项                               | Textus 的现状 / 出处                            | 分类                   |
| --------------------------------------- | ----------------------------------------------- | ---------------------- |
| 树 CRDT + 每设备 op log                 | 《同步方案》不做 oplog；S0a supersede           | **明确不做**           |
| iroh P2P 无服务器同步                   | 《同步方案》不做无服务器 P2P                    | **明确不做**           |
| 实时协同 / 多人共享                     | 《改造方案》不做多人协作；同步不做实时协同      | **明确不做**           |
| outliner 块树 / 块引用 / 块嵌入 / zoom  | 不重写 Milkdown；§7.9.3 不做块数据库 / 任意嵌套 | **明确不做（数据层）** |
| 静默收敛、不弹冲突                      | Textus 选冲突副本 + 冲突中心                    | **明确不同选择**       |
| Rust 单一色板                           | Textus 用 CSS / Typora 兼容主题                 | **明确不同选择**       |
| TUI 一等公民                            | 无 TUI，不在任何工作线                          | 没做 / 不在路线        |
| 对外 Agent 动作面（CLI / MCP server）   | 只有 MCP client；MCP 在设置高级                 | 没做                   |
| journal-first 日记                      | 计划今天 / 收集，不是日记文件模型               | 没做 / 不同            |
| 时间提醒 / 免打扰                       | 资产是阶段触发；无时间提醒                      | 没做                   |
| 查询 DSL / 命名空间页 / 块嵌入 UI       | ED1 插件轨道候选；无核心                        | 没做 / 不同            |
| Roam / Logseq 导入                      | 无；Obsidian 兼容                               | 没做                   |
| 代码块执行                              | 无核心                                          | 没做                   |
| 稳定块 ID + 三级匹配                    | 内容哈希 + 文件级                               | 没做 / 明确不同        |
| 每端 support 矩阵 / 五 surface 拒绝目录 | 无集中机制                                      | 没做（机制）           |
| doctor / reconcile / recover            | 同步有恢复，无用户可见 doctor                   | 没做                   |

**读法**：第一组是**架构赌注**，改它就是换路线；第二组是当前路线没排到的能力，可以按需求立插件/专项；第三组是 Textus 已有替代，不必照搬。**不要把第二组当「永远不做」，也不要把第一组当「只是没排期」。**

---

## 5. 可吸收清单

### A. 现在可做（低风险，贴当前工作线）

#### A1. 能力 / 拒绝矩阵

**借什么**：outl 的 `outl_shortcuts::support`（Action × Client 的穷举 match）+ `capability_support`（无 chord 的能力）+ `outl_actions::refusal`（Refusal × Surface 的穷举 match）+ 生成的 `client-parity.md`。每条 lesser 状态都带一句**用户能照着做**的话，且这句话写在目录里，不写在客户端。

**Textus 现状**：`src/platform/capabilities.ts` 是扁平布尔表（`canUseWindows`、`canExportPdf`、`hasTextusAi`…），回答「这个构建能不能」，但不回答「这个功能在手机/桌面/iOS/Android 分别是什么状态、用户按了没反应时说什么」。`docs/dev/ios-code-map.md` 是人工表。

**落点**：新增 `src/platform/feature-support.ts`（或扩展现有 capabilities）：

```ts
type Client = "desktop" | "ios" | "android";
type Support =
  | { kind: "full" }
  | { kind: "partial"; why: string }       // 有入口，语义不全
  | { kind: "missing"; instead: string }   // 该有，暂时没有；说替代路径
  | { kind: "not-applicable"; why: string } // 结构上不可能；说原因
export const FEATURE_SUPPORT: Record<Feature, Record<Client, Support>> = { ... };
```

- 一个测试遍历 `FEATURE_SUPPORT`，任何 Feature 缺一端裁决就失败；
- `instead` / `why` 走 i18n key（10 语言），不写内联英文；
- 生成 `docs/dev/client-parity.md`（或扩 `ios-code-map.md`），不手写；
- 先覆盖 15–20 个**会分化**的功能：同步、MCP、插件、导出、文件夹选择、终端命令、AI 可用性、多窗口、页签、设置、手机布局、格式栏、资产、今天、收集等。

**成本**：2–3 天 + 持续纪律。**风险**：不要为每个命令都建行；只覆盖用户可见功能。

#### A2. Vault Doctor（先只读）

**借什么**：outl 的 `doctor` / `reconcile` / `recover` 三分离：

- `doctor` 只诊断，不修；
- `reconcile` 修 `.md` 与日志的偏差，但拒绝覆盖未入日志内容；
- `recover` 只处理一种可证明的截断编辑；
- 所有修复先写 `orphans.log` / trash，不物理删。

**Textus 现状**：同步有 H3 空扫描/大批删除、H4 锁恢复、H5 状态修正、H6 外部修改；链接解析、front matter、metadata cache 都有；但没有一个用户可见的「体检」入口。

**落点**：设置 › 同步或资产库的一个只读「健康检查」页/插件，报告：

- 断链 / 缺失附件 / 重复 front matter id / 资产卡 schema 违规；
- 同步 base/head 不一致、陈旧锁、deferred、冲突副本；
- `_history` / trash / 插件缓存孤儿；
- 不可读文件 / 解析异常（若编辑器能给出）；
- 大文件 / 超大 history。

第一阶段只报告 + 跳转，不提供「一键修复」；修复逐项确认，归档优先于删除。

**成本**：只读 1–2 周；修复另立。**风险**：不要把同步内部诊断暴露成技术日志；用户语言。

#### A3. 今天 / 快速收集的交互规则

**借什么**：outl 的 journal-first + quick capture 规则（`UX.md`）：

- 应用打开落在今天；不是 dashboard。
- 快速收集**永远写今天**；在别的页面收集时开一个小 sheet，不移动用户，并用 toast 说明。
- 离开 30 分钟或跨日回来落在今天；**编辑中绝不移动**；今天已在屏幕上就什么都不做。
- 空状态直接引导「收集第一条」，不是功能 tour。
- 今天页只回答：我现在该做什么、该用哪条资产、有什么待确认、最近笔记。

**Textus 现状**：计划已有「今天 / 收集」；手机首页是文件树；`PhoneHome` 的 FAB 是新建文档。可以直接把上述规则写进 D1/PH 的验收口径，而不是照抄 outl 的日记文件模型。

**成本**：设计/规格为主，施工随 D1/PH。**风险**：Textus 的「今天」是聚合视图还是日记文件，需要先裁；不要默认引入日记文件。

#### A4. 有界列表 + 真实总数

**借什么**：outl 的硬规则——任何没有自然边界的列表都要有上限，并在旁边显示真实总数（命名空间提及 50 / 3,221；任务 200 + 未截断计数）。列表空/载入/错误状态归**该区块**所有，不能把整页/编辑器拖进 loading。

**落点**：D1a 资产列表、D1e 详情/来源链、搜索、反链、任务面板。统一一个 `{ items, total, truncated }` 契约；UI 显示「显示 200 / 共 3,221」；测试断言不返回无界数组。

**成本**：小。**风险**：不要用「加载更多」伪装无界；总数必须真。

#### A5. 首帧 / 不阻塞键击 / 不持锁核查

**借什么**：outl 的实测事故与规则：

- 启动时后台 reconcile 持工作区锁 2,557 ms，正好撞上前端要今天的日记；改成 `try_lock` + 重试，并把两个不可分块的 pass 挪出启动窗口。
- iOS 上同步在主线程轮询，33 s CPU / 10 s 窗口 → 看门狗 `SIGKILL`，用户只看到白屏。
- 同步在 mount 时抢先拨号，导致首屏 +2,158 ms；挪到首帧之后降到 +39 ms。
- 「后台线程不是隐形」：它和首帧共享同一把锁、同一块磁盘。

**Textus 现状**：有启动预算（`vite.startup-budget.ts`，1.25 MB）、`lazyModule`、`boot.js` 首帧主题、同步 20k/128 MiB 基准；但缺一份「什么必须在首帧后、什么不能持锁、什么必须 offload」的书面核查表。

**落点**：`docs/dev/` 或 Skein 工程菜谱新增一页「启动与 UI 路径性能核查」，并在 S3 手机端逐项过：

- 同步 / 插件 / 备份 / 索引是否在 `first_content` 之后；
- 任何可能慢的 Tauri command 是否 `async` + offload；
- 是否有 UI 路径上的 `lock()`；
- 每个随库增长的读是否有上限与实测预算；
- 在真实大库（20k 文件 / 128 MiB）上测，不在夹具上测。

**成本**：文档 + 审计为主；代码改动看发现。**风险**：不要把它变成新的门禁脚本而不修问题。

#### A6. 插件 API 版本与 lockfile（小）

**借什么**：outl 的 `plugin.json` 把 `api`（插件 API 版本）与 `engines`（最小二进制版本）分开；`lockfile` 固定安装版本/哈希；`contributes` 可在不执行 JS 时被宿主读取。

**Textus 现状**：`engine` 范围已有（`engineSatisfied`），catalog 有版本；未见 API 版本字段与 lockfile。薄 fork 每次 rebase 上游，插件 API 兼容性需要一层显式契约。

**落点**：manifest 增 `api` 字段（如 `"1"`），宿主按 API 版本决定兼容；安装记录写 lockfile（id/version/hash/source），升级显式；`contributes` 已经是声明式，保持。

**成本**：低–中。**风险**：官方插件需要迁移；先只对内置/catalog 插件生效。

### B. 先 spike（高价值，有真风险）

#### B1. MCP server（只读 → 只提议）

**借什么**：outl 的 `outl mcp serve`：

- 工具与 CLI 共用同一套 handler，业务逻辑不复制；
- 破坏性操作 `confirm:true`，否则 `CONFIRM_REQUIRED` 且不改；
- 批量遇到第一个错误就停，返回 `failed_at` + `applied`，不回滚已完成项；
- 成功只回文本内容（紧凑 JSON），错误带 `structuredContent` 供 agent 读；
- 稳定错误码；exit code 3 = 「什么都没做，且这不是失败」；
- 工具面覆盖 page/block/daily/search/query/asset/trash/backlinks/tags/props/export/template/batch。

**Textus 现状**：`src-tauri/src/mcp/` 是 **client**（连外部 MCP servers 给 Textus AI 加工具）；没有对外 server。AI 内置工具有 `search`、`read_document`、`propose_edit`、`find_files`、`search_files`、`read_file`、`check_conventions` 等。

**落点（建议分两档）**：

1. **只读档**（先做）：`textus mcp serve` 暴露 `search`、`read_document`、`list_files`、`backlinks`、`frontmatter`；只读库，不写；本地 stdio，不监听网络；工具 schema 从现有 Rust 工具/命令生成，不手写第二套。
2. **只提议档**（后做）：`create_draft` / `propose_patch` / `record_use` 只写入现有提案/草稿通道，**不直接写正式文件**；确认仍由 Textus UI 完成。这正好对应《Agent工具契约》七工具与「AI 只能建草稿」的硬规则。

**为什么值得**：Textus 的定位是「Agent 工作台」，但外部 Agent（Claude Code、Codex 等）目前进不来；MCP server 是最低成本的开放面，也能让资产能力被外部调用（Astryx / DSH 方向）。

**成本**：只读档 1–2 周；只提议档 2–4 周。**风险**：本地 server 必须 opt-in、限定 vault、默认 stdio/本机 socket；写通道必须复用提案机，不能开直写后门。**不要**把 outl 的「全量直写工具面」照搬。

#### B2. 稳定身份（先文档，后块；spike）

先把两件事分开，它们的收益、成本和同步含义不同：

| 问题     | 现在的答案                                                                                                                                                 | 稳定身份能解决什么                                                                   | 不能解决什么                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 文档身份 | 路径就是身份（`head.json` 的 path → Entry）；同哈希改名可被 `moves()` 认成 move；本地改名是删除 + 新增；改名 + 改内容与删除 + 新建不可区分，历史留在旧路径 | 改名 + 改内容仍认得出是同一文档；历史跟随；跨设备 move 可配对；冲突命名 / 来源链更稳 | 不解决两端同时改同一段内容的冲突——那仍要三路合并 / 冲突副本 / 块级合并 |
| 块身份   | `doc-blocks.ts` 的 FNV-1a 内容哈希；编辑即变；`^id` 是用户写在 md 里的 Obsidian 块链接                                                                     | 证据 / 评论 / AI 提案在块被编辑后仍能定位                                            | 不解决文件级同步的整文件冲突；也不自动让外部编辑器认识这个 id          |

**outl 的做法**：文档 / 块都用 ULID；块 id 在 `.outl` 旁车，md 保持干净；外部编辑后用三级匹配认回块；旁车只放结构元数据，不是同步面。

**Textus 的硬约束（必须先看）**：

- 同步的 `Entry` 是 `{hash, size, blocks}`，其中 `blocks` 是 **2 MiB 内容分片**（去重 / 断点用），不是语义块；不要把它当块身份。
- `.textus/` 不是整体同步：`textus-sync/src/path.rs::in_scope` 只带 `agent.md`、`style.md`、`style.previous.md`、`library/*.md`、`memory/*.md`、`skills/*.md`。把 `doc-ids.json` 放 `.textus/` 不会跨设备。
- 因此文档 id 只有三条路：
  1. **frontmatter `id:`**——随文件同步，最简单；但改用户可见 md，普通笔记会多一个字段（Obsidian 兼容性要评估）；资产卡已经有 `id`，可先只对资产卡 / 被引用笔记启用。
  2. **扩同步 scope 的旁车**（如 `.textus/ids/<hash>.json`）——md 不变，但要改 `in_scope` 与协议，旧客户端可能忽略；需要版本化。
  3. **协议 `Entry.id`**——最干净，但 `head.json` 形状变了；旧客户端 serde 忽略未知字段，但重写时会丢，需要兼容策略。
- 复制 / 分叉：同一 id 出现在两个路径 = 分叉；要像 outl 的 workspace-id 一样先检测再决定，不能静默共用。

**建议**：

1. **先做文档身份**（2–3 天 spike）：选资产卡或被引用笔记，验证 rename + edit、history 跟随、两设备 move 三个场景；再决定 frontmatter 还是协议字段。
2. **块身份等具体场景**：只有「证据锚点 / 评论 / AI 提案跨编辑」成为真需求时才做；先 3–5 天 spike 一个场景。**不要为同步而做块 id**——文件级同步的冲突不会因为块 id 变少。
3. 无论哪条，都保持「旁车 / 身份不是第二真相」：丢了能重建，md 仍是唯一内容真相。

**成本**：文档身份 spike 2–3 天，产品化 1–2 周；块身份 spike 3–5 天，产品化 2–4 周。**风险**：复制 / 分叉、旧客户端、迁移、用户可见字段；不要一次做两件。

#### B3. 导入器（Roam / Logseq / Obsidian）带 dry-run

**借什么**：outl 的 adapter + `ImportReport`：导入前回答「会导入什么、丢什么、哪些引用解析不了」；资产缺失/远端资产/时间戳丢弃都计数；支持 Roam、Logseq、Logseq DB（EDN）、Obsidian。

**Textus 现状**：Obsidian vault 兼容；有 Word 导入；未见 Roam/Logseq 导入。

**落点**：优先做**插件**（不碰宿主），复用 `files.create` / `frontmatterSet` / `asset` 能力；先做 Logseq（大纲 → md 列表最接近）或 Obsidian（兼容性最好），dry-run 报告先给「页数/块数/断链/附件/不支持语法」。这能服务「从 outliner 迁过来」的用户，也能给资产库带原始素材。

**成本**：插件 2–4 周。**风险**：Logseq 的块引用/属性/查询语义映射不完美；报告必须诚实，不能宣称无损。

#### B4. 查询 / 任务 fence（ED1 插件轨道）

**借什么**：outl 的 ` ```query ` DSL（tags/props/dates/kind，`not-` 可否定，结果渲染为 live references）与任务面板（DOING 优先、前 200 + 真实总数）。

**Textus 现状**：已有 `contributes.codeBlocks`（language/title/frame/size）与插件 list views；` ```query ` 或 ` ```tasks ` 可以作为插件代码块落地，不碰内核。ED1 已把「筛选视图」列为候选。

**成本**：插件 1–2 周。**风险**：查询结果不落盘、不导出（视图不是真相）；与资产卡的 front matter 字段对齐。

#### B5. 三级块匹配（仅 AI 锚点 / 外部编辑，按需）

**借什么**：内容哈希 + 父节点 → 位置回退 → ±2 DFS 内相似度；匹配不上进 orphan 日志，不静默错配。

**Textus 现状**：AI 提案用块 id（内容哈希）定位；外部编辑靠 mtime/reload；同步冲突靠文件级副本。若未来出现「AI 提案在用户编辑后大量失效」或「外部编辑后块级锚点丢失」的真实问题，再引入块匹配，先只用于 AI 锚点，不用于同步合并。

**成本**：spike 2–3 天。**风险**：不要把它变成文件级三路合并的替代；Textus 的冲突副本更安全。

### C. 只看不做（参考）

- **C1. TODO/DOING/DONE + 任务面板**：资产任务有 `inbox/active/blocked/done`，不需要 outl 的文本前缀；但「DOING 优先、分组、封顶 + 总数」可借鉴。
- **C2. week strip / 内联反链 / 命名空间页**：如果「今天」做日历条、如果反链接到 UI、如果标签要层级，这三样是现成交互参考；当前不做。
- **C3. reminders / quiet hours**：资产「触发」是阶段触发，不是时间提醒；若将来做定时提醒，outl 的「日期链接不自动变提醒 / snooze 跨设备 / 免打扰」是成熟口径。
- **C4. 文件传输经验**：若将来支持 iCloud/Syncthing，outl 的「不要用点开头路径（iCloud 跳过）/ 每设备独立 actor 文件避免 LWW 冲突」是踩过的坑；当前 S3/WebDAV 不需要。

### D. 不建议吸收

| #   | 不吸收                      | 理由                                                                                         |
| --- | --------------------------- | -------------------------------------------------------------------------------------------- |
| D1  | 树 CRDT + op log + iroh P2P | 与《同步方案》已裁的文件级三路 + 用户自有存储冲突；换模型 = 重写同步、迁移、冲突中心、移动端 |
| D2  | outliner Markdown 方言      | 破坏 CommonMark/Obsidian 兼容与 roundtrip；`key::`/`TODO` 前缀/块 handle 是第二套语法        |
| D3  | TUI 客户端                  | 与当前主线（桌面小改 + 手机 + 资产）无关；TUI 是一等公民的投入不是小项目                     |
| D4  | Rust 单一色板替换 CSS 主题  | Textus 的 Typora 兼容主题/导入导出是生态优势；可借对比度守卫，不借所有权模型                 |
| D5  | Boa 插件运行时              | Textus 的沙箱/RPC/贡献点更成熟；换运行时没有收益                                             |
| D6  | 任意文档的块级合并          | 文件级冲突副本更安全；块合并只适合纯大纲，不适合任意 Markdown                                |
| D7  | 「静默收敛、不弹冲突」      | 只适用于 CRDT 能确定性合并的块树；Textus 的文件可能被任意编辑器改，冲突必须可见              |
| D8  | 把 outl 当路线图            | outl 是单点精品工具，Textus 是工作台；它的「不做」清单与 Textus 的「要做」清单不重合         |

---

## 6. 与当前任务线的落点

| 任务线           | 可吸收项                                              | 建议动作                                                                                            | 触发/依赖  |
| ---------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------- |
| S3 内置移动端    | A5 首帧/不持锁核查；A1 手机能力裁决；A3 今天/收集规则 | S3 开工前把 A5 核查表过一遍；手机同步状态/错误用 A1 的口径                                          | S3         |
| D1 资产闭环      | A1、A2、A4、A3；B1（D1c 之后）                        | D1a/D1e 用有界列表契约；D1b 确认流借「拒绝要到达每个 surface」；D1c 七工具先内部，再评估 MCP server | D1         |
| D2 受控写入      | A1、A2；outl 的 `outl-actions` 分层作为参考           | 资产状态迁移/校验放 Rust，界面与插件只调用；拒绝目录进 Rust                                         | D2         |
| ED1 块与呈现     | B4 查询/任务 fence；A6 插件治理                       | Mermaid 试点后，用 `contributes.codeBlocks` 做查询/任务块                                           | ED1        |
| PH3/PH4 手机核查 | A1、A3、C2                                            | 用 A1 的「missing → 替代路径」检查每个手机缺项；A3 检查今天/收集                                    | PH3/PH4    |
| S5 同步硬化      | A2 Vault Doctor；A5                                   | 把 doctor 的只读检查接进同步/资产设置；S5 的校验结果用用户语言呈现                                  | S5         |
| 插件线           | A6、B4                                                | manifest 增 API 版本；catalog 安装记录 lockfile；查询/任务块用 codeBlocks                           | 随插件工作 |

---

## 7. 风险与边界

1. **Thin fork 优先**：以上吸收项优先做插件或新增模块；碰宿主的按《薄fork魔改原则》记 patch 清单。outl 是 MIT，代码可借，但**设计/机制优先于代码**——两边栈不同，搬代码的维护成本高于重写。
2. **outl 是年轻项目**：单人主导、文档极强、实现有已知限制（HLC 手写、无因果交付、Yrs undo best-effort、op log 规模、移动端配对仅 CLI、无 E2EE）。不要因为它文档写得好就假设实现无坑；吸收前按本仓门禁实测。
3. **MCP server 是新的攻击面**：默认关闭、只限本机、限定 vault、只读起步、写只走提案；不要把 `files.write` 直接暴露给外部 agent。
4. **稳定身份（尤其块身份）会引入旁车匹配复杂度**：先做文档身份的 spike，证明 rename / 历史收益；块身份等具体场景，不要为了「未来可能有用」背一套 orphan / doctor / 匹配机制。
5. **不要把 outl 的「不做」当 Textus 的「不做」**：outl 不做 Notion/团队/Web，是因为它选择单点精品；Textus 的工作台/资产/多端是另一条路。反过来，也不要把 outl 的「做」当 Textus 的「该做」。
6. **文案与 i18n**：A1/A3 的 nudge/替代路径必须进 10 个 locale；不要内联英文。

---

## 8. 证据索引

**outl（本地 `C:\Project\ref\outl-analysis`）**

- `README.md`、`DESIGN.md`（1040 行，视觉规范）、`UX.md`（774 行，交互规范）、`CLAUDE.md`（15 条不变式）
- `docs/architecture.md`、`docs/crdt.md`、`docs/sync.md`、`docs/markdown-format.md`、`docs/cli.md`、`docs/mcp.md`、`docs/client-parity.md`、`docs/plugins.md`
- `crates/outl-core/src/{op.rs,tree/}`、`crates/outl-md/src/{parse.rs,sidecar.rs,matching.rs}`、`crates/outl-actions/src/{lib.rs,refusal/}`、`crates/outl-shortcuts/src/support.rs`、`crates/outl-plugins/src/manifest.rs`、`crates/outl-cli/src/mcp/`
- 官方文档：<https://outl.app/docs/why-outl.html>、<https://outl.app/docs/architecture.html>、<https://outl.app/docs/crdt.html>、<https://outl.app/docs/sync.html>、<https://outl.app/docs/markdown-format.html>、<https://outl.app/docs/tui.html>、<https://outl.app/docs/cli.html>

**Textus / Skein（本仓）**

- `docs/skein/02-方案/{Textus-改造方案,同步方案,Textus-Agent工具契约,Textus-界面改造方案}.md`
- `docs/skein/03-调研/{Agent基座与竞品调研,插件API要点,界面现状盘点}.md`
- `src/platform/capabilities.ts`、`src/editor/markdown/doc-blocks.ts`、`src/plugins/api-permissions.ts`、`src/plugins/store/manifest-types.ts`、`src/plugins/contributions/code-blocks.ts`
- `src-tauri/src/mcp/`（client）、`src-tauri/src/ai/tools/`（propose_edit 等）、`src-tauri/crates/textus-sync/src/{planner.rs,engine.rs}`
- `src/phone/PhoneHome.tsx`、`src/settings/pages/SyncPage.tsx`、`docs/dev/ios-code-map.md`

---

## 9. 修订记录

| 版本 | 日期       | 变化                                                                            |
| ---- | ---------- | ------------------------------------------------------------------------------- |
| v1.0 | 2026-11-20 | 首版：源码/功能/界面三层对照，A/B/C/D 四档吸收清单，与 S3/D1/D2/ED1/PH3/S5 落点 |
