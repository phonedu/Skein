# 插件 API 要点（阶段 1 · 资产插件参考）

> 来源：上游 `docs/dev/plugins/`（guide / reference / versions / pages / ui / permissions / testing / publishing）。
> 基线快照：v1.4.2（API 1.6）；上游 main（1.4.3-rc）已到 **API 1.7**——B2 拉 1.4.3 正式 tag 时插件引擎同步升级。
> 本页只记**阶段 1 资产插件要用的面**与上游新增要点；全量以本地 `docs/dev/plugins/reference.md`（由 textus.d.ts 生成）为准。

## 一、资产插件的形态（对《改造方案》附录 B.2 的落点复核）

七工具全部有现成通道，无需自建工具总线：

| 阶段 1 需求                  | 插件 API（main = API 1.7）                                                              | 备注                                         |
| ---------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| `search_notes`               | `metadata.all()` / `metadata.search(q)` / `metadata.get(path)`（files.read）            | 索引由 Textus 建好并保鲜，**不要自建索引器** |
| `resolve_assets_for_trigger` | `metadata.all()` 按 front matter `trigger.stage` 过滤 + `metadata.tags()`               | 只返回 active；缺 trigger 不出现             |
| `read_note`                  | `files.readText` + `metadata.get`（标题/链接/tags/tasks/front matter）+ `_history` glob | metadata 比逐文件读便宜                      |
| `create_draft`               | `files.create`（1.7 起带 `unique` 回落路径）+ `files.frontmatter.update`                | 目录守卫自己写（inbox/judgments/assets）     |
| `propose_patch`              | `files.processRead/processWrite`（token 版本化，冲突即停）——**不落盘提案存插件 store**  | 确认后才写；与内置 propose_edit 分工见 B.2   |
| `request_confirm`            | `ui.confirm`（宿主弹窗）+ pending 存 `ctx.storage.project`                              | 一次性语义自己保证                           |
| `record_use`                 | `files.frontmatter.update`（自带 token 重试，正好处理与用户编辑并发）                   | use_count 加、verified_count 不动            |
| 审计                         | `ctx.storage.project`（`.textus/plugins/<id>/`，随项目走）追加 `audit.jsonl`            | 只追加；损坏不影响卡片                       |

侧栏/页面壳：`contributes.sidebarTabs`（type list → `views.registerList`，Textus 代画列表/过滤/键盘）或 webview 页；
设置行用 `contributes.settings`（boolean/enum/…，Textus 代画）；确认弹窗 `ui.confirm/pick/form/withProgress`。

## 二、对资产闭环有影响的上游能力（按需取用）

- **`textus.text.splitFrontmatter`（1.7 新）**：正文/front matter 拆分官方化——front matter 条、字段级 patch 都用它。
- **`contributes.documentTypes`（1.4.3 新）**：自定义扩展名用 Textus 编辑器打开，`keep` 指定哪些语法按原样保存——资产卡若用非 .md 形态才考虑。
- **`contributes.embeds`（1.4.3 新）**：`![[…]]` 嵌入按类型由插件只读绘制——资产卡被 `![[` 引用时的预览出口（后期）。
- **`git.commit` 权限 + `textus.git`（API 1.7 新）**：走用户自己的 git 提交（hooks/签名保留）；历史读取 `git.log/show`。我们 `_history/` 拷贝方案不变，此能力作为可选增强待评估。
- **`hidden:<path>` 权限（1.4.3 新）**：点开头文件默认对插件关闭（`.git`/`.env`/密钥永不可命名）——`.textus` 例外可读。
- **`completions` 带 title 分组（main 新）**：`/` 面板分组提示——收集/晋升的 slash 入口可借此。
- **`ui.statusItem` + `contributes.statusItems`**：窗口栏状态（如「今天 · 3 条待确认」）。

## 三、工具链（textus-plugins 仓库，上游 main 新增）

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
- **B2 拉 1.4.3 正式 tag → 插件引擎升 API 1.7**；在那之前本地开发用基线 1.4.2（API 1.6）也能写出
  七工具的主体（1.7 新增项都不是七工具的阻塞项，除 `splitFrontmatter` 可用自家解析替代）。
- catalog 要求 manifest 显式 `platforms`；desktop-only 能力（background/schedule/agents）注意标注。
