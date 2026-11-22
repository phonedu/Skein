---
type: research
status: reference
summary: 插件 API 七工具通道要点
updated: 2026-11-23
---
# 插件 API 要点（阶段 1 · 资产插件参考）

> 来源：上游 `docs/dev/plugins/`（guide / reference / versions / pages / ui / permissions / testing / publishing）。
> 基线快照：**v1.4.6-rc.3（API 1.9）**，2026-11-21 已并入（合并 `1d7cceff`）；下一稳定 tag = v1.4.6。API 1.6 = v1.4.2，API 1.7 = v1.4.3，API 1.8 = v1.4.4 起，API 1.9 = v1.4.6。
> 本页只记**阶段 1 资产插件要用的面**与上游新增要点；全量以本地 `docs/dev/plugins/reference.md`（由 textus.d.ts 生成）为准。

## 一、资产插件的形态（对《改造方案》附录 B.2 的落点复核）

七工具全部有现成通道，无需自建工具总线：

| 阶段 1 需求                  | 插件 API（现基线 = API 1.9）                                                                                                         | 备注                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `search_notes`               | `metadata.all()` / `metadata.search(q)` / `metadata.get(path)`（files.read）                                                         | 索引由 Textus 建好并保鲜，**不要自建索引器** |
| `resolve_assets_for_trigger` | `metadata.all()` 按 front matter `trigger.stage` 过滤 + `metadata.tags()`                                                            | 只返回 active；缺 trigger 不出现             |
| `read_note`                  | `files.readText` + `metadata.get`（标题/链接/tags/tasks/front matter）+ `_history` glob                                              | metadata 比逐文件读便宜                      |
| `create_draft`               | `files.create`（API 1.7 起带 `unique` 回落路径；现 1.9 可用）+ `files.frontmatter.update`                                            | 目录守卫自己写（inbox/judgments/assets）     |
| `propose_patch`              | `files.process`（token 版本化，冲突即停）——**不落盘提案存插件 store**；`processRead/processWrite` 是宿主 broker 内部名，不是插件 API | 确认后才写；与内置 propose_edit 分工见 B.2   |
| `request_confirm`            | `ui.confirm`（宿主弹窗）+ pending 存 `ctx.storage.project`                                                                           | 一次性语义自己保证                           |
| `record_use`                 | `files.frontmatter.update`（自带 token 重试，正好处理与用户编辑并发）                                                                | use_count 加、verified_count 不动            |
| 审计                         | `ctx.storage.project`（`.textus/plugins/<id>/`，随项目走）追加 `audit.jsonl`                                                         | 只追加；损坏不影响卡片                       |

侧栏/页面壳：`contributes.sidebarTabs`（type list → `views.registerList`，Textus 代画列表/过滤/键盘）或 webview 页；
设置行用 `contributes.settings`（boolean/enum/…，Textus 代画）；确认弹窗 `ui.confirm/pick/form/withProgress`。

## 二、对资产闭环有影响的上游能力（按需取用）

- **`textus.text.splitFrontmatter`（API 1.7 起，现 1.9 可用）**：正文/front matter 拆分官方化——front matter 条、字段级 patch 都用它。
- **`contributes.documentTypes`（API 1.7 起，现 1.9 可用）**：自定义扩展名用 Textus 编辑器打开，`keep` 指定哪些语法按原样保存——资产卡若用非 .md 形态才考虑。
- **`contributes.embeds`（API 1.7 起，现 1.9 可用）**：`![[…]]` 嵌入按类型由插件只读绘制——资产卡被 `![[` 引用时的预览出口（后期）。
- **`git.commit` 权限 + `textus.git`（API 1.7 起，现 1.9 可用）**：走用户自己的 git 提交（hooks/签名保留）；历史读取 `git.log/show`。**待审/触发点**：需要 Git 提交而非 `_history/` 拷贝时再评估；默认不做，`_history/` 方案不变。
- **`hidden:<path>` 权限（API 1.7 起，现 1.9 可用）**：点开头文件默认对插件关闭（`.git`/`.env`/密钥永不可命名）——`.textus` 例外可读。
- **`completions` 带 title 分组（已发布，现 1.9 可用）**：`/` 面板分组提示——收集/晋升的 slash 入口可借此。
- **API 1.9 新增（v1.4.6）**：`ai.stream`（预览）；`views.registerDatabaseView` / `databaseViews` / `renderDatabaseView`；`files.registerConventionReader`；`files.registerProvider` / `files.openFolder` + `textus.ssh`（预览，需 `ssh` 权限）；`contributes.folderDocuments`（文件夹作为一个文档打开——与 S2c 的稳定身份直接相关）。
- **`ui.statusItem` + `contributes.statusItems`**：窗口栏状态（如「今天 · 3 条待确认」）。

## 三、工具链（textus-plugins 仓库，当前检出）

- `examples/`：hello（命令+侧栏列表）、page（自绘页）、code-block、ai-tool——**资产插件从 page 或 hello 改起**。
- `packages/create-textus-plugin`：`node …/index.mjs my-plugin --from page --id <id>` 脚手架。
- `packages/textus-plugin/cli.mjs check <dir>`：manifest/API 静态检查（Textus 会拒绝或忽略什么，先说）。
- `test.mjs`：**Textus 替身**供插件写单元测试——七工具的领域逻辑（状态机/迁移校验）可脱离 Textus 测。
- 官方插件（Tasks/PDF Viewer/Zotero/Vim）在 `textus-plugins` 仓库，是活样例。

## 四、硬边界（guide「What a plugin can't do」）

不改编辑器 schema/渲染；不读他插件数据；不跑原生代码（agents 是外部程序）；越权即停
（不应答或每分钟 >10 错 → 自动关闭并告知）。`activate` 有 **10 秒**预算——别在其中 await
长任务。隐藏文件默认不可见；`.git`/`.env`/`.ssh`/密钥/他插件存储永不可命名。

## 五、版本与跟随注意

- 插件 `engines.textus` 声明 API 需求；Textus 不向不满足的版本提供插件。
- **B2 等稳定 tag v1.4.6**；当前基线 v1.4.6-rc.3（API 1.9），1.7–1.9 的能力已可用；七工具主体不依赖新版本，`splitFrontmatter` 等已在 1.7 起可用。`contributes.folderDocuments` 与稳定身份/S2c 一起评估。
- catalog 要求 manifest 显式 `platforms`；desktop-only 能力（background/schedule/agents）注意标注。
