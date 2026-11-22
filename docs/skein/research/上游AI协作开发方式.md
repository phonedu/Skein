---
type: research
status: reference
summary: 上游 AI 协作与文档自动化做法
updated: 2026-11-23
---
# 上游的 AI 协作开发方式（参考）

> 日期：2026-11-20
> 调研对象：上游 Textus 仓库，调研时检出 `pr/document-sheet`（`v1.4.6-rc.2+21`）。设计类文档以 **v1.4.5** 为基线；v1.4.5→rc.2 之间 `docs/design/`、`docs/archive/` 无变化，`docs/dev/` 有 15 篇更新。
> 性质：**参考，不是裁决，不是纪律**。本仓的 AI 协作规则仍以 [AI协作纪律](../discipline/AI协作纪律.md) 为准；与 skein 冲突时 skein 赢。
> 方法：读入口文档、开发手册、检查脚本、CI 与 PR 模板、提交历史。没有上游的私人会话与提示词，因此只记录仓库里能看到的做法；"作者私下怎么跟 AI 对话"不在证据范围内。

## 结论先行

1. **入口只有一份。** `AGENTS.md` 是所有 AI 工具的说明书；`CLAUDE.md` 只有两行，指回它；`CONTRIBUTING.md` 欢迎 AI 写的 PR，但要求人读懂每一行并说明测了什么。
2. **文档写成 runbook。** `docs/dev/recipes.md` 把七类常见改动写成步骤；`reuse.md` 规定每个需求只有一个实现位置；`code-style.md` 每条规则后面写"谁检查"；`testing.md` 写清七层测试与 CI。
3. **评审规则脚本化。** `check:quick`（改什么查什么）→ `check`（全量）→ `check:native`（Rust）→ `check:all`（含 e2e）；`check:repo` 有 15 项仓库检查；`guard-ci-config` 防止 fork 改 CI 让自己通过。
4. **人保留作者身份与合并权。** 一个 release 一个 PR、squash merge、普通英文 commit、禁止 "generated with" / `Co-authored-by`（除非给外部贡献者署名）；maintainer 合并前要有另一个有写权限的人读过；owner 管 tag、签名和密钥。
5. **AI 的痕迹是有的，只是不写进历史。** 2026-07-13 有 10 个 commit 带 `Claude-Session:` trailer；`releasing.md` 后来明确禁止这类 trailer。看不到 trailer 不等于没用 AI。

## 一、入口：一份说明书，所有工具共用

`AGENTS.md` 开头：

> We use AI coding assistants on Textus ourselves, and so do some of our contributors. This file is what we hand them: where things are, and the few rules that have gone wrong before and must not again.

它只有约 6.6 KB，分三块：

| 块               | 内容                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where things are | 任务→文档的索引：setup/检查/代码风格、架构、recipes、reuse、documents、testing、releasing、iOS、设计标准、全部文档                                                                                      |
| Rules            | 分支/PR、跑检查、不许改 CI 或测试让自己过、先复现再修、真机验证、生成文件不许手改、指针拖拽、e2e 插件依赖、代码形状、启动层、十语言、Rust/TS 共享形状、界面 token、iOS 门控、WebView2 105、release note |
| Safety           | 密钥、别用安装版 Textus 测、别指向真实用户数据、别 `rm -rf` 变量路径、别驱动桌面、updater 名称、别动签名/发布流程                                                                                       |

`CLAUDE.md` 全文只有：

> Read `AGENTS.md` and follow it: it is this repository's guide for AI coding assistants, kept in one place for every tool.

`CONTRIBUTING.md` 的 AI 条款：

> Written with an AI assistant? Welcome - but read and understand every line, and say what you tested. AI assistants read `AGENTS.md`.

调研时没有找到第二套 Cursor/Copilot 专用规则文件。规则只有一处，换工具不用换说明——这是整个做法的地基。

## 二、文档写成 agent 的 runbook

不是"设计文档写得更细"，而是把高频动作写成可执行步骤：

| 文档                                   | 作用                                                                                                      | 对 agent 的意义                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `docs/dev/recipes.md`                  | 加设置、加菜单项和快捷键、加后端命令、加 UI 字符串、加插件 API、加 e2e 测试、平台代码放哪，七类操作逐步写 | 不用每次在对话里重新交代"这个仓库怎么加一个设置"     |
| `docs/dev/reuse.md`                    | 每个常见需求只有一个实现位置                                                                              | 防止 AI 复制一份新的实现                             |
| `docs/dev/code-style.md`               | 每条规则后面写"谁检查"；只能人工看的标 `_review_`                                                         | 规则不是口号，能落到命令或 review 清单               |
| `docs/dev/testing.md`                  | 测试分七层，哪层放什么、怎么跑、CI 怎么排，还写了"故意不覆盖什么"                                         | agent 能自己选对测试层，而不是全量乱跑               |
| `docs/dev/triage.md`                   | 新手 issue 固定写 What / Files / Done when / How to test / Out of scope / Size                            | 给人和 agent 同一套边界                              |
| `.claude/skills/textus-theme/SKILL.md` | 一个签入仓库的 Claude Code skill：主题怎么做、三块 light/dark 结构、坑、验证命令                          | 把"领域 runbook"做成可加载的 skill，而不是塞进总说明 |
| `docs/dev/plugins/skill/SKILL.md`      | 面向插件作者的 AI skill，带 `textus.d.ts` 参考                                                            | 连产品文档都按 agent 可读来组织                      |

要点：**文档的读者不只是人。** 每篇都在回答 agent 的下一步做什么、做到什么算对、什么时候该停。

## 三、评审规则脚本化

上游没有靠"请 AI 注意代码风格"，而是让违规直接失败：

| 命令           | 范围                                                                           |
| -------------- | ------------------------------------------------------------------------------ |
| `check:quick`  | 全量 typecheck；只对改动文件跑 lint、prettier、相关单测；再跑 `check-versions` |
| `check`        | typecheck、lint、全部单测、`format:check`、`check:repo`                        |
| `check:repo`   | 15 项仓库检查（见下）                                                          |
| `check:native` | `rustfmt --check`、`clippy -D warnings`、`cargo test`                          |
| `check:all`    | `check` + `test:e2e` + `check:native`（发布前）                                |

`check:repo` 的 15 项：

- `check-readmes`（九种语言的 README 结构与链接）
- `check-links`（所有 Markdown 的相对链接）
- `check-code-shape`（单文件 500 行、每组件/自定义 hook 8 个 hook、provider id 不许出适配器）
- `check-sizes`、`check-layout-reads`、`check-text-sizes`
- `check-design-values`（颜色/阴影/圆角走 token，间距 4 点网格；例外要写 `design: allow` 和理由）
- `check-field-shapes`（输入框是圆角矩形，不是胶囊）
- `check-hover`（只在可悬停设备上画 hover 底色）
- `check-cycles`、`check-duplicates`（导入环、复制代码）
- `knip`（未使用的文件/导出/依赖）
- `check-versions`、`check-nsis-template`、`updater-manifest check`

还有 `scripts/guard-ci-config.mjs`：**fork 的 PR 只要碰 `.github/` 或测试配置就失败，而且 CI 跑的是 base 分支的这份脚本**，改不了它让自己通过。CI 在每次 PR 上跑 `check`、Chromium+WebKit 的 e2e、`src-tauri/` 变更时的 Linux native 检查，以及 `ci-config`；发布前再跑全平台原生构建。

AI 功能另有 `scripts/live-eval.mjs`：真实 provider、默认不跑（测试 `#[ignore]`）、有预算与 baseline，`compare` 能看出哪些用例开始/停止通过。

这套东西的实际效果：**AI 写完自己跑，红了就改。** 人不需要反复指出"这个文件太长了""这个颜色没走 token""这个输入框画成胶囊了"；人把精力放在"为什么做"和真机上。

## 四、人的位置

| 规则                 | 内容                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 一个 release 一个 PR | 维护者把一批工作收进一个分支、一个 PR；贡献者的 PR 原样进 `main`，他们再接手收尾                                               |
| Squash merge         | PR 的标题和描述成为 `main` 上的那一个 commit，所以按 commit message 来写                                                       |
| 普通英文句子         | 现行规则明确不用 Conventional Commits；正文说"旧行为为什么错"，不重述 diff                                                     |
| 禁止 AI 署名         | "No 'generated with' trailers, and no `Co-authored-by` except to credit an outside contributor whose work the commit carries." |
| 两人 review          | maintainer 合并前，CI 要过，且另一个有写权限的人读过；code-owned 路径等 owner                                                  |
| Owner 边界           | 只有 owner 能推 `v*` / `ios-v*` tag、改签名/发布密钥和仓库设置                                                                 |
| PR 模板要证据        | `npm run check` 过没过、在哪个平台试过、可见改动给截图/录屏、有没有 release note 片段                                          |
| 原生行为人来验       | 窗口栏、红绿灯、拖拽区、全屏、带菜单项的 `Cmd` 快捷键、文件对话框、输入法——浏览器看不出来，PR 里要写清楚跑了什么               |

从提交数看，ChengAo Shen 有 2,111 个提交，占绝大多数。这是一套**"一个主笔 + AI 批量产出 + 发布火车"**的流程，不是大团队评审流程。

## 五、实际使用 AI 的痕迹

2026-07-13 有 **10 个 commit 带 `Claude-Session:` trailer**，都指向同一个 Claude Code 会话：

| commit                 | 内容                                         |
| ---------------------- | -------------------------------------------- |
| `1b2224aa`             | 多文档标签页与跨窗口拖拽                     |
| `6fe1c589`             | 白名单 raw HTML 渲染，点击编辑源码           |
| `ff2ce8ec`             | 成对行内 HTML 标签原位渲染                   |
| `55e263e1`             | GitHub 风格 alerts                           |
| `816cbb52`             | File 菜单的 New File / Open Recent / Save As |
| `4fd81314`             | 删除全选内容时保留 enclosure 外壳            |
| `a9c9026f`             | README 未签名构建说明                        |
| `f5c4d66f`             | CI 立即发布 release，不先 draft              |
| `0413e8fe`、`97564444` | 0.5.0 / 0.5.1 版本号                         |

trailer 原文是 `Claude-Session: https://claude.ai/code/session_01WmX8oXeteGuuQxbbwpy4tT`。后来 `docs/dev/releasing.md` 明确禁止 "generated with" 和 `Co-authored-by`，所以后面的提交看不到这类痕迹——**这不等于不用 AI，只是不把 AI 写进历史，人对每一行负责。**

另外两个可见物：

- `.claude/skills/textus-theme/SKILL.md` 是 Claude Code skill 格式（frontmatter 有 `name` / `description`，正文是主题的三块 light/dark 规则、常见坑、验证命令）。本 fork 也继承了这份文件。
- `docs/dev/plugins/skill/SKILL.md` 是给插件作者的 skill，带 `references/textus.d.ts`。说明作者会把重复出现的领域知识做成 agent 可加载的 runbook。

很多 commit body 像 agent 的工作报告：编号列原因、每项"lowest layer 的测试"、结尾 checkboxes。但**从提交风格推断作者身份不可靠**，这里只当旁证。

## 六、与本仓对照：借什么、不借什么

先看现状：

| 维度       | 上游                                          | 本仓                                                                    | 判断                   |
| ---------- | --------------------------------------------- | ----------------------------------------------------------------------- | ---------------------- |
| 入口       | `AGENTS.md` + `CLAUDE.md` + `CONTRIBUTING.md` | `AGENTS.md`（含 Skein fork note）+ `CLAUDE.md` + `docs/skein/README.md` | 已有；skein 优先       |
| 工程手册   | `docs/dev/` 39 篇                             | 随 v1.4.5 携带；3 篇已删 `design-language` 链接                         | 工具书，继续跟随 tag   |
| 操作菜谱   | `recipes.md` 七类                             | 多为方案/裁决，缺"怎么做"的步骤                                         | **可借**               |
| 检查       | 15 项 `check:repo` + CI + `guard-ci-config`   | 有上游检查，无 skein 专属检查                                           | **可借模式，不搬脚本** |
| 纪律       | 多会话、路径提交、不署名                      | 《AI协作纪律》已有任务六行、完成四行、多会话红线、不署名                | 对齐                   |
| 领域 skill | `textus-theme`、`plugin` skill                | 只继承了 `textus-theme`                                                 | **可加**               |
| 合并节奏   | 一人主笔 + release train                      | fork 跟上游 tag + 手机/同步批次                                         | 不照搬                 |

再看不借的：

| 做法                                  | 判断     | 原因                                                          |
| ------------------------------------- | -------- | ------------------------------------------------------------- |
| 15 个检查脚本原样搬                   | **不借** | 绑死上游 `docs/design/`、文件布局和设计标准；薄 fork 维护不起 |
| 一个 release 一个 PR                  | **不借** | 我们的节拍是跟 tag、手机批次、同步线，不是单一发布火车        |
| AI 署名 trailer                       | **不借** | 本仓已裁决不采用；上游现在也禁止                              |
| `design-language.md` / `docs/images/` | **不借** | 已删，裁决 29 后退出权威链；别按它改界面                      |
| 把 AI 当自动合并者                    | **不借** | 上游始终人 review、人合并、人发布；AI 只做执行                |

可以借的四件事，按优先级：

1. **仓库即提示词 / runbook。** 给本仓的高频操作写步骤：加一个同步命令、加一个插件页/动作、加一个设置/菜单项/字符串/测试、写 release note。候选放 `research/` 或经裁决的工程文档；不要塞进《改造方案》当路线。
2. **把重复的 review 意见变成 fork-local 检查。** 例如 skein 文档相对链接、裁决编号唯一性、任务清单的证据格式。单独 PR 做，不改现有 CI/测试来"让检查过"——这和 `AGENTS.md` 的红线一致。
3. **领域 skill。** 例如 `.claude/skills/skein-sync/`、`skein-ui/`，把同步协议、界面裁决做成可加载的 runbook；只放"怎么做"，不放路线和裁决。
4. **PR / 收尾证据模板。** 把《AI协作纪律》的"完成四行"绑到 PR 模板和任务清单，减少"都通过了"这种合并汇报。

本仓的《AI协作纪律》已经在多会话安全、路径限定提交、任务六行/完成四行上比上游更细；上游这套补的是**自验证环境**和**菜谱型文档**。两者互补，不冲突。

## 附录 A：上游 AI 与插件机制摘要

> 以下只是上游设计文档的摘要，**不是我们的路线**。本 fork 已删 `docs/design/` 与 `docs/images/`，不要按它们改界面。

| 文档                                                                                      | 内容                                                                                          | 对我们的读法                                        |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `design/ai-concepts.md`（434 行）                                                         | 项目文件夹、文风档案、资料库、写作要求、技能等术语，含中/日名称、优先级、用户在哪见到         | 抽术语对照表，统一宿主 AI 名称和 i18n 文案          |
| `design/ai-agent.md`（124 行）                                                            | provider/agent loop/工具分层、一次请求的状态、edits 即 tool call、memory/MCP                  | 工程事实参考；摘要即可                              |
| `design/ai-proposals.md`（523 行）                                                        | 提案从流式参数到采纳/拒绝的完整生命周期、块 id、状态机、margin 视图、连续请求边界、关闭后保留 | **最值得用**：D1 资产确认流接的就是这台既有提案机   |
| `design/ai-paper.md`（367 行）                                                            | 长文 Agent：研究→大纲→并行起草→审阅→成稿，及已建/待建清单                                     | 本 fork 当前不做；将来做多阶段 Agent 再看           |
| `design/ai-eval.md`（115 行）                                                             | 真实 provider 评测：套件、自动检查、judge、预算、baseline                                     | 方法可借；不搬用例                                  |
| `design/plugins.md`（303 行）                                                             | 插件贡献点、生命周期、沙箱、权限、设置页、扩展来源、实施顺序                                  | 补《[插件API要点](插件API要点.md)》的"为什么/边界"  |
| `design/design-language.md`（517 行）                                                     | 上游设计标准：token、色彩、字体、布局、动效、组件、可访问性、主题、插件页、评审清单           | **不读、不搬**；已删，裁决 29                       |
| `archive/2026-10-ai-eval-rounds.md`（1,438 行）、`archive/2026-10-ai-tokens.md`（288 行） | 前四轮评测记录、token 测量与浪费清单                                                          | 方法可查；数字基于 1.2.0-rc.2，套件已删，别引用数字 |

## 附录 B：证据清单

| 证据             | 位置                                                                             | 说明                                                    |
| ---------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 代理入口         | `AGENTS.md`、`CLAUDE.md`                                                         | 一份说明书；CLAUDE 只指路                               |
| 贡献规则         | `CONTRIBUTING.md`                                                                | AI PR 欢迎，但要读懂每行、说明测试                      |
| 发布/合并        | `docs/dev/releasing.md`                                                          | 一个 release 一个 PR、squash、普通英文、禁止 AI trailer |
| 角色             | `docs/dev/roles.md`                                                              | 两人 review、owner 管 tag/密钥                          |
| 分诊             | `docs/dev/triage.md`                                                             | 新手 issue 六段式                                       |
| 代码风格         | `docs/dev/code-style.md`                                                         | 规则→检查脚本；`_review_` 人工项                        |
| 测试             | `docs/dev/testing.md`                                                            | 七层测试、CI、故意不覆盖                                |
| 菜谱             | `docs/dev/recipes.md`                                                            | 七类常见改动                                            |
| 检查命令         | `package.json` 的 `check*`、`scripts/check-*.mjs`、`scripts/guard-ci-config.mjs` | 15 项仓库检查与 CI 守卫                                 |
| PR 模板          | `.github/pull_request_template.md`                                               | 证据清单                                                |
| 领域 skill       | `.claude/skills/textus-theme/SKILL.md`、`docs/dev/plugins/skill/SKILL.md`        | 签入仓库的 agent runbook                                |
| Claude Code 提交 | `git log --all --grep='Claude-Session'`                                          | 2026-07-13 的 10 个 commit                              |
| 作者分布         | `git shortlog -sn --all`                                                         | ChengAo Shen 2,111 个提交，一人主笔 + AI 放大           |

复现命令：

```sh
git -C <upstream> log --all --grep='Claude-Session' --format='%h %ad %s' --date=short
git -C <upstream> shortlog -sn --all
```
