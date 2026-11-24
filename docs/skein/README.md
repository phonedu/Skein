# Skein 文档入口

> 给人，也给 AI 代理：**本仓的产品规划、界面目标、任务进度和裁决只看 `docs/skein/`；上游 `docs/dev/` 只回答工程上怎么做。**

## 先看

| 我要…             | 读                                                          |
| ----------------- | ----------------------------------------------------------- |
| 现在做什么         | [STATUS.md](STATUS.md)                                      |
| 找某份文档         | [INDEX.md](INDEX.md)（生成，按类型和状态分组）              |
| 找某条裁决         | [decisions/README.md](decisions/README.md)（按 ID 查）      |
| 找某个方案         | [INDEX.md](INDEX.md) → `specs/`                             |
| 上游新界面怎么适配 | [specs/界面契约.md](specs/界面契约.md)（令牌、桌面/手机模式、图标档位、屏幕索引） |
| 发版传什么、插件要不要打包 | [discipline/发布上传流程.md](discipline/发布上传流程.md)（安装包、插件资产、上传与校验） |
| 全部命令           | [COMMANDS.md](COMMANDS.md)（生成，按类别）                  |
| 工程上怎么做       | [AGENTS.md](../../AGENTS.md) → [CONTRIBUTING.md](../../CONTRIBUTING.md) → `docs/dev/` |
| 查历史             | [archive/README.md](archive/README.md)                      |

## 自动化

| 我要…             | 命令                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| 开始任务 / 看上下文 | `npm run docs:task -- start D1e`；`npm run docs:context -- D1e`     |
| 记一句承诺         | `npm run docs:capture -- "以后要…"`                                  |
| 收工               | `npm run docs:wrap`（inbox 清零 + audit + docs:check）               |
| 归档 / 草案        | `npm run docs:archive -- <spec>` / `docs:propose -- <spec>`          |
| 外部评审           | `npm run docs:review -- <id> --base <ref>`                           |
| 每周审计           | `npm run docs:audit`                                                 |
| 补任务六行         | `npm run docs:task -- brief D1e --problem … --expected … --standard … --not … --scope … --evidence …` |
| 完成并归档         | `npm run docs:task -- done D1e --evidence "命令 / 输出 / commit"`   |
| 新裁决 / 方案 / 调研 | `npm run docs:new -- decision "标题"`（spec / research 同理）       |
| 找东西             | `npm run docs:find -- "关键词"`                                      |
| 改完文档           | `npm run docs`（生成 STATUS / INDEX / 命令 / 裁决索引并检查）        |
| 体检               | `npm run docs:doctor`                                                |
| 跟上游 tag         | `npm run upstream:status` → `upstream:plan -- vX.Y.Z`；步骤见工程菜谱 R5 |
| 上游 PR 候选       | `upstream:ticket` / `upstream:patch` / `upstream:gate`               |
| 发 release note    | `release:new` / `release:check` / `release:build -- X.Y.Z`           |
| 日常收尾 / 发布前  | `npm run verify` / `npm run verify:full`                             |

全部命令按类别列在 [COMMANDS.md](COMMANDS.md)。`STATUS.md` 由 `status.yaml` 生成；`INDEX.md`、`COMMANDS.md`、`decisions/README.md` 也由脚本生成；都不要手改。

## 三条定位

1. **软件在这里改。** 本仓是 `CatVinci-Studio/Textus` 的下游工作仓；`src/`、`src-tauri/` 就是要改的软件本体。上游只跟 release tag，流程见 [discipline/publishing-gate.md](discipline/publishing-gate.md)。
2. **规划只在 skein。** 产品方向、界面目标、进度、全部裁决，唯一来源是本目录。与任何上游文档冲突时，skein 赢——不许用“上游是这么做的”替代已裁事项。
3. **上游文档只当工具书。** 根 `AGENTS.md`、`CONTRIBUTING.md`、`docs/dev/*` 照常有效，但只回答“工程上怎么做”；上游的规划、release notes、进行中的重构都不是我们的路线图。

## 文档类型

| 目录 / 文件         | 放什么                                             | 生命周期                         |
| ------------------- | -------------------------------------------------- | -------------------------------- |
| [STATUS.md](STATUS.md) | 当前工作线、Now/Next、阻塞与触发点                | 唯一进度源；完成项当日删除       |
| `specs/`            | 在办、提案、暂缓、冻结的方案（一份方案一个真相）   | 改方案改这里；不做完不归档       |
| `decisions/`        | 一条裁决一个不可变小文件，编 ID                    | 只增不改；推翻用 `supersedes`    |
| `research/`         | 调研、评审、现状快照                               | 结论被采用后搬进 specs，本文件冻结 |
| `discipline/`       | 长期遵守的纪律与操作步骤                           | 改规则改这里；不写进度           |
| `archive/`          | 已关闭的件、里程碑证据、历史切片                   | 冻结，只增不改                   |

## 新文档放哪

- 产品/界面/同步的新方案 → `specs/`；一次决定 → `decisions/NNNN-*.md`；调研证据 → `research/`；操作步骤 → `discipline/`；进度 → `STATUS.md`；关闭的件 → `archive/`。
- 每份活文档开头写 front-matter：`type`、`status`、`summary`、`updated`；当前真相类再写 `verified`。模板在 `_templates/`。
- 不写版本号、修订记录和手写目录；`git log` 是历史，`npm run docs:index` 生成索引。

## 三个不要

1. **不要把上游文档当成本仓的规划或任务**——上游的 roadmap、release notes、重构都不是我们要跟的东西。
2. **不要复活旧画板当目标**（2026-11-20 已删除）——界面以宿主现状为基，功能走插件。
3. **不要自行“沿用上游做法”替代已裁事项**——Base UI、设置浮层、单岛平铺、小改宿主＋插件优先等已裁；推翻任何一条 = 新增裁决并留档。

## 工程规矩

门禁、生成文件、i18n 十语言、测试分层以上游 `AGENTS.md` / `CONTRIBUTING.md` / `docs/dev/*` 为准；本仓多出来的操作（同步命令、插件页、设置、界面小改、跟 tag）写在 [discipline/工程菜谱.md](discipline/工程菜谱.md)。
