# Android 移动端评审（子代理）

> 来源：子代理独立评审，2026-11-18；只读分析，未修改任何文件；未经逐条人工复核。
> 结论：**有条件可行，但“只加 `platforms: ["ios"]`”只在普通路径上成立；在 content:// SAF 上不成立。**
> 路径缩写：`[T]` = `C:/Project/Textus`，`[P]` = `C:/Project/textus-plugins`。

---

## 1. 结论

- 普通路径（`getExternalFilesDir(Documents)` 或“所有文件访问”授权目录）下：cloud-sync 的绝大部分 API 可直接跑，**唯一必然坏掉的文件 API 是 `files.trash`**；另有手机 UI 入口、后台、状态条三个产品缺口。
- content:// SAF 下：插件文件调用在宿主入口就被拒（`[T]/src/plugins/host/scoped-root.ts:15-21`，`[T]/src/plugins/host/broker.ts:376-380`），等于 0 可用；即使解禁，还有路径拼接、空扫描误判删除、非原子写、无 mtime、无 trash、二进制不可写等一串问题（见 §3）。
- 因此“插件先多端”的可行范围是：**普通路径 + 前台 + 文本与附件 + 不删远端（或先补 App trash）**。这足以完成一次真机 spike，但不足以完成 D3 的完整“收集→次日确认 + 冲突不静默覆盖”。
- 真正的多端长期形态仍应迁移到 Rust 内置，触发点是：**后台同步、SAF 任意目录、原子写与删除语义**，这四项在插件层都补不齐。

### 最小改动集（按优先级）

| # | 改动 | 位置 | 量级 | 是否 spike 必须 |
| --- | --- | --- | --- | --- |
| 1 | manifest 加 `"ios"` | `[P]/plugins/catvinci.cloud-sync/textus-plugin.json:13` | 1 行 | 必须 |
| 2 | Android 默认库指向 App Documents（普通路径，无需权限） | `[T]/src/platform/ios-files.ts:180-191`、`[T]/src/app/useOpenFolder.ts:92-118`、`[T]/src/platform/ipc-files.ts:49-60` | 2-3 人日 | 必须（否则只能用 SAF 或“所有文件”） |
| 3 | App 管理的移动端 trash，接到 `files.trash` | `[T]/src-tauri/src/atomic.rs:400-416`、`[T]/src-tauri/src/plugins/access.rs:292-306`、Kotlin | 3-5 人日（不含恢复 UI） | 只要测删除就必须 |
| 4 | 空扫描保护（base 非空而本地 0 文件时中止，不按删除处理） | `[P]/development/cloud-sync/src/engine.ts:151-170`、`src/planner.ts:35-58` | 0.5 人日 | 必须（防远端被清空） |
| 5 | 手机插件入口（状态/命令/面板） | `[T]/src/app/App.tsx:197-227`、`src/phone/PhoneHome.tsx:90-144` | 2-4 人日 | 建议（设置页可临时替代） |
| 6 | content:// 解禁 + 路径规范化 + 隐藏文件校验 | `[T]/src/platform/content-plugin-fs.ts:21-54`、`src/plugins/host/scoped-root.ts` | 3-5 人日 | 仅 SAF 路线需要 |
| 7 | Kotlin list/stat 返回 size/lastModified、二进制写 | `[T]/src-tauri/plugins/textus-files/android/src/main/java/TextusFilesPlugin.kt:186-243` | 3-5 人日 | 仅 SAF 路线需要 |
| 8 | 后台同步 | 需 Rust 内置 + WorkManager/前台服务 | 4-8 周 | 后置 |

---

## 2. 平台能力矩阵

图例：**可用** / **受限** / **不可用** / **需原生**。“普通路径”指 App Documents（`getExternalFilesDir(Documents)`，无需权限）或“所有文件访问”授权目录，两者对插件 API 能力相同，差别在授权方式。

| API / 能力 | 普通路径 | content:// SAF | 桌面 | 证据与说明 |
| --- | --- | --- | --- | --- |
| `files.root` | 可用 | 可用 | 可用 | content 下唯一不被 gate 的：`broker-files.ts:116` 直接返回 `p.folder()` |
| `files.list` | 可用（size/mtime 齐全） | 不可用（当前）→ 解禁后受限 | 可用 | gate：`scoped-root.ts:15-21`；解禁后 Kotlin 只列 3 列（`TextusFilesPlugin.kt:189-193`），`size=0, mtime=null`（`content-plugin-fs.ts:34-44`） |
| `files.stat` | 可用 | 不可用（当前）→ 解禁后受限 | 可用 | content 实现靠列父目录再按 URL 字符串比对（`content-plugin-fs.ts:46-54`）；调用方自行拼 content URL 时永远匹配不上（见 §3 P0-3） |
| `files.read` | 可用（Rust 原始字节） | 不可用（当前）→ 解禁后受限 | 可用 | content 走整文件 base64（`content-plugin-fs.ts:92-93`、`TextusFilesPlugin.kt:160-169`），无流式、无大小上限 |
| `files.write`（文本） | 可用且原子 | 不可用（当前）→ 解禁后受限 | 可用 | 普通路径 temp+rename：`src-tauri/src/atomic.rs:61-100`；content 只有 `openOutputStream("wt")` 截断写（`TextusFilesPlugin.kt:171-183`） |
| `files.write`（二进制/base64） | 可用 | **不可用** | 可用 | 显式抛错：`content-plugin-fs.ts:108-110` |
| `files.create` | 可用（`create_new`） | 不可用（当前）→ 解禁后受限 | 可用 | `src-tauri/src/plugins/files.rs:37-68`；content 为 stat→createEntry，竞态窗口（`content-plugin-fs.ts:115-119`） |
| `files.rename` | 可用（同卷 rename；跨卷在移动端失败） | 不可用（当前）→ 解禁后受限 | 可用 | 跨卷回退依赖 trash：`atomic.rs:302-316`（`try_trash` 在移动端恒 false）；content 用 `moveDocument/renameDocument`（`TextusFilesPlugin.kt:226-237`），provider 可能不支持 |
| `files.trash` | **不可用** | **不可用** | 可用 | 普通路径：`atomic.rs:400-416` 的 `#[cfg(not(desktop))]` 直接返回错误；content：`content-plugin-fs.ts:137-141` 显式抛错；`ipc-plugins.ts:149-153` 路由 |
| `files.process` | 可用（token + 原子写；脏 tab 走编辑器一次 undo） | 不可用（当前）→ 解禁后受限 | 可用 | `broker-files.ts:88-104`、`src-tauri/src/plugins/files.rs:87-143`；content 的 `readText` 有损 UTF-8、写非原子 |
| `files.find` | 可用 | 不可用（当前）→ 解禁后受限 | 可用 | 普通路径 `index_folder`；content 走 JS 树（`scoped-folder.ts:17-36`，5000 上限）；`plugin_fs_documents` 无 content 路由（`ipc-plugins.ts:140-142`） |
| `files.conventions` / `appSettings` | 可用 | 不可用 | 可用 | 均为 Rust `Path` 实现（`src-tauri/src/plugins/files.rs:249-276`） |
| `metadata.*` | 可用 | 不可用 | 可用 | Rust 索引 + `checked_root`（`src-tauri/src/plugins/metadata.rs:445-487`） |
| `ctx.storage.global` | 可用 | 可用 | 可用 | 落在 app 配置目录；但 base 以 root 字符串哈希为 key（`src/settings.ts:33-36`） |
| `ctx.storage.project` | 可用 | 不可用 | 可用 | 需要 `.textus/plugins/<id>` 普通路径（`src-tauri/src/plugins/store.rs:36-73`） |
| `ctx.secrets` | 可用 | 可用 | 可用 | 明文 JSON：`src-tauri/src/plugins/files.rs:145-164`；Auto Backup 风险见 §3 |
| `api.net.fetch` | 可用 | 可用 | 可用 | HTTPS-only（localhost 例外）：`src-tauri/src/plugins/access.rs:355-365`；32MB 上限：`http.rs:16`；10s/60s 超时：`http.rs:76` |
| `ui.confirm/form/pick` | 可用 | 可用 | 可用 | 手机为 ActionSheet/对话框；cloud-sync 的 `ui.confirm` 可用（`src/plugins/host/broker-ui.ts`） |
| `statusItem` | 受限（手机不可见，平板/桌面可见） | 同左 | 可用 | 只在 `WindowBar` 渲染（`src/app/frame/WindowBar.tsx:75-76,138`），而手机不挂 `WindowBar`（`src/app/App.tsx:197-227`） |
| `views.registerWebview` / `registerSettingsPage` | 可用（设置页） | 同左 | 可用 | 设置页走 `PluginSettingsWebview`（`src/settings/pages/PluginPage.tsx:236-240`） |
| `layout.openView` / `layout.open` 导航 | 受限（打开后手机不切换页面） | 同左 | 可用 | `openPluginTab` 只改 active tab（`src/app/usePluginWindow.ts:352-365`）；`phoneView` 仅三处被设置（`src/app/App.tsx:88,210,269,273`） |
| `layout.tabs` | 可用（返回窗口全部 tab） | 可用 | 可用 | `broker-layout.ts:137-141`；手机没有 tab 条但 tab 仍存在（`App.tsx:281`） |
| `l10n` | 可用 | 可用 | 可用 | manifest l10n → runtime |
| `commands.register` | 可用（注册/执行），手机无入口 | 同左 | 可用 | 手机菜单不可达：`AppMenuButton` 只在 `WindowBar`（`src/app/frame/WindowControls.tsx:17`、`WindowBar.tsx:103,108`）；Settings›Shortcuts 手机不显示（`docs/dev/ios-code-map.md:131`） |
| `menus`（`app/plugins`） | 受限（不可达） | 受限 | 可用 | `buildMobileMenu` 存在（`src/registry/menu/app-menu-model.ts:315-378`）但宿主不渲染 |
| `menus`（`file/context`） | 可用（长按文件） | 可用 | 可用 | `src/files/FileTree.tsx:143-144`、`src/files/useRowMenu.ts:160-169` |
| `app.state` / `onDidChangeState` | **不可用**（恒为 active） | 不可用 | 可用 | `app_state` 命令 desktop-only（`src-tauri/src/invoke_handler.rs:301-303`），`watchAppState` 只在桌面后台宿主调用（`src/plugins/background/schedule-window.ts:49`） |
| `schedule` / `background` | 不可用 | 不可用 | 可用 | `src-tauri/src/schedule/mod.rs:10-21`；带 background 的 manifest 被强制 desktop（`src/plugins/store/manifest.ts:102-125`） |

### 2.3 两条存储路线的实际差别

**普通路径**

- 能做：Rust 直接读写、原子替换、fsync、mtime 外部变更检测、保存时冲突提示、图片/PDF/附件、插件全量文件 API（除 trash）、索引。
- 不能做：系统回收站（移动端无 trash）；后台；手机 UI 入口；跨卷 move（`atomic.rs:302-316` 依赖 trash）。
- 性能：最好。`list` 带 size/mtime，未变文件不重读；IPC 传原始字节。
- 权限：
  - App Documents：`getExternalFilesDir(DIRECTORY_DOCUMENTS)`（Tauri 2.12.5 `PathPlugin.kt:73-75`），**无需任何权限**，但用户在系统文件管理器里看不到（Android 11+ 限制 `Android/data`），卸载即删。
  - 所有文件授权：`MANAGE_EXTERNAL_STORAGE` app-op，重启/更新后保留，用户可在系统设置撤销；华为/应用市场审核有政策风险。
- 重启：路径稳定，可用；但当前 Android 不把 App Documents 作为树根（`useIOSDocumentsFolder` 只对 iOS 生效，`[T]/src/platform/ios-files.ts:180-191`），需要第 2 项改动。
- 单窗格：`canUseWindows=false`（`capabilities.ts:30`），无会话恢复；单窗格不影响普通路径。

**content:// SAF**

- 能做（App 自身）：系统树选择、列目录、新建/重命名/移动/删除、纯文本打开与保存、图片只读显示（`scopedImageSrc`，`ios-files.ts:149-157`）、插件设置的读取。
- 不能做：插件文件 API（gate）；二进制写；原子写；trash；mtime/size；隐藏文件策略；metadata/project storage；保存时冲突提示；后台。
- 性能：每次 list/read 都走 JS→Rust→Kotlin→ContentResolver；读整文件再 base64；`stat` 列父目录；无 mtime 导致每次全量重读（见 §3 P1-3）。
- 权限持久化：`takePersistableUriPermission`（`TextusFilesPlugin.kt:133-135`）；支持持久授权的 provider 重启后可用。provider 不支持时 `runCatching` 静默失败，只在当前进程有效。系统对 persisted grant 有数量上限；卸载清除。
- 重启：ui-state 里的 content URL 会被恢复（`restoreSessionOnStartup` 默认 true，`backend-defaults.json:4`），但启动时**不校验授权是否仍有效**；授权失效后树是空的，没有“重新授权”提示。
- 单窗格：无 tab 条；插件打开的 tab 不可导航（见 §3 P1-2）；`layout.split()` 为空；`where:"beside"` 退化为普通 tab。

### 2.4 附件的真实限制

- “content:// 不能写二进制”是**当前代码限制**，不是平台限制：Kotlin 已有 `readData`，加一个 `writeData` 即可写字节（3-5 人日）。但会继承非原子写、provider `"wt"` 兼容性、大文件 OOM。
- “SAF 无 Trash”是**平台限制**：`DocumentsContract.deleteDocument` 是永久删除（`TextusFilesPlugin.kt:239-243`）；可以自建 App trash（同树 move 或复制+删除）。
- “stat 列父目录”是**实现限制**：直接 query 文档 URI 的 `COLUMN_SIZE/COLUMN_LAST_MODIFIED` 即可，1-2 人日；但部分 provider 返回 0 或粗粒度时间。
- 真正的硬限制：SAF 没有原子 replace；没有可靠的 mtime；没有跨 provider 的原子 move；无法像路径一样做文件监听；隐藏文件策略要自己在 content 层实现（当前完全没有，见 §3 P0-5）。

---

## 3. 阻断项（按严重程度）

### P0-1 content 根被宿主拒绝（SAF 路线第一道闸）

- 证据：`[T]/src/plugins/host/scoped-root.ts:15-21`；`broker.ts:376-380`；`broker-files.ts:116` 只对 `files.root` 放行。
- 后果：插件被明确告知 `pluginsNeedAllFiles`；cloud-sync 在 SAF 模式下 `files.root()` 有值但所有 `files.*` 抛错，表现为“已配置但同步一直失败”。
- 方向：只对 `files.*` 子集放行 content，`metadata/project/conventions` 继续拒绝；同时在 content 层补隐藏文件校验。
- 量级：2-4 人日。

### P0-2 `files.trash` 在 Android 必然失败（删除是同步的硬前置）

- 证据：普通路径 `atomic.rs:400-416`（`#[cfg(not(desktop))]` 返回错误）；content `content-plugin-fs.ts:137-141`；`ipc-plugins.ts:149-153`。
- 后果：cloud-sync 的 `Workspace.remove` 调用 `files.trash`（`src/local.ts:192-201`）；远端任何删除都会抛错，整个同步中止（engine 没有逐文件 catch，`host.ts:343-345`）。App 自己的手机删除也是永久删除（`tree_ops.rs:235-260`），且文件夹根本不能删（`useRowMenu.ts:159-161`）。
- 方向：App 管理的 trash。普通路径可 rename 到同一卷的隐藏 trash；content 可在同一 tree 内 move 或复制后 delete；恢复/清理 UI 后置。
- 量级：3-5 人日（不含 restore UI）；恢复 UI 再加 3-5 人日。

**删除语义会怎么变**：

| 维度 | 桌面系统回收站 | App trash |
| --- | --- | --- |
| 用户预期 | Finder/资源管理器可恢复 | 只能在 App 内恢复；需先有入口 |
| 远端 | 删除后其他端各自进系统回收站 | 删除后其他端（含旧客户端）看到的是“文件消失”，行为不变 |
| base/history | v1 base 删除路径；远端 history 保留版本 | 同左；v1 的 `trash` 墓碑数组实际上只读不写（`engine.ts:161,397`），不影响兼容 |
| 恢复 | 系统级 | App 级，需要保留元数据与路径 |
| 清理 | 系统负责 | 必须做保留期/容量上限（手机存储敏感） |
| 旧客户端兼容 | — | 无协议变化，v1 格式不变 |

### P0-3 插件自拼 content URL + 空扫描会误判“本地全删”

- 证据：`Workspace.path()` 用字符串拼接（`[P]/development/cloud-sync/src/local.ts:49-52`），得到 `.../document/primary%3ANotes/a.md`；宿主/列表使用 `contentJoin` 生成 `.../primary%3ANotes%2Fa.md`（`[T]/src/utils/path.ts:78-90`）。`contentPluginFs.stat` 用字符串相等找父目录列表（`content-plugin-fs.ts:46-54`），因此对拼出来的 URL 恒为 null。`readRaw` 先 stat，null 即返回 null（`local.ts:59-70`）；`scan` 因此一个文件也收不进来。planner 把“本地缺失 + 远端等于 base”判为 `deleteRemote`（`src/planner.ts:35-58`）。
- 后果：一旦解禁 content 而路径未修，第一次同步会把远端 head 中所有文件移除，其他设备随后删除本地副本（远端块仍在历史里，但 head 已丢）。这是最危险的失败模式。
- 方向：① 插件改用相对路径，或用 `files.stat()` 返回的 `path` 作为规范 URL；② 宿主在 `contentPath`/`absoluteIn` 对 content URL 做规范化；③ 插件加保护：base 非空而 scan 为空时抛错，绝不按删除处理。
- 量级：保护 0.5 人日；插件路径改造 1-2 人日；宿主规范化 1 人日。

### P0-4 SAF 写不是原子的，而同步的 reservation 假设原子写

- 证据：Kotlin `openOutputStream("wt")`（`TextusFilesPlugin.kt:171-183`）先截断再写；对比 Rust 原子写 `atomic.rs:61-100`、iOS `NSFileCoordinator + atomically`（`TextusFilesPlugin.swift:301-317`）。cloud-sync 的 reservation 先把 marker 写进目标文件（`src/reservations.ts:1-60`），再写真实内容；engine 对二进制下载也先 create marker 再写（`src/local.ts:81-111`）。
- 后果：进程被杀/电荒/写入失败时，文件可能是半截内容或 marker 的残片；下一次扫描把残片当用户文件上传，污染远端。非文本下载还会因为不能写二进制直接中止（见 P1-1）。
- 方向：SAF 路线必须做 journal（临时文档 + rename + 启动恢复）或把 SAF 降为“只读/只下载新文件，不覆盖”；正式方案是内置 Rust + 受控存储层。
- 量级：2-4 周（可靠方案）；临时降级 2-3 人日。

### P0-5 SAF 没有 mtime：外部变更重载与保存冲突提示都失效

- 证据：`fileMtimeMs` 对 scoped URL 恒 null（`[T]/src/platform/ipc-files.ts:116-117`）；`useExternalChangeReload` 见 null 直接 continue（`src/document/useExternalChangeReload.ts:91-99`）；保存冲突判断只在 `diskMtime !== null` 时执行（`src/app/useSaveWrites.ts:200`）。
- 后果：clean tab 不会因 `FILE_WRITTEN_EVENT` 原地重载；dirty tab 保存时不会提示“磁盘已变”，直接覆盖本地文件（远端版本仍在该文件夹的 history，下一次同步会生成冲突副本，但用户当场看不到）。
- 方向：Kotlin 增加直接 query 的 stat（size/lastModified），`fileMtimeMs` 对 scoped URL 路由过去；对不可靠 provider 再做内容比对兜底。
- 量级：2-4 人日。

### P1-1 SAF 不能写二进制：一个图片就能让整次同步失败

- 证据：`content-plugin-fs.ts:108-110`；engine 的二进制下载路径 `src/local.ts:81-111`、`engine.ts:330-360`。
- 后果：vault 里只要有图片/PDF 在远端新增或变化，Android SAF 端同步即中止（`localWriteError`），不是跳过。
- 方向：Kotlin `writeData` + 宿主路由 + 图片/附件路径改造；或在 SAF 首版明确排除附件并在 UI 说明。
- 量级：3-5 人日。

### P1-2 手机上没有可用的插件入口，且 `layout.openView` 打开后不可见

- 证据：手机不挂 `WindowBar`（`App.tsx:197-227`），`PluginStatusItems` 只在其内（`WindowBar.tsx:75-76,138`）；`AppMenuButton` 只在 `WindowBar`（`WindowControls.tsx:17`）；手机 `phoneView` 只在三个回调里切换（`App.tsx:88,210,269,273`），插件的 `openView/open` 不会切过去。
- 后果：cloud-sync 的“Open / Sync now / History”命令在手机宽度不可达；设置页（`Settings›Extensions›Plugins›Cloud Sync`）是唯一稳定入口；`file/context` 的 History 即使能点，打开的 tab 也不会显示。
- 方向：手机首页加“插件/更多”入口，或把 `phoneView` 与 active tab 联动；这属于裁决 30 的 IA 范围，需要拍板。
- 量级：2-4 人日。

### P1-3 SAF 的 list/stat 没有 size/mtime：无增量、内存池失效

- 证据：`TextusFilesPlugin.kt:189-193` 只取 ID/NAME/MIME；`content-plugin-fs.ts:34-44` 填 `size:0, modified_ms:null`；engine 用 `entry.size` 做内存配额（`engine.ts:132,373-386`），`Pool.tryTake` 在 `count===0` 时任何大小都放行（`src/pool.ts:24-28`）。
- 后果：每次同步全量读取/哈希；32MB 预算对 content 形同虚设；大文件可导致 OOM（见 P1-6）。
- 方向：Kotlin 补列；插件用 size/mtime 做增量；手机上限。
- 量级：1-2 人日。

### P1-4 后台同步在插件层不可交付

- 证据：`schedule/background` 桌面专属（`src-tauri/src/schedule/mod.rs:10-21`）；manifest 强制 desktop（`src/plugins/store/manifest.ts:102-125`）；pacer 只是页面内 `setTimeout`（`src/pacer.ts`）。
- 后果与矩阵：见 §3.4。
- 方向：第一版仅前台；后台必须 Rust 内置 + 原生 WorkManager/前台服务。
- 量级：4-8 周（含 Rust 同步核心）。

### P1-5 网络：HTTPS-only、无系统根证书、系统代理不读、每请求 60 秒

- 证据：`access.rs:355-365`；`Cargo.toml:80`（`rustls-tls`，webpki 根）；`net.rs:17-31` + `aicompat/http.rs:74-115`（系统代理 matcher 面向桌面）；`http.rs:76`（10s/60s）。
- 后果：局域网 `http://` WebDAV 直接被拒；企业/自签 CA 不被信任；Wi‑Fi 系统代理无效（需在 Textus 设置里另配代理）；弱网 2MB 块可能超 60s；网络异常不重试（只重试 429/502/503/504，`transport.ts:75-96`）。
- 方向：允许私网 HTTP（带警告）、可选 native roots/自定义 CA、网络异常退避重试、按块超时。
- 量级：3-5 人日。

### P1-6 内存与电量（SAF 尤其危险）

- 证据：`content.ts:14-19` 的 `hash()` 先 `bytes.slice()` 整文件复制；`content-plugin-fs.ts:85-90` 整文件 base64；`Pool` 首个任务无条件放行；`MAX_FILE_SIZE=128MB`（`model.ts:4`）。
- 后果：32MB 文件在 content 下峰值约 3.3 倍（Kotlin ByteArray + Base64 + JS），128MB 文件约 400MB，必然 OOM；大文件还会在哈希时再复制一份。
- 方向：手机端 `MAX_FILE_SIZE` 降到 8-16MB；`hash()` 用 `bytes.buffer` 避免复制；content 读加流式/上限；并发降到 2-4。
- 量级：1-2 人日（参数与实现）。

### P2-1 `app.state` 在移动端恒为 active

- 证据：`invoke_handler.rs:301-303`；`src/plugins/background/app-state.ts:21-29` 只被桌面后台宿主调用。
- 后果：插件无法用官方 API 感知前后台；前台限制只能靠 `visibilitychange`。
- 量级：1 人日（前端 visibilitychange 映射即可）。

### P2-2 凭据与备份

- 证据：`plugin_secrets.json` 明文（`src-tauri/src/plugins/files.rs:145-164`）；Android manifest 未设 `allowBackup=false`（`src-tauri/gen/android/app/src/main/AndroidManifest.xml`）。
- 后果：Auto Backup 可能把 WebDAV/S3 凭据、草稿、插件 base 备份到云端。
- 方向：EncryptedSharedPreferences/Keystore 或至少排除备份。
- 量级：2-3 人日。

### P2-3 手机 tab 只增不减，defer 集合越来越大

- 证据：手机无 tab 条（`App.tsx:281`），`PhoneEditorBar` 的 ⋯ 没有“关闭”（`src/phone/PhoneEditorBar.tsx:34-66`）；每次打开文件新增 tab（`src/app/useFileOpening.ts:293-304`）。
- 后果：`Workspace.open()`（`local.ts:53-58`）会命中本次会话打开过的每个文件；这些文件的远端变更一直被 deferred（`local.ts:103,195,229`），直到重启（Android 不恢复会话）。
- 方向：手机改为“替换式”单文档 tab，或同步只对 dirty/前台 tab defer + clean tab 原地重载。
- 量级：2-3 人日。

### P2-4 库身份随路径写法变化

- 证据：cloud-sync 的 config/base/secrets key 都用 `hash(root)`（`src/settings.ts:33-36`、`src/host.ts:173,254,310`）。
- 后果：同一文件夹从 SAF 切到“所有文件”（或反之）会得到不同的 key，连接配置和 base 丢失，下一次变成首同步。
- 方向：在 `.textus/` 里存一个 vault UUID，以它作为身份。
- 量级：1-2 人日。

### 3.3 打开文件与“原地重载”

- `Workspace.open()` 的语义是“窗口里存在这个 path 的 tab”，不是“屏幕上正显示”。手机单窗格下 `layout.tabs()` 仍返回全部 tab（`broker-layout.ts:137-141`），而手机 UI 又没有关闭 tab 的入口，所以一次会话里看过的文件都会阻止同步写它们。
- 普通路径：clean tab 可以被 `FILE_WRITTEN_EVENT` 原地重载。`broker-files.written()` 在写完后发事件（`broker-files.ts:48-61`），`useExternalChangeReload` 只在 mtime 变化且 tab 干净时读盘（`useExternalChangeReload.ts:91-114`），再 `takeDiskText`：编辑器在则 `replaceText`（一次 undo，revision 不符则放弃），否则 remount（`useExternalChangeReload.ts:42-73`）。dirty tab 明确跳过，留给保存时提示（`useSaveWrites.ts:198-224`）。不会丢未保存内容。
- content://：`statMtime` 恒 null，`check()` 第一行就 continue，所以**不会重载**；保存时也没有冲突提示。
- 若按拟议把 cloud-sync 改成“只对 dirty tab defer，clean tab 让 FILE_WRITTEN 重载”：普通路径可行且安全；SAF 不可行，必须先把 mtime 或内容比对补上，否则编辑器显示旧文本，用户保存后本地覆盖新内容（远端 history 可恢复，下一次同步再产生冲突副本，但不是“当场不静默”）。
- 丢内容风险：clean tab 无；dirty tab 同步会 defer；`process` 对脏 tab 走 `replaceText` 且 revision 校验；真正会丢的是 SAF 下“dirty tab 保存时静默覆盖刚下载的版本”，以及 SAF 非原子写被进程杀死时的半截文件。

### 3.4 后台

要加的原生代码（如果要在 Android 上做后台）：

1. 原生权限与组件（放在一个 Tauri 移动插件里，避免 `gen/` 被重新生成覆盖）：`FOREGROUND_SERVICE`、`FOREGROUND_SERVICE_DATA_SYNC`（API 34+）、`POST_NOTIFICATIONS`（33+）、`ACCESS_NETWORK_STATE`（Wi‑Fi Only），以及 `<service android:foregroundServiceType="dataSync">`。
2. WorkManager（周期/约束）或前台服务（用户发起的长同步）+ 通知渠道；Android 14 必须声明类型，Android 15 的 `dataSync` 前台服务有 6 小时/24 小时限制。
3. 真正执行同步的代码不能是 WebView 里的 JS：WorkManager 可能在进程冷启动时运行，没有 webview。必须把同步核心放到 Rust（通过 JNI 暴露给 Worker）或在 Kotlin 重写协议。插件层做不到。
4. Rust 侧需要一个不依赖窗口的 `run_sync(vault, config)`，能读插件 secrets/base、访问 ContentResolver（通过 JNI）或普通路径。

行为矩阵：

| 场景 | 前台-only（第一版） | 有 WorkManager/前台服务 |
| --- | --- | --- |
| 切后台（进程活） | WebView 定时器被节流，pacer 基本停摆；已发出的请求可能完成但 JS 回调延迟 | 前台服务可继续，WorkManager 受约束 |
| 进程被杀/划掉 | 同步中止；普通路径安全（原子写），SAF 可能半截；base 未保存则下次重扫 | WorkManager 可重新调度；SAF 仍不原子 |
| 锁屏 | 等同切后台 | 前台服务可继续；WorkManager 视 Doze |
| Doze | 网络/定时器被挂起 | 前台服务通常豁免；WorkManager 等到维护窗口 |
| EMUI 省电 | 可能直接冻结/杀掉；需用户把 Textus 加入“受保护应用/允许后台活动” | 仍可能被杀；必须真机验证 |

**最少可接受的第一版**：只做前台。用插件自身的 `document.visibilitychange`（iframe 会跟随顶层页面）在回到前台时触发一次 catch-up，加上启动时同步、保存后 debounce、可见时定时同步；UI 明确写“仅前台同步”。这不需要任何原生代码，也不改变现有 pacer 的结构。

### 3.5 首次打开/授权

- 选文件夹：`ACTION_OPEN_DOCUMENT_TREE` + `FLAG_GRANT_PERSISTABLE_URI_PERMISSION`（`TextusFilesPlugin.kt:90-106`）；`keep()` 立即 `takePersistableUriPermission`（133-135）；根 URL 由 tree 的 document id 构造（137-139）。
- `begin_access`：只有 `com.android.externalstorage.documents` 且非卷根、且有所有文件权限、且可写时才给普通路径（260-316）；否则返回 content URL。`ask=false` 只回答“会不会问”；`ask=true` 会打开系统“所有文件访问”页（268-281），用户拒绝后回落到 URL。
- 如果用户拒绝：App 本身仍可用（树、新建、改名、删除走原生），但插件被 gate 拒绝，并弹一次提示（`scoped-root.ts:15-21`）。
- 重启后：持久授权在重启/更新后保留；ui-state 里的文件夹 URL 会被恢复；但启动时不校验 grant，授权丢失时表现为空树/报错，没有重新授权入口。provider 不支持持久授权时，`runCatching` 静默失败，只有当前进程可用。
- 同步服务拿根路径：插件启动后 `files.root()` 读窗口的 open folder；文件夹恢复后 `files.onDidChangeRoot` 会触发 `refresh()`（`src/host.ts:474-478`）。但如果根是失效的 content URL，`files.root()` 仍返回值，同步会一路失败；建议启动时先 `files.list(root)` 验证，失败则进入“库不可用，请重新选择”的状态。
- 同一文件夹在 SAF 与普通路径之间切换会换 key（§P2-4），配置和 base 会“消失”。
- 商店政策：`MANAGE_EXTERNAL_STORAGE` 在 Google Play/华为应用市场属于敏感权限，侧载验收没问题，正式分发需要单独评估。

### 3.6 网络

| 条件 | 现状 |
| --- | --- |
| 前台 Wi‑Fi/LTE | 可用；无计量网络判断，无 Wi‑Fi Only |
| 飞行模式/断网 | `networkError`，整次同步失败；无网络异常重试 |
| 网络切换（Wi‑Fi↔LTE） | 在途请求失败，同步中止；下次重跑 |
| 弱网 | 每请求总超时 60s（2MB 块在 <270kbps 时会超时） |
| 系统代理（Wi‑Fi 代理） | 不读取；需在 Textus 设置里配 `proxyType/proxyHost/proxyPort`（`src-tauri/src/settings/app.rs:26-69`） |
| TLS | rustls + 内置 webpki 根（`Cargo.toml:80`），不用 Android 系统 CA；企业/自签证书失败 |
| HTTP WebDAV | 插件层拒绝（仅 localhost 允许 http，`access.rs:355-365`）；release manifest 也 `usesCleartextTraffic=false`（`gen/android/app/build.gradle.kts:21`） |
| 后台 | Doze/节流；插件层不可用 |

### 3.7 存储/电量/发热

- 2MB 块：对笔记来说 1 文件 1 块，块级去重有效；对视频/大 PDF 是 64 块/128MB。
- 32MB 内存池：普通路径有效；content 下 `size=0` 使它失效，且 `Pool` 允许首个任务任意大小（`src/pool.ts:24-28`），单个 128MB 文件即可把峰值推到数百 MB。
- 全量扫描：`described` 是模块级内存 Map（`src/local.ts:16-19`），**每次 App 重启都丢**；重启后的第一次同步会对所有文件重新读取+哈希。普通路径可接受；SAF 下是分钟级。
- 现实上限建议：普通路径 3000-5000 文件 / 200-500MB；SAF 1000-2000 文件 / 50MB，且首版排除大附件。`MAX_FILES=20000`、`MAX_FILE_SIZE=128MB`、`MAX_MANIFEST_SIZE=8MB` 都是桌面口径（`model.ts:3-15`）。
- 电量/发热：首次全量哈希是主要 CPU；之后每次保存触发的同步是主要射频开销。建议手机端 `settle` 10-20s、`interval` 15-30 分钟、首同步要求 Wi‑Fi。
- SQLite：可行（Kotlin SQLite 或 Rust `rusqlite` bundled），但首版不必。更划算的是把 `{size, mtime, hash}` 持久化到本地 base 旁边（base 本身不上远端，可加字段），避免每次重启全量重哈希；超过 5000 文件再上 SQLite。
- 建议并发：S3 2-4、WebDAV 2、Nutstore 1-2；`TRANSFER_BYTES` 8-16MB；`MAX_FILE_SIZE` 8-16MB；`MAX_FILES` 3000-5000。

---

## 4. Spike 计划（华为 PKT0220512001548）

### 4.1 三条测试轨（建议按顺序）

**轨 0：App Documents 普通路径（1-2 天）**
- 改动：让 Android 使用 `getExternalFilesDir(Documents)` 作为库根（复用 iOS 的 `useIOSDocumentsFolder` 逻辑并改名为移动端通用），手机首页可进入；“新建”直接写入该目录（复用 `newDocumentPath`）。
- 目的：在不碰权限、不碰 SAF 的情况下验证插件数据通路、原子写、mtime、附件、WebView iframe、crypto。
- 预期：除 `files.trash`、后台、状态条外全部通过。

**轨 A：所有文件访问 + 用户文件夹（2-3 天）**
- 改动：同轨 0，但根是用户通过系统选择器选的 `/storage/emulated/0/...`，允许 `MANAGE_EXTERNAL_STORAGE`。
- 目的：验证 D0 的“目录授权 + 新建/修改/冲突检测”，以及华为的“所有文件访问”页面是否存在、授权是否稳定。
- 预期：与桌面同能力（除 trash）；跨卷 move、文件夹删除仍不可用。

**轨 B：SAF content://（1-2 天，先只验证失败边界）**
- 不改 gate，只观察：插件是否被拒、提示是否出现、App 自身编辑是否正常、重启后 grant 是否还在。
- 可选：临时解禁 gate + 修路径，只做“读取 + 上传”，**禁止删除和覆盖**，验证 §P0-3 的空扫描保护是否生效。
- 预期：文本可读可上传；删除/下载/覆盖按已知错误失败，且不产生远端删除。

### 4.2 必须测的清单

| 类别 | 用例 | 通过标准 |
| --- | --- | --- |
| 授权 | 允许/拒绝所有文件；SAF 选择；重启 3 次；24 小时后 | 根可用或明确报“库不可用”；不出现空树无提示 |
| 基本同步 | 新建/修改/重命名/删除（本端/远端各一次）；新建子目录 | 远端 v1 head 正确；桌面端可读同一远端；删除不导致同步中止（轨 0/A 在 App trash 后） |
| 冲突 | 两端同时改同一文件；一端删一端改 | 生成冲突副本；不静默丢任一侧；手机能看见副本 |
| 打开中同步 | 文件在 tab 中（clean/dirty）；同步写它 | clean 原地重载一次 undo；dirty defer；不丢输入 |
| 附件 | 图片/PDF 新增与更新；粘贴图片 | 轨 0/A 通过；轨 B 明确报不支持且不中止其他文件（或按设计中止并提示） |
| 崩溃 | 上传/下载中断网；杀进程；锁屏；低电量 | 文件不半截（普通路径）；重启后 base 一致；无远端误删 |
| 网络 | 飞行模式；Wi‑Fi↔LTE；弱网限速；系统代理；自签证书 | 失败可重试；错误可读；不产生损坏 |
| 性能 | 500/2000 文件；10MB 附件；首同步与增量 | 见 4.3 数据 |
| 后台 | 切后台 1/10 分钟；锁屏；Doze；EMUI 省电 | 明确记录“停/继续”；不产生半写 |
| UI | 手机宽度下插件设置页、命令、History、状态条 | 至少设置页可用；其余缺口记录 |

### 4.3 预期数据（用于判断是否继续）

- 轨 0：500 个笔记（约 20MB）首同步 Wi‑Fi < 60s；增量（改 10 个）< 10s；WebView 峰值内存 < 250MB；无 ANR。
- 轨 A：同上，另测 10MB 图片 3 张；确认 `files.trash` 失败是唯一文件 API 失败。
- 轨 B：500 文件首同步 < 3 分钟；增量仍接近全量（因无 mtime），记录耗时；确认远端 head 不被清空。
- 电量：一次 20MB 同步 < 2% 电量（以系统耗电统计为准）；连续 10 分钟同步无明显过热降频。

### 4.4 通过标准

1. 任一轨都不出现“远端文件被误删”或“本地文件半截”。
2. 冲突一定留下两份，且手机端能看到。
3. 不支持的操作用明确错误呈现，不静默跳过。
4. 桌面端不升级即可继续读写同一远端。
5. 记录“只有真机能给”的结论：SAF provider 的 `wt`/persistable grant/rename/move 行为、EMUI 的所有文件页面与省电策略、WebView 的 crypto/定时器/iframes、FUSE 上的原子 rename 与 fsync、真实吞吐与发热、TLS/代理行为。

### 4.5 只有真机能回答的问题

- 华为的 `ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION` 是否可用、授权后是否持久。
- 华为文件管理器的 DocumentsProvider 是否支持 `ACTION_OPEN_DOCUMENT_TREE`、持久授权、`renameDocument/moveDocument`、`"wt"`。
- Android WebView 是否把 `http://tauri.localhost` 当 secure context（`crypto.subtle`/`randomUUID`）。
- WebView 在后台/锁屏/Doze 下的定时器与 iframe 行为。
- FUSE 上 temp+rename+fsync 的真实表现与耗时。
- 系统代理、企业 CA、自签 WebDAV 的实际失败方式。

---

## 5. 内置阶段必须补的移动端设计

1. **生命周期**：明确“前台同步 / 后台尽力而为 / 无保证”三档；Rust 同步核心可在无 WebView 的 Worker 中运行；WorkManager 周期任务 + 前台服务（用户发起）+ 通知；Android 14/15 的类型与时长限制；EMUI 白名单引导。
2. **存储抽象**：`AssetStorage` 能力位（atomicWrite / mtime / binary / trash / move / watch），桌面=Rust，iOS=scope，Android 普通路径=Rust，Android SAF=ContentResolver；能力不足时 UI 明确降级，不假装有保证（与《改造方案》§6.4 路线 A 一致，`docs/skein/02-方案/Textus-改造方案.md:420-437`）。
3. **SAF 原子性**：临时文档 + rename + 启动恢复，或明确规定 SAF 只读/只新建；禁止在 SAF 上做覆盖式同步。
4. **删除**：App trash（保留期、容量、恢复入口、清理），并统一 App 自身删除与插件删除的语义；桌面仍用系统回收站。
5. **附件**：SAF 二进制写、图片解析与粘贴、导出；否则在 SAF 模式排除附件并在设置里说明。
6. **手机 UI**：同步状态/上次时间/失败原因、手动同步、Wi‑Fi Only、冲突副本入口；与画板 `ui-p-b.html:579-596` 的“库与同步（含手机上只读开关）”对齐。
7. **身份**：用 `.textus/` 中的 vault UUID 做配置/base 的 key，避免路径写法变化重置。
8. **安全**：Keystore/EncryptedSharedPreferences、关闭 Auto Backup 或排除 secrets、证书信任策略。
9. **性能**：持久化 size/mtime/hash 索引、手机端文件大小/数量上限、并发与退避、计量网络策略。
10. **测试**：真机矩阵（授权/崩溃/弱网/后台/热）、SAF provider 兼容清单、v1 兼容回归。

---

## 6. 需要用户拍板的点

1. **第一版库位置**：App Documents（`getExternalFilesDir`，无需权限但用户在系统文件管理器看不到，卸载即删）／所有文件授权（用户可见，但敏感权限与商店政策）／SAF 任意目录（灵活，但工作量与风险最大）。这决定 spike 走哪条轨。
2. **删除语义**：App trash（可恢复、占空间、需 UI）／归档到 vault 内隐藏目录（随文件夹走、可能被其他客户端看见）／永久删除（不符合“归档代替删除”）。桌面系统回收站无法在 Android 复用。
3. **后台是否 v1 必须**：若必须，插件路线直接出局，需要提前启动 Rust 内置（4-8 周）。
4. **附件是否 v1 必须**：若必须，SAF 需要二进制写与原子性；否则 SAF 首版应明确“纯文本、无附件”。
5. **手机端插件入口**：是否同意在手机首页/“更多”加入插件入口，并让 `layout.openView` 切换手机页面（触及裁决 30 的 IA）。
6. **网络策略**：是否允许私有网段 HTTP WebDAV；是否接受只信任内置根证书（企业自签需另做）；Wi‑Fi Only 是否 v1。
7. **凭据存储**：是否投入 Keystore/EncryptedSharedPreferences，并关闭/排除 Auto Backup。
8. **冲突呈现**：手机端接受“Sync conflicts/ 冲突副本”出现在 vault，还是必须做专用确认 UI（D3 要求“不静默覆盖”，画板只给了只读状态行）。
9. **手机只读开关**：画板 `ui-p-b.html:588-596` 已有“手机上只读 / 关闭”一行；是否 v1 默认只读（可大幅降低 SAF 写风险），以及“收集”写入走哪个目录。
10. **文件上限**：手机端 8/16MB 单文件、3000-5000 文件、首同步 Wi‑Fi 限制是否可接受。

**总评**：插件先多端的“数据通路”在普通路径上成立，值得先做轨 0/轨 A 的真机 spike；但 SAF 任意目录、删除、后台这三件事决定了最终必须内置。建议把 spike 的目标定为“证明普通路径 + 前台 + v1 兼容 + 冲突不丢”，而不是“证明插件能在 SAF 上完整工作”。
