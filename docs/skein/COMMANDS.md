# 命令速查

> 自动生成，勿手改。源：[`commands.yaml`](commands.yaml) + `package.json`；生成：`npm run docs:commands`。
> 操作步骤见 [`discipline/工程菜谱.md`](discipline/工程菜谱.md)；上游规则见 [`discipline/publishing-gate.md`](discipline/publishing-gate.md)。

## 文档

| 命令 | 说明 |
| --- | --- |
| `npm run docs` | 生成 STATUS / INDEX / 命令索引 / 裁决索引并跑全部文档检查 |
| `npm run docs:check` | 只检查生成页是否新鲜、链接、元数据和裁决 ID |
| `npm run docs:status` | 从 status.yaml 生成 STATUS.md |
| `npm run docs:commands` | 从 commands.yaml 生成 COMMANDS.md |
| `npm run docs:new` | 新建 decision / spec / research，自动编号、front-matter 和索引 |
| `npm run docs:task` | brief / start / done 任务；六行、归档和状态页一起完成 |
| `npm run docs:context` | 输出某个任务的 AI 上下文包（规格节 + 裁决 + 工程规矩） |
| `npm run docs:find` | 按关键词搜标题、摘要和正文 |
| `npm run docs:doctor` | 体检过期规格、重复标题、缺六行的任务和索引漂移 |

## 验证

| 命令 | 说明 |
| --- | --- |
| `npm run verify` | 文档检查 + release fragment 检查 + check:quick（日常收尾） |
| `npm run verify:full` | 文档检查 + release 检查 + check:all（发布前） |
| `npm run check:quick` | 只查改动文件：typecheck、lint、prettier、相关单测 |
| `npm run check` | typecheck、lint、全量单测、format、check:repo |
| `npm run check:repo` | 仓库检查，含 docs / release 生成物新鲜度 |
| `npm run check:native` | rustfmt、clippy -D warnings、cargo test |
| `npm run check:all` | check + e2e + native（发布前完整套件） |

## 上游

| 命令 | 说明 |
| --- | --- |
| `npm run upstream:status` | 当前基线、最新稳定 tag、领先/落后、patch 面、会被带回的 fork-clean 路径 |
| `npm run upstream:plan` | 规划一次 tag 合并（`-- <tag> [--fetch]`），列出重叠文件和步骤 |
| `npm run upstream:start` | 建 sync/upstream-<tag> 并 merge；默认 dry-run，`--apply` 才动 git |
| `npm run upstream:clean` | 删除 gate absentPaths 里被 merge 带回的 fork-clean 文件；默认 dry-run |
| `npm run upstream:verify` | 跑 check + check:native（`--full` 加 e2e），并打印 built app / Android 手测清单 |
| `npm run upstream:record` | 写 archive 合并记录，更新 status.yaml 的 baseline/commit |
| `npm run upstream:finish` | 把 sync 分支快进回工作分支并删除；`--apply` 才动 git |
| `npm run upstream:patch` | 导出上游 PR 候选补丁，排除私有路径、CI、`.claude` 和 fork-clean 文件 |
| `npm run upstream:ticket` | 打印「上游工单」草稿：仓、基线、分支、文件 |
| `npm run upstream:gate` | 手动跑发布闸门：`fork|upstream --range A..B` |

## 发布

| 命令 | 说明 |
| --- | --- |
| `npm run release:new` | 新建 release note fragment（`-- "slug" [--section Fixed]`） |
| `npm run release:check` | 校验 docs/releases/next 的 fragment 格式 |
| `npm run release:build` | 把 fragments 收进 docs/releases/X.Y.Z.md（`-- X.Y.Z`） |

## 构建 / 真机

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | Vite 开发服务器 |
| `npm run build:debug` | 打 debug 桌面包，验窗口栏、拖拽区、快捷键、文件对话框 |
| `npm run build:release` | 打正式桌面包 |
| `npm run android:dev` | Tauri Android 开发运行 |
| `npm run android:build` | 打 Android APK（debug） |

## 工程

| 命令 | 说明 |
| --- | --- |
| `npm run tauri` | 直接调用 Tauri CLI |
| `npm run bindings` | 生成 src/platform/bindings（生成文件，勿手改） |
| `npm run typecheck` | TypeScript 类型检查（应用和 node 配置） |
| `npm run lint` | ESLint，零警告 |
| `npm run format` | Prettier 写回 |
| `npm run format:check` | Prettier 检查 |
| `npm run test` | Vitest 全量单测 |
| `npm run test:e2e` | Playwright e2e |
| `npm run test:roundtrip` | Markdown round-trip 语料 |
