---
type: discipline
status: active
summary: 向上游推送、开 PR 的发布门禁
updated: 2026-11-23
---

# 发布闸门：Skein 与上游的隔离

本仓是 `CatVinci-Studio/Textus` 的 fork。日常所有改动（代码、skein 文档、
STATUS）都发布到自己的 fork `phonedu/Skein`；上游只在接受 pull request 的
意义上存在，而且**只有当我说"这个能上上游"时才碰**。本文是这件事的唯一流程。

## 拓扑

| 远端       | 地址                                        | 用途                 |
| ---------- | ------------------------------------------- | -------------------- |
| `origin`   | `git@github.com:phonedu/Skein.git`          | fork，一切推送的目标 |
| `upstream` | `git@github.com:CatVinci-Studio/Textus.git` | 只 fetch，PR 的 base |

提交身份只用数字 noreply：`phonedu <135960865+phonedu@users.noreply.github.com>`
（已配 `--local`；Gitee 身份绝不出现在 GitHub 提交里）。

## 两条红线

| 方向                           | 绝不允许出现                              |
| ------------------------------ | ----------------------------------------- |
| 推 `origin`（Skein，公开仓库） | 真实邮箱、手机号、任何密钥/token          |
| 上游方向（PR 分支）            | 上表全部 + 私有路径 + 内部代号 + 中文内容 |

私有路径：`docs/skein/`、`.ryugi/`、`.githooks/`。内部代号：`ryugi`、`skein`、
`dsh`、`deepseek harness`。中文：上游的文档、注释、提交信息都是英文；豁免
`src/i18n/`、`e2e/`、`testdata`、`*.test.*`。

## 闸门机制

- `.githooks/gate.mjs` 是闸门本体；`.githooks/pre-push` 在每次 `git push` 时
  按远端分流（origin → 隐私扫描；upstream → 全量），`git config core.hooksPath
.githooks` 已配好。
- 手动跑（开上游 PR 前必跑）：
  ```bash
  node .githooks/gate.mjs upstream --range upstream/main..pr/<主题>   # 必须全绿
  node .githooks/gate.mjs fork     --range origin/main..<分支>        # 推 fork 前自查
  ```
- 规则表（路径黑名单、词表、豁免）是 `gate.mjs` 顶部的 `CONFIG` 常量；改词表
  就是改那里，别绕过。
- 树对比按 merge-base 语义（同 `git diff A...B`）：上游前进带来的"假回退"
  不算我们的改动；**内容与提交信息只扫我们自己写的提交**（以 `upstream/main`
  为分界），同步 main 不会因为上游自带的测试邮箱、dependabot 签名误报。
  **提交作者/提交者邮箱始终全量检查**：只放行 GitHub noreply 形式和
  `upstream/main` 历史里已有的身份（本来就公开），别的（比如某台机器全局
  git 配置里的私人邮箱）一律拦下。
- `.github/` 出现在上游范围只警告不拦（AGENTS.md 禁改 CI，
  且 fork 的 token 没有 workflow scope，带了也推不上去）。
- 复活检测（只对 fork 推送跑；上游方向的分支本来就带着上游自己的这些文件，
  不是复活）：`CONFIG.absentPaths` 是 fork-clean 提交刻意删除的
  上游文件清单（目录项连上游往后新增的同类文件也盖住），每次 fork push 核对
  它们不得出现在当前树——哪次同步把死重带回来，push 直接红。处置 = 重新删除；
  上游同类**新**文件把路径记进 absentPaths 再推。
- 上游同步 rebase（流程见《改造方案》§12.5 / §12.7）：`rerere.enabled` 已开
  （本机 git config）——对被删文件的冲突解法第一次记录、其后自动复用；与
  absentPaths 合起来是「死重删一次就不再回来」的两半。
- 误报先例（都已修，遇到新的按同样思路改 CONFIG）：npm 版本串 `react@1.9.0`
  曾经被当邮箱（现在要求域名含字母）；`fixedShortcuts` 曾经撞上代号 `dsh`
  （现在纯词代号按词边界匹配）；git 对中文文件名的 quotepath 转义曾经让路径
  黑名单漏判（现在按 `-z`/解码处理）。

## 上游工单（动手前先写，写进汇报开头）

给上游开 issue、改代码、开 PR、回 review，都先写这一段并贴进汇报；缺哪行先补
哪行，不先动文件。**用户没点明仓、分支、文件时，这段就是 AI 的默认归属声明**
——推断不出来或与用户原话冲突，先问，不猜。

```text
目标：issue / 代码 / PR / review 回复（可多选）
仓：C:\Project\Textus-upstream（上游唯一工作克隆）
基线：git fetch origin 后的 origin/main @ <commit>
分支：pr/<slug>（从基线新开；不复用旧 PR 分支；不推 main）
关联：上游 issue #N（有就写）；fork 对应提交 <hash> / 发布 <tag>
文件：确切路径，逐个列
行为：用户可见的变化；哪些现有行为不能变
验证：命令 / 测试 / 人工步骤
```

**默认归属**（用户没说"改哪里"时按此判断，仍要先写出推断）：

| 用户说的                         | 仓                           | 分支             | 基线                           |
| -------------------------------- | ---------------------------- | ---------------- | ------------------------------ |
| 我们这边、手机、界面、设置、打包 | `C:\Project\Textus`          | 当前分支         | 当前 HEAD                      |
| 上游、给上游、PR、issue          | `C:\Project\Textus-upstream` | 新建 `pr/<slug>` | fetch 后的 `origin/main`       |
| 两边都要                         | 先在上游克隆做               | `pr/<slug>`      | `origin/main`；合并后回灌 fork |

例（2026-11-19 的 #735）：

```text
目标：代码 + PR
仓：C:\Project\Textus-upstream
基线：origin/main @ 8b911c18
分支：pr/code-block-caret
关联：fork 提交 6de73418；上游 PR #735
文件：src/editor/drawn-caret-plugin.ts、e2e/drawn-caret.spec.ts、
      docs/releases/next/code-block-caret.md
行为：代码块回车后自绘光标落在新行；公式/图片后的光标位置不变
验证：e2e/drawn-caret.spec.ts；tsc；ESLint/Prettier；闸门
```

**issue / 分支 / PR 的对应**（一个主题一份，不混）：

- bug 修复：可直接开 PR；上游已有 issue 就写 `Fixes #N`。
- 新功能或行为变更：先开 issue，达成一致再开分支（上游 CONTRIBUTING 的路子）；
  没把握就开 draft PR。
- 分支名 `pr/<slug>`，一题一分支；两个修复就两个 PR（先例：2026-11-19 的
  #734 格式嵌套、#735 代码块光标）。

## 上游 PR 的唯一流程

**不在本仓里开上游分支，也绝不从特性分支直接开 PR**——本仓历史混着私有提交，
公共文件（AGENTS.md、docs/README.md、.gitignore 等）也与上游分叉。给上游贡献
时，**另克隆一份上游仓库**（建议 `C:\Project\Textus-upstream`，需要时再克隆），
全程在克隆里做；本仓只负责把净差异导出成补丁：

```bash
# ① 本仓（C:/Project/Textus）里：导出净差异；私有路径与 CI 一律排除
git diff upstream/main...<特性分支> -- . \
  ':(exclude)docs/skein' ':(exclude).ryugi' \
  ':(exclude).githooks' ':(exclude).github' \
  > C:/Project/pr-<主题>.patch

# ② 上游克隆里：落地（地址见上方「拓扑」表）
git clone <上游的 SSH 地址> C:/Project/Textus-upstream
cd C:/Project/Textus-upstream
git switch -c pr/<主题>
git apply C:/Project/pr-<主题>.patch
```

然后按固定九步走，顺序不改：

1. **写「上游工单」**（上一节）；`git fetch origin` 后从 `origin/main` 新开
   `pr/<slug>`。旧克隆里的同名分支可能落后，不接用旧分支；不推 `main`。
2. **移植前先比基线**：`git diff origin/main:<file>` 与 fork `HEAD:<file>`
   不同，就按上游当前代码手工移植（2026-11-19 的 `drawn-caret-plugin.ts`
   就是上游已重构过），PR 里注明 `ported from fork <hash>`；**禁止整文件覆盖**。
3. 按逻辑拆成几个提交，**提交信息英文**（风格见克隆里的 `git log`）。
4. 公共文件若引用了私有内容，把那几个 hunk 手工剥掉再提交——闸门会拦住
   提醒（先例：`docs/README.md` 加过指向私有文档的链接；`.gitignore`、
   `.prettierignore` 里的 `.ryugi/` 行同理）。
5. 用户可见的行为变化补 `docs/releases/next/` 下的 release note（英文，
   新文件，不是改 `docs/releases/X.Y.Z.md`）。
6. **验证**：相关单测 + `npx tsc --noEmit` + ESLint/Prettier；碰到界面或
   e2e 的跑对应 spec。新增行为先确认「没有修复时测试会失败」。
7. 克隆里没有 pre-push 钩子，**手动跑闸门**（借本仓的脚本；克隆里上游就是
   `origin`）：
   ```bash
   node C:/Project/Textus/.githooks/gate.mjs upstream --range "origin/main..pr/<slug>"
   ```
8. 推到 fork 作为 PR head，再开 PR（fork 的 SSH 地址见「拓扑」表；闸门的
   邮箱规则会把命令行里的 `git@…` 当邮箱拦下，所以这里写占位符）：
   ```bash
   git remote add fork <Skein 的 SSH 地址>   # 一次性
   git push fork pr/<slug>
   gh pr create --repo CatVinci-Studio/Textus --base main \
     --head phonedu:pr/<slug> --title "..." --body-file ...
   ```
   英文描述：bug 附**复现步骤**、根因、验证过什么；有 issue 写 `Fixes #N`。
9. **合并后回填**：在上游 issue/PR 里留 fork 的对应提交/发布；fork 的
   STATUS或提交信息写上 upstream `#N`。fork 也需要同一改动而还没带的，
   从上游拿过来——**不再手写第二版**。

**禁止**：

- 从 fork 的特性分支直接开 PR，或在 fork 仓里建上游分支。
- 没 `git fetch` 就在旧的 `origin/main` 上开分支。
- `git apply` 前不比基线、整文件覆盖上游。
- 一个分支混多个主题；同一修复在两边各写一版、互不引用。
- 在克隆里改 `docs/skein/`、`.githooks/`、`.ryugi/` 等私有内容。

## 永不上上游的清单

- `base-ui-settings` 分支的全部内容：Base UI 设置页重建、界面改造（画板已于 2026-11-20 删除，仅留文档记录）。
- 已规划的后续功能改动（见 `docs/skein/STATUS.md`）。
- `docs/skein/`、`.ryugi/`、`.githooks/` 目录本身。

上游只收：与本 fork 私有改造无关的 bug 修复与小改进，且按上面的流程重建。

## 一次性审计（2026-11-16 建闸时）

对 Skein 上已有的 `paper-and-ink`、`strategy-docs`、`ui-alignment` 三个分支
跑过 fork 模式隐私扫描（`origin/main..<分支>`）：**全部干净**，无邮箱、手机号
或密钥。今后如再发现命中，先报告再决定是否重写历史，不擅自 force-push。
