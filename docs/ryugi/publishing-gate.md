# 发布闸门：Skein 与上游的隔离

本仓是 `CatVinci-Studio/Textus` 的 fork。日常所有改动（代码、基线文档、画板、
任务清单）都发布到自己的 fork `phonedu/Skein`；上游只在接受 pull request 的
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

私有路径：`docs/baseline/`、`docs/ryugi/`、`.ryugi/`、`.githooks/`。
内部代号：`ryugi`、`skein`、`dsh`、`deepseek harness`、`baseline/`（链接形式，
专门拦公共文档里指向私有文档的链接）。中文：上游的文档、注释、提交信息都是
英文；豁免 `src/i18n/`、`e2e/`、`testdata`、`*.test.*`。

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
  不算我们的改动。`.github/` 出现在上游范围只警告不拦（AGENTS.md 禁改 CI，
  且 fork 的 token 没有 workflow scope，带了也推不上去）。
- 误报先例（都已修，遇到新的按同样思路改 CONFIG）：npm 版本串 `react@1.9.0`
  曾经被当邮箱（现在要求域名含字母）；`fixedShortcuts` 曾经撞上代号 `dsh`
  （现在纯词代号按词边界匹配）；git 对中文文件名的 quotepath 转义曾经让路径
  黑名单漏判（现在按 `-z`/解码处理）。

## 上游 PR 的唯一流程

**绝不从特性分支直接开 PR**——分支历史里混着私有提交（代码提交也会带上
`docs/ryugi` 的规格改动）。只有干净分支重建这一条路：

```bash
git fetch upstream
git switch -c pr/<主题> upstream/main

# 只带公共路径的净差异；私有路径与 CI 一律排除
git diff upstream/main...<特性分支> -- . \
  ':(exclude)docs/baseline' ':(exclude)docs/ryugi' ':(exclude).ryugi' \
  ':(exclude).githooks' ':(exclude).github' \
  | git apply
```

然后：

1. 按逻辑拆成几个提交，**提交信息英文**（上游风格见 `git log upstream/main`）。
2. 公共文件若引用了私有内容，把那几个 hunk 手工剥掉再提交——闸门会拦住
   提醒（先例：`docs/README.md` 加过指向 `baseline/` 的链接；`.gitignore`、
   `.prettierignore` 里的 `.ryugi/` 行同理）。
3. 用户可见的行为变化补 `docs/releases/next/` 下的 release note（英文，
   新文件，不是改 `docs/releases/X.Y.Z.md`）。
4. `node .githooks/gate.mjs upstream --range upstream/main..pr/<主题>` 全绿。
5. `git push origin pr/<主题>`（推的是 fork；钩子会再扫一遍）。
6. `gh pr create --repo CatVinci-Studio/Textus --base main
--head phonedu:pr/<主题> --title "..." --body-file ...`——英文描述，
   bug 附**复现步骤**，PR 里说明验证过什么（`npm run check`、构建方式）。

## 永不上上游的清单

- `base-ui-settings` 分支的全部内容：Base UI 设置页重建、界面改造、画板。
- 已规划的后续功能改动（见 `docs/baseline/Textus-改造任务清单.md`）。
- `docs/baseline/`、`docs/ryugi/`、`.ryugi/`、`.githooks/` 目录本身。

上游只收：与本 fork 私有改造无关的 bug 修复与小改进，且按上面的流程重建。

## 一次性审计（2026-11-16 建闸时）

对 Skein 上已有的 `paper-and-ink`、`strategy-docs`、`ui-alignment` 三个分支
跑过 fork 模式隐私扫描（`origin/main..<分支>`）：**全部干净**，无邮箱、手机号
或密钥。今后如再发现命中，先报告再决定是否重写历史，不擅自 force-push。
