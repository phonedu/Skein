# 任务清单归档（2026-11-19，2026-11-20 追加 S2 主体与 H3）

> 来源：`docs/skein/05-状态/Textus-改造任务清单.md` v1.10。
> 本文只作历史，不再维护；新任务与进度回[任务清单](../05-状态/Textus-改造任务清单.md)。
> 迁出原因：已完成项与封存线长期占着进度文档，导致“最新状态”失真；2026-11-19 重排，完成项与封存线整体迁入本文。
> **2026-11-19 后续**：文档一致性回写已完成；现行[任务清单 v2.1](../05-状态/Textus-改造任务清单.md)（含 S/H/PH/D1e/D1f 与待审区）是进度真相；本册只覆盖迁出时的 v1.10 与 2026-11-19 迁出记录。
> **2026-11-20 旧画板已删除**：本文中 `ui-*` 画板名与行号仅作历史引用；`04-boards/` 已不在仓库。

## 1. 已完成（有证据）

### 1.1 界面对齐（ui-alignment）

8 任务落地 `0247c068`→`90680cb1`；截图当时入 `boards/shots/`，boards 清理时已删，证据以提交号为准；尺寸表见《界面改造方案》§2.2。

### 1.2 设置页重建（base-ui-settings）

| # | 任务 | 证据 |
| --- | --- | --- |
| — | 第一批 8 片 | `ab2d3381`→`431d6045` |
| A1 | 提交第二轮打磨（工作仓 31 个未提交文件） | 2026-11-16 `4b813b8e`（typecheck ✓，eslint 16 文件 0 问题，vitest 51/51）；含 About 页入浮层、插件页防重挂载、导航分组折叠、搜索 Escape 停在输入框、`plugin-tab.css` 迁宿 |
| A2 | About 页（「关于 / 检查更新」）迁移收尾 | 随 A1 `4b813b8e`；`about.css` 已建，深链 `updates` → About 页并立即检查 |
| A3 | 逐页迁移其余设置页 | 2026-11-16 全部落地（各先红后绿 + e2e `settings-pages` 11/11 两轮）：编辑器 `10ba112b` · 快捷键 `703fc9c5` · 图片 / 导出 / 隐私 / AI 四页（本支，`PageGroup` 支持组头动作、`onClose` 透传）；插件详情页无迁移面（裁决 9） |
| A5 | 图标统一 | 2026-11-16 盘点：浮层图标全部来自图标集（lucide 一套）；设置胶囊下拉箭头已换 `ChevronIcon`（本支） |
| A6 | 深色专项走查 | 2026-11-16 打包实例（`tauri build --debug`）实景走查；深色由 token 翻译 + 对比度测试守卫；debug 构建读 `settings.dev.json` |
| A7 | 文案补写 | 2026-11-16 对照审计：旧页 10 条 help 全部保留（6 条升级为新 description，4 条在保留的行组件内），零丢失 |
| A10 | 单岛平铺 | 2026-11-16 `40590519`：`islandsPlain(zen, paneCount)`（单岛/Zen 平铺，split 保留浮卡），先红后绿 `islands-plain.test.ts`；页签仍在窗栏带 |
| A11 | 默认主题基色对齐画板 | 2026-11-16 `40590519`：纸 #fbf8f2 · 墨 #241f19 · 火 #b0531f + 画板 muted/line 随行（code 底取 #f6f1e8 保火色 4.5:1）；深色夜纸不变（裁决 16）；护栏 = `theme-palette.test.ts` + 对比度测试 |

### 1.3 上游跟随

| # | 任务 | 证据 |
| --- | --- | --- |
| B1 | 取下上游更新，本地 `main` 快进 | 2026-11-16：fetch v1.4.3-rc.1..rc.4 四 tag，`main` = `e16f3c87`（书签，不作基线） |
| — | v1.4.3–v1.4.5 并线 | 2026-11-18 `c467a7b5` 合 v1.4.3–1.4.5，基线自 v1.4.5 起；后续测试修正 `df1138b3`、`87deb180` |

### 1.4 插件第一片：收集入口（E 组，D1 打头）

E0–E4 全部完成；规格已归档 [2026-11-17-collect-plugin.md](2026-11-17-collect-plugin.md)。证据摘要：

| # | 切片 | 证据 |
| --- | --- | --- |
| E0 | 工作区 | textus-plugins 已检出；skein-plugins 仓已立（`b9b8e32` 脚手架）；cli check ok；插件 id `skein.collect` |
| E1 | 骨架与激活 | manifest：engines `>=1.4.2` · platforms 桌面+iOS · 权限最小集 `[files.read, files.write]`；cli check 零警告 |
| E2 | 收集核心 | host.js：capture → ui.form → `inbox/N-*.md`（无 type，重名 stat 回落）；单测 6/6；e2e 1/1（`e2e/collect-plugin.spec.ts`） |
| E3 | 快捷键 ⌘⇧C | 宿主快捷键页有插件命令组（`shortcuts.tsx`）；`mod+shift+c` 未占用 |
| E4 | 实景走查与收尾 | 打包 exe（`tauri build --debug`）+ CDP 实景：⌘⇧C 唤起表单 → 真磁盘 `inbox/N-20261117-d5f3.md` 核对无误；走查后数据目录已还原 |

### 1.5 手机端已完成的基础批次（仍在继续的线，仅记已完成部分）

- 手机首页、编辑器栏、sheet、返回手势、元素一致性等批次已推（提交记录见 `git log`；具体 release 以发布记录为准）。
- 2026-11-19 的“重设计合并概念”已归档，不推进；手机线继续按裁决 29/30/31 走。
- **PH1 手机格式工具栏（2026-11-19，完成）**：常驻主条六键＋就地面板 ×2＋插入面板 2×5＋选中浮条；表格/图片上下文排；「更多」菜单减法；源码模式 heading/list/clear 事件通路；图片选择器经 `textus-files` ContentResolver 实际插入通过。真机华为 PKT0220512001548 全项验收；单测 7/7＋45/45，typecheck/eslint/prettier/build 过（启动 chunk 918KB，手机条 lazy）。§2.5 四项结论：task-list/sink/lift 已补；INSERT_BLOCK 全集核过；`selectionchange` 用 rAF 合并；原生块菜单「剪切块」仍待裁。
- **PH1c 手机工具栏手感修正（2026-11-19，完成）**：选中浮条离选区 96 → 36px；`+` 面板撤「更多」改 3×3 九键；主条加 AI 键（配图 / 续写 / 检查语法），AI 走与文本/列表相同的 `.pf-panel` 就地面板、不再弹窗；剪切 / 全选 / 复制纯文本交回系统选区菜单；`buildPhoneMoreItems` 只返回 `aiItems`。真机通过，桌面右键不动。
- **PH1b 工具栏面板形态返工（2026-11-19）**：按《手机端工具栏改造方案》§2.6 完成——文本/列表改就地面板（本地 `panel` state、`.pf-panel` 浮主条上方 6px、键盘不退选区不丢、同键收/另一键切/点正文收、`aria-expanded`）；插入面板撤 `Sheet`/抓取条/取消钮，改 fixed chrome 层占键盘位（`keyboardCovered()` 快照、`insert-open` 豁免 `.keyboard-up`、主条抬起）；主条与面板 `onMouseDown` 保焦点；「更多」菜单减插入表格/查找替换（AI 两样留）。真机华为 PKT0220512001548 五项验收过；附 `SourceEditor` focus 注册 + `focusDocument` 显式回焦、选中浮条左缘 `half=156`。证据并入 PH1 条。

### 1.6 同步设计件（S0，2026-11-19）

| # | 产物 | 结论 |
| --- | --- | --- |
| S0a | [同步 supersede 裁决](../01-纪律/同步supersede裁决.md) | 内置同步是 fork 产品能力，不推翻上游；插件先多端、内置后接管；六条安全线 + 四个退出条件 |
| S0b | [同步协议 v1](../02-方案/同步协议-v1.md) | `/1` 冻结：布局、常量、JSON、scope、写入不变量、发布顺序、锁、加密、签名 best-effort、v2 硬切条件 |
| S0c | [插件 spike 计划](../02-方案/同步插件spike计划.md) | 三条轨（App Documents / 所有文件 / SAF 边界）、通过标准、华为清单、S3 → WebDAV、H9 仅轨 B 触发 |
| S0d | [同步方案](../02-方案/同步方案.md) | 内置架构、多库、transport、宿主钩子、迁移/回滚、UX、安全、验收矩阵、S2–S6 阶段；收口 06 开放问题 |

S0 完成 = 同步设计门已开；S1 spike 仍以 H1–H8 与插件 manifest 加 Android 为前置。

### 1.7 宿主前置已完成

- **H7 S3 403/ListBucket + 重定向策略（2026-11-19，完成）**：插件 README 写清 prefix 条件化的 `s3:ListBucket` 与对象权限，403 由 `permissionRead/Write` 给可操作错误；重定向已由宿主 `plugins/http.rs` 的 reqwest 策略限制（≤5 跳、目标必须在 `network:` grant 内，跨 host 即停），无需插件参数。
- **H4 锁 create 修复（2026-11-19，完成于插件源）**：`create(LOCK)` 移入 `try`，异常/412 读回锁，只接管自己 id 的锁；`engine.test` 覆盖“create 写后抛 412 接管”与“他人锁不抢”；`textus-plugins` 本地 `skein-sync-prep` 提交 `0aaac07`，上游 PR/fork 待授权。
- **H5 状态修正（2026-11-19，完成于插件源）**：`status.ts` 在冲突后、时间前返回 `statusPartial`；十语言 manifest 已补；`status.test` 2/2；host 已持久化 `last:<key>`；同提交 `0aaac07`。
- **H2 移动端 App 管理 trash（2026-11-19，完成）**：`src-tauri/src/trash.rs` 把删除移到 App 私有 `trash/<id>/` + `record.json`（original/root/name/is_dir/deleted_at），同卷 rename、跨卷 copy→remove；`tree_trash_entry` 与 `plugin_fs_trash` 移动端共用，桌面仍系统回收站；真机行菜单删除后 Documents 无文件、trash 记录正确；单测 2/2。
- **D0 Android 真机读写验证（2026-11-19，完成）**：Documents 普通路径（无权限）下新建/改/删/重命名全过；自动保存 2s 落盘；删除进 App trash + record.json；外部改文件触发「文件已在磁盘上被修改」取消/重新加载/覆盖，自动保存不覆盖；不支持项 = 后台同步、SAF 任意目录、系统 Trash、插件多端。
- **H1 Android 默认库 = App Documents（2026-11-19，完成）**：清装首启首页直接显示 `getExternalFilesDir(Documents)`（`/storage/emulated/0/Android/data/com.catvinci.textus/files/Documents`），无 SAF 授权；空库 CTA 直接命名建文件、2s 自动保存、行菜单重命名/删除均过；图片 content URI 已由 `textus-files` `pick_image` + `read_data` 解决。手机无 Save 命令，自动保存强制开启。
- **H6 打开文件处理（2026-11-19 核）**：`useExternalChangeReload` 已在 `FILE_WRITTEN_EVENT` 时只读相关 tab；干净 tab 经 `takeDiskText` 原地重载（一次 undo，AI 对话保留），脏 tab 继续 defer；`external-change.test.ts` 覆盖插件通知与 patch。无代码改动，任务本身早已落地。

### 1.8 同步插件多端 spike（S1，2026-11-19 完成 WebDAV 轨）

| 项 | 证据 |
| --- | --- |
| Android 插件可运行 | manifest `platforms: ["desktop","ios"]`（Android 走 iOS 运行时，`8d57c7c`）；设置 › 扩展 › 插件 › 云同步页面在华为 PKT0220512001548 完整渲染 |
| 真机上传/下载/删除/改名/冲突/杀进程 | 全部通过；含 16 MiB PDF（8×2 MiB 块）、App trash 删除、锁残留提示 + `清除遗留锁`、冲突副本 `Sync conflicts/phone-note2 (9efe122e).md` |
| 桌面官方插件读同一远端 | portable 隔离构建的 0.6.1 插件下载手机上传的 5 个文件；桌面改文件后手机下载到改动 |
| S3 | 未跑通：s3rver 不支持 `If-None-Match: *` 条件写，插件按设计中止；转 S1b（真实 S3/MinIO/R2） |
| 轨 A / 轨 B | 未跑；U1 维持 App Documents 普通路径，H9 仍条件任务 |
| 报告 | [同步插件多端 spike 报告](../03-调研/同步评审/spike-报告.md) |
| 插件提交 | `skein-sync-prep`：`8d57c7c` Android、`4874d4c` 安全补丁、`175b53c` 改名不误判批量删除 |

### 1.9 手机插件入口 / 同步状态（H8，2026-11-19）

| 项 | 证据 |
| --- | --- |
| 首页插件入口 | `PhoneHome` 顶栏加插件按钮（Puzzle），直达 设置 › 扩展 › 插件；真机华为 PKT0220512001548 通过（`8bef239f`） |
| 首页同步状态 | 搜索框下显示插件状态条（如“尚未同步”），点击同样进插件页；真机通过 |
| 宿主动作 | `layout.tabs` 供插件判断打开文件；`onDidSave` / `onDidRename` / `onDidChangeRoot` 已存在；同步写入走 broker 的 `FILE_WRITTEN_EVENT`，外部改重载链路已覆盖 |
| 未做 | 编辑器页状态（首页已满足 H8 的“首页/编辑器”二选一）；正式 open-docs 注册表留 S2 |
| 测试 | `PhoneHome.test` 14/14；Android debug APK 真机验收 |

### 1.10 真实 S3 轨（S1b，缤纷云 S4，2026-11-19）

| 项 | 证据 |
| --- | --- |
| 条件写 | 同一 key 第二次 `If-None-Match: *` PUT 返回 412；插件 `测试连接` 通过 |
| 首次同步 | 5 个文件（含 16 MiB PDF）；16 MiB 的 8 个块同哈希，只存 1 个块 |
| 修改 / 下载 | 手机改 → 远端 revision 更新；模拟桌面改 → 手机下载到新文本 |
| 冲突 | 本地保留原位，远端进 `Sync conflicts/phone-note3 (b3eabdb7).md` |
| 删除 | 本地删除后同步，head 移除该文件 |
| 杀进程 | 远端留锁；重启提示锁；`清除遗留锁` 后重跑完成 |
| 32 MiB 随机 PDF | 16 块，逐块 SHA-256 与 head 一致 |
| 配置 | `https://s3.bitiful.net`、`cn-east-1`、专用测试桶、测试 prefix、path-style |
| 未跑 | 七牛云 Kodo、阿里云 OSS（转 S3b） |

### 1.11 同步内置桌面主体（S2 第一至七片，2026-11-20）

> S2 尚未完成验收（built app 实跑、20k/弱网、真机跨端），这里只归档已落地的实现片段；未完成项留在任务清单 §3。

| 片 | 已完成 | 证据 |
| --- | --- | --- |
| 第一片 | `src-tauri/crates/textus-sync`（无 Tauri）：Manifest/History/Lock/Base/Entry、路径 scope、2 MiB 分块/SHA-256、冲突命名 | wire 测试 15/15 |
| 第二片 | `ObjectStore` + `MemoryStore` + `WebDavStore`（父目录 MKCOL、临时 PUT + MOVE create、probe）；planner 三路矩阵与远端 rename | 24 单测 + WebDAV 真服务 round-trip |
| 第三片 | 引擎（锁、head/history、三路 plan、块传输、冲突、发布顺序、释放锁、空扫描/批量删除闸）；`S3Store` SigV4 条件 create | 33 单测 + WebDAV/S3 真服务 round-trip |
| 第四片 | 文件系统 `LocalFiles`（scope、原子写、系统/App trash、move）；portable built app 对真实 WebDAV 上传/下载 | 构建记录 |
| 第五片 | 设置 › 同步页；`sync.json` + 所有者-only `sync_secrets.json`；base/last 按文件夹持久化 | built app WebDAV 保存后上传 |
| 第六片 | 冲突副本列表、云端历史版本列表与恢复 | built app WebDAV 验证 |
| 第七片 | 四路审计后的阻塞修复：冲突保留本地并上传、`remoteMissing`、WebDAV prefix 父目录、HTTP 仅回环/禁重定向/超时、锁读回/own-lock/字节读回 + `sync_lock`/`sync_unlock`、history 稀释/限额/keep/损坏即停、块读回、expected-hash 与打开页延后、restore 语义、大小写冲突、trash 老化、no-op 不发布、移除 `sync_run` 凭据后门；设置页解锁/脏表单/provider 凭据/Android 参数/错误映射/十语 | `23f7738f`、`c62b035e`、`5bb727bb`、`7f991874`；[任务清单 v4.1–v4.3 记录](../05-状态/Textus-改造任务清单.md) |
| 引擎级差分互通 | 插件 `MemoryStore` 写库 → Rust 读出并下载 3 文件字节一致；Rust 写库 → 插件读出并下载一致（中文路径、`.textus/agent.md`、附件） | 2026-11-20 临时夹具（双向通过，夹具已删） |
| 故障注入单测 | head 写失败 → `publishFailed` 且锁保留，重试不重复历史；块损坏 → `missingBlock` 不落盘；假锁 → `lockLost` 不写 head | `5bb727bb` |
| S3b 内置适配 | `S3Flavor::Oss`（`x-oss-forbid-overwrite`、409→已存在、400→`conditionalWriteUnsupported`）；设置页 S3 兼容方式 | `7f991874`；阿里云/七牛真桶未实测 |

### 1.12 空扫描 / 大批删除保护内置侧（H3，2026-11-20）

- 引擎与插件同判据：base 非空而 scan 为 0 → `emptyScan`；删除 >20% 或 >50 个 → `bulkDelete`；单个删除不算批量；改名不误判。
- 设置页在 `emptyScan` / `bulkDelete` 后弹「仍要同步」二次确认，确认后同一轮带 `allowEmptyScan` / `allowBulkDelete` 重跑。
- 插件侧 2026-11-19 已完成（`dcb19b1`，156/156）；内置侧单测覆盖。
- 交互验收（built app 实际点击「仍要同步」）并入任务清单 §3 的 S2 验收尾项，不重复立任务。

### 1.13 已决事项（从待审移出）

| 项 | 原问题 | 结论 |
| --- | --- | --- |
| U16 | S2 UI 范围：只 Settings + notice，还是含状态/冲突/历史 | 已执行：Settings + 状态/冲突/历史（S2 第五、六片，`9da3efb9`、`7ba2655a`） |

---

## 2. 封存 / 不推进

### 2.1 任务组 C：新 IA 十屏（2026-11-17 封存，裁决 29）

**本组整体停工：界面路线改为小改宿主＋插件优先，十屏 IA 推迟至 D0.5 验证后。下表与各段留档，作为将来重启 IA 时的输入，不再维护。** 壳改动已删（`1c8e6377`，−939 行）。

原裁决（2026-11-16，已被裁决 29 修订）：十屏画板 = 目标界面，按屏开工、不设“等阶段 0.5”的总门。各屏的数据依赖照下注记。

| # | 界面 | 复用机制（§7.7） | 新增（§7.5） | 画板 | 数据依赖 |
| --- | --- | --- | --- | --- | --- |
| C1 | 今天视图（先只读聚合） | 侧栏 tab 注册 | 四分组：进行中 / 该用资产 / 待确认 / 最近 | `ui-d-today` | D1 聚合数据 |
| C2 | 触发式资产提示 | — | 按阶段匹配，不靠搜索 | —（并入各屏） | 七工具（契约 v0.3） |
| C3 | 快速收集 | 命令注册 | 单输入框存 `inbox`，不选类型 | `ui-d-collect` | inbox 存储（D1） |
| C4 | 确认中心 | Webview 视图 | 列表 / diff / 证据三栏 | `ui-d-confirm` | D1 状态机 |
| C5 | 资产详情 | Webview 视图或编辑器接管 | 三段式：内容 / 证据 / 历史 | `ui-d-assets` | D1 状态机 |
| C6 | Agent 时间线 | 现有 AI 容器 | 每次调用一张卡片 | `ui-d-agent` | 七工具 |
| C7 | 手机四入口 | 抽屉与 ActionSheet | 底部四入口 + Agent 悬浮 | `ui-p-a` / `ui-p-b` | 壳可先行；收集 / 确认动作依赖 D1 |
| C8 | 平板适配 | — | A9 收敛后 | — | — |

**曾记录的可开工面（仅供重启时参考）**：笔记屏（A10 单岛平铺；视图状态条 `b7cd9df8`；侧栏三段部分落地：最近段 + 库段标题，标签段等应用侧元数据出口）；设置屏（浮层已落地）；导航壳与浮层机制（壳已删）。**笔记屏 front matter 条已裁决关闭（选 B，2026-11-16）**：维持 `.frontmatter-block` 可编辑原块。**侧栏轨道整合**：工作区页签保持「文件」；轨道整合随插件迁设置二级一并做。

**今天页 v3 立项（2026-11-17）**：v2 = 骨架占位；v3 切片 = 队列行组件（最近笔记组先实数据）、组计数徽章、内容区空态卡、Agent 列随 C6。**随 C 组封存，未开工。**

**裁决 26–28 实现注记（随对应屏落地）**：资产 / 判断 meta 行派生标注「未验证 · 观察期 · 复查」（数据随 D1）；桌面资产详情「记一次使用」（裁决 27）；任务 done 门槛引导（裁决 28，随 C1）。

**先不做**（§7.8）：自定义首页、拖拽看板、图谱视图、多套布局主题、墨契式浮层格式条（等上游落地后在其事件管线上叠层）。

**手机端（裁决 30）**：宿主手机界面被判「把桌面界面原样塞进手机」，按成熟移动形态改造——Android 线（iOS 归上游不做），fork 侧默认不提上游。该线已从 C 组独立为当前工作线，见任务清单。

### 2.2 界面重设计合并概念（2026-11-19 归档；已删除）

用户决定不推进；旧归档已于 2026-11-20 删除（只保留当前界面方向）。

---

## 3. 旧清单的过期 / 重复项（迁出时说明）

| 项 | 旧清单状态 | 2026-11-19 纠正 |
| --- | --- | --- |
| B2 | “等 v1.4.3 正式 tag” | v1.4.3–v1.4.5 已并线（`c467a7b5`）；下一节拍 = v1.4.6 |
| D0 | “Android + iOS 真机” | fork 裁决 30：iOS 归上游；D0 改为 Android-only |
| D1 | ☐ | E 组收集已收口，D1 应为 ◐；剩余 = 资产列表 + 确认流 + Agent 工具 |
| A4 | 两行（☐ / ◐） | 保留一行 ◐（空态 / 载入态） |
| 手机端 | “第一片 = 截图盘点” | 已推多批（首页 / 编辑器栏 / sheet / 返回手势 / 元素一致性）；当前焦点 = 裁决 31 格式工具栏 |
| 当前分支 | “22 提交在 95bd872f 之上” | 计数已漂移；按日期/基线记，不按提交数 |
| C 组 | 仍在清单中占大段 | 已迁入本文 §2.1；任务清单只留一行指针 |

---

## 4. 历史修订记录（v1.0–v1.10）

| 版本 | 日期 | 变化 |
| --- | --- | --- |
| v1.0 | 2026-11-16 | 首版：五份基线文档任务化；A1 以门禁实证记为 ◐；B1 完成（rc 系列取下、main 快进 e16f3c87） |
| v1.1 | 2026-11-16 | A1/A2 记 ☑（第二轮打磨已提交 `4b813b8e`）；新增 A10 单岛平铺（出处：《界面改造方案》§4.3 裁决 12） |
| v1.2 | 2026-11-16 | 界面主线定档：十屏画板 = 目标界面，按屏开工、撤销“等阶段 0.5”总门，C 组加画板与数据依赖两列；近期顺序改为 A10 打头；D0.5 复用率结算口径写明；boards 清理：`directions/` `skeleton/` `shots/` `skins/` 删除，只留 `screens/` |
| v1.3 | 2026-11-16 | 十屏评审裁决 14–25 落档（《界面改造方案》§4.4，含动效对照表）；画板源值修订 + PNG 全量重渲染替换；新增 A11 默认主题基色对齐画板（裁决 14/16） |
| v1.4 | 2026-11-16 | 三文档对齐复核：布局零改动；裁决 26–28 实现注记入 C 组；《改造方案》§7.2 ASCII 与 §11 卡片命名措辞对齐画板 |
| v1.5 | 2026-11-17 | 路线修订（裁决 29，《界面改造方案》§4.6）：小改宿主＋插件优先；C 组封存；壳删除 `1c8e6377`（−939 行，轨道回宿主原样）；手机端挂 D0/D3 触发点；D1 升为主力；《现状→目标映射》迁 archive（旧映射后已删除） |
| v1.6 | 2026-11-17 | E 组立表（D1 第一片）：收集入口插件五切片；规格 = `specs/2026-11-17-collect-plugin.md`；依赖关系行修正（D0.5 不再是插件前置）；两项待裁决随规格带默认值 |
| v1.7 | 2026-11-17 | E0–E3 ☑：收集入口插件建成（skein-plugins 仓 4 提交；单测 6/6、cli ok、e2e `collect-plugin.spec` 1/1）；两项已裁（type 省略 / N- 前缀）；插件 id 正名 `skein.collect`；e2e 需把插件拷进检出 `plugins/skein.collect`；E4 待实景 |
| v1.8 | 2026-11-17 | E4 ☑，E 组收口：打包实例实景走查过（⌘⇧C 绑定唤起 → 真磁盘 inbox 笔记核对无误；CDP 法）；数据目录已还原；规格迁 archive；skein-plugins 推远端待用户建仓 |
| v1.9 | 2026-11-17 | 裁决 30，手机端开工：触发提前；Android 线（模拟器 Xiaoshidan_API35 + `tauri android dev`，iOS 归上游）；形态原则 = 成熟移动形态、桌面元素不上手机；工程前置齐；第一片 = 现状截图盘点 → 两栏清单 |
| v1.10 | 2026-11-18 | 裁决 31，手机端格式工具栏改判：横滑格式栏废，按墨契三件套重建（主条六键＋就地面板×2＋选中浮条＋插入面板）；规格立册《Textus-手机端工具栏改造方案》；《改造方案》§7.8 范围澄清为桌面、判定不变 |
