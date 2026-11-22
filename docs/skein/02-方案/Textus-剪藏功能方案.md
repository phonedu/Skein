# Textus 网页剪藏方案（公开页版）

> **状态：后期功能记录（2026-11-22 定），暂不施工。** 本文只记方向、边界与实现路径；开工前按《改造任务清单》CP1 重新确认范围与优先级。
> 对象：桌面端（Windows 先行；macOS/Linux 后置），Android 后置；不做 iOS。
> 关联：[《改造任务清单》](../05-状态/Textus-改造任务清单.md) CP1 · [《改造方案》§4.2](Textus-改造方案.md)（front matter）· [《插件API要点》](../03-调研/插件API要点.md)
> 存放：`docs/skein/02-方案/`

## 0. 一句话

后期做一个**只剪公开页**的网页剪藏：用户贴一个 URL，Textus 在**不可见的系统 WebView** 里加载页面、注入 Defuddle 提取正文，插件把结果写进 `inbox/N-*.md`。不弹浏览器、不起服务、不碰登录态。

## 1. 产品参照

用户手机上的本地剪藏 App（名字未记）的体验：

- 只要浏览器能打开的公开页面，它就能剪；
- 剪的时候**不在前台弹浏览器**；
- 直接输出成一条本地笔记；
- 不要求输入登录密码。

它用的机制是**隐藏 WebView + 页面内脚本提取**（Android `WebView` / iOS `WKWebView`，加载后 `evaluateJavascript` 跑 Readability/Defuddle 一类提取器），不是服务端抓取，也不是浏览器扩展。"不用登录"是因为它只做公开页，或用户曾在它里面登录过一次。

## 2. 方案取舍（2026-11-22 讨论结论）

| 方案                                  | 形态                               | 结论             | 原因                                                                                      |
| ------------------------------------- | ---------------------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| A. post-snap / 自建服务               | Node 服务，服务端抓取 + 平台提取器 | **否**           | 要多跑一个服务；服务端抓取容易被反爬/WAF 挡；平台规则维护重                               |
| B. 插件自己 `net.fetch` + Defuddle    | 纯插件，无服务                     | **否（主路径）** | 插件沙箱没有 JS 执行、没有 cookie、没有真实浏览器指纹；公开博客尚可，公众号/知乎/小红书弱 |
| C. 浏览器扩展 + `textus://` + 插件    | 扩展在当前页/后台标签提取          | **可作过渡**     | 零宿主改动、零服务、用浏览器登录态；但要装扩展，且要另维护一套扩展                        |
| D. 宿主隐藏 WebView + Defuddle + 插件 | 宿主提供无窗口页面读取，插件落盘   | **选用（后期）** | 与手机 App 同类；无服务；真实浏览器内核；插件仍管笔记格式                                 |
| E. 宿主 Rust `dom_smoothie` + `htmd`  | 纯 Rust 提取                       | **否**           | 不执行页面 JS；对 SPA/公众号弱；能力上限接近 B                                            |

选定 D 的代价是**必须改宿主**：插件沙箱加载不了任意网页，也建不了隐藏 WebView。宿主要加的是一条通用能力（"无窗口读取一个网页"），不是把剪藏功能写进宿主；笔记格式、入口、图片仍由插件负责。

## 3. 选定架构

```
插件命令「剪藏网页…」
        ↓ URL
宿主 clip_page_read(url) / 插件 API textus.web.readPage(url)
        ↓
隐藏 WebviewWindow（visible=false）加载 https 页面
        ↓ 注入 Defuddle + window.__textusClip()
页面加载完成 → 等 1–2 秒 → 执行 __textusClip() → 取 JSON
        ↓
{ title, author, published, site, markdown }
        ↓
插件写 inbox/N-YYYYMMDD-xxxx.md（§4.2 front matter）
        ↓（可选）图片下载进 asset-library/clips/<id>/，改相对路径
        ↓
ui.notice「已剪藏：标题」
```

### 3.1 宿主（Rust）新增通用能力

- 对外形态二选一，开工前定：
  - Tauri command `clip_page_read(url)`，由内置功能调用；或
  - 插件 API `textus.web.readPage(url)` + 新权限 `web.read`（"在隐藏浏览器里读取网页"），由 `skein.clip` 调用。推荐后者，笔记格式留在插件里。
- 隐藏 `WebviewWindow`：`visible(false)`、`focused(false)`、`skip_taskbar(true)`，size 约 1280×2000；label 用 `clip-*`，**不列进任何 capability**，与现有 `page-*` 一样让页面拿不到 app 权限。
- `initialization_script` 注入 Defuddle bundle + `window.__textusClip()`（只在主 frame）。
- `PageLoadEvent::Finished` 后等 1–2 秒让 JS 渲染/懒加载完成，再用 `with_webview` 执行 `window.__textusClip()`：
  - Windows：WebView2 `ExecuteScript`；
  - macOS：WKWebView `evaluateJavaScript`；
  - Linux：WebKitGTK `run_javascript`。
- 拿不到结果就重试几次；20–30 秒超时。完成、失败、超时都销毁窗口。
- 只允许 https；禁新窗口、下载、非 http(s) 跳转；私网地址拦截；页面无 Tauri IPC（注入脚本里移除 `__TAURI_INTERNALS__` 作为纵深防御）。

### 3.2 插件 `skein.clip`

- 命令「剪藏网页…」：`ui.input`（预填剪贴板里的 URL）→ `ui.withProgress` 调 `textus.web.readPage` → `files.create("inbox/N-YYYYMMDD-xxxx.md", text, { unique: true })` → `ui.notice`。
- 失败语义：
  - `needsLogin` → "这篇需要登录或没有公开正文，暂不支持；可以用浏览器打开后复制正文。"
  - `noContent` → "没有提取到正文。"
- 图片（第二片，可先不做）：扫 Markdown 图片 URL，`net.fetch`（带 `Referer`）→ `files.write` 到 `asset-library/clips/<note-id>/` → 改相对路径；公众号 `data-src` 在注入脚本里先转 `src`。第一版可以保留远程 URL。
- 权限最小集：`files.read`、`files.write`、`clipboard`（预填）、`network:*`（只用于图片）、`web.read`。
- 入口：命令面板 + 插件菜单；后续可加 `clip_url` aiTool（聊天里"剪这篇"）和 `contributes.links`（Ctrl+点击笔记里的 URL）。

## 4. 复用的现有基础设施

| 现有代码                                                | 提供什么                                                                                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/commands/web_page.rs`                    | Textus 已经能在应用内加载任意网页：原生 webview、HTTPS-only、不匹配任何 capability                                                                      |
| `src-tauri/src/commands/export/pdf_offscreen.rs`        | 隐藏 `WebviewWindow` 的现成写法：`visible(false)`、`focused(false)`、`skip_taskbar(true)`、`on_page_load`；`with_webview` + 平台原生 WebView 把结果传回 |
| `src-tauri/src/commands/export/pdf_macos.rs`            | macOS WKWebView 在隐藏窗口里工作的先例（`createPDF`）                                                                                                   |
| `src-tauri/src/editor_windows.rs` / `webview_memory.rs` | Windows/macOS/Linux 的 `with_webview` 用法；`webview2-com`、`objc2_web_kit`、`webkit2gtk` 依赖都在                                                      |
| Tauri 2.12 `WebviewBuilder::initialization_script`      | 页面脚本之前注入 Defuddle                                                                                                                               |

## 5. 公开页边界

- 只剪**匿名可访问**的页面；不做登录态、cookie 导入、登录引导、付费墙/验证码绕过。
- 判定（提案）：
  - 重定向到 `login.` / `passport.` / `accounts.` 等域名，或最终 URL 明显是登录页 → `needsLogin`；
  - Defuddle 正文过短、标题为空 → `noContent`；
  - 15–30 秒内必须给结果。
- 专用 profile（`clip-webview`），不共享 Chrome/Edge；设置里提供"清空剪藏浏览器数据"。
- 不保证所有公开页都能剪：反爬、验证码、JS 登录墙按失败处理，不绕过。

## 6. 安全与稳定性

- 页面加载在无 capability 的 webview 里；不注入 Tauri IPC 给页面；移除 `__TAURI_INTERNALS__` 作纵深防御。
- 只允许 https；`file://`、`javascript:`、自定义 scheme 一律拒绝。
- 私网/保留地址拦截；禁止新窗口、下载、权限请求；超时销毁。
- 同一时刻只跑一个剪藏窗口；完成后 `controller.Close()` / 销毁窗口；Linux 按 `end_web_process_with_window` 结束 web 进程。
- 页面可见性：隐藏窗口可能被站点当作后台标签，懒加载/`IntersectionObserver` 不触发。若 spike 发现内容缺失，退化为屏幕外 1×1 窗口（用户仍看不到），不要改成可见窗口。

## 7. 数据格式

沿用 [§4.2 通用 Front Matter](Textus-改造方案.md)：

```yaml
schema_version: 1
theory_version: 1
id: N-20261122-abcd
title: 文章标题
status: inbox
created_at: 2026-11-22T10:00:00+08:00
updated_at: 2026-11-22T10:00:00+08:00
revision: 1
created_by: skein.clip
source_ids: []
```

- `type` 省略（收集插件裁决：未分类是收集的本义）。
- 来源字段（**待审**）：`source_url` / `source_author` / `source_published` 写 front matter，还是只放正文头？开工前定；若加字段，先改《改造方案》§4.2。
- 正文：Defuddle 的 Markdown；标题避免与 front matter 重复。
- 图片目录（第二片）：`asset-library/clips/<note-id>/<hash>.<ext>`，按内容哈希去重。

## 8. 平台计划

| 平台    | 第一版 | 后置 | 说明                                                                |
| ------- | ------ | ---- | ------------------------------------------------------------------- |
| Windows | ✅     |      | WebView2；已有 `webview2-com` 与 PDF 导出范式                       |
| macOS   |        | ✅   | WKWebView `evaluateJavaScript`；薄适配                              |
| Linux   |        | ✅   | WebKitGTK `run_javascript`；薄适配                                  |
| Android |        | ✅   | Kotlin 隐藏 WebView + `evaluateJavascript` + share intent；另立一项 |
| iOS     |        | ✗    | 归上游                                                              |

桌面端是"一个功能 + 三个薄适配"，不是三份实现：隐藏窗口、加载、导航拦截、超时、销毁是共享 Rust；只有"执行 JS 并取回结果"按平台写几十行；提取器和插件是同一份代码。

## 9. 工作量（人日）

| 切片                                                       | 估计      |
| ---------------------------------------------------------- | --------- |
| Windows spike：隐藏窗口 + Defuddle + 公开页/登录页两条路径 | 1–2 天    |
| 宿主 `web.readPage` + 权限 + `skein.clip` 保存             | 3–5 天    |
| 图片本地化                                                 | 1–2 天    |
| Android 隐藏 WebView + 分享入口                            | 3–5 天    |
| macOS / Linux 适配                                         | 各 2–4 天 |

## 10. 验收（spike）

- 一篇公众号公开文章 → 标题 + 正文 Markdown，15 秒内，无可见窗口；
- 一篇普通博客 → 同上；
- 一篇需要登录的知乎/小红书页 → 15 秒内 `needsLogin`，不卡住、不弹窗；
- built app（`npm run tauri build -- --debug`）实测；
- 页面无 Tauri IPC：恶意页面不能调用 app 命令；
- 不新增外部服务、不改浏览器扩展依赖。

## 11. 开放问题

1. `source_url` / `source_author` / `source_published` 是否入 §4.2。
2. 图片默认本地化还是先保留远程 URL。
3. 是否复用 Textus 网页标签的 profile（不做登录态，但同 profile 可复用同意/反爬 cookie）。
4. 权限命名 `web.read` 与安装提示文案。
5. 站点规则清单与维护责任（公众号 `data-src`、小绿书、知乎等）。
6. AI 入口（`clip_url` aiTool）与剪后总结/打标签是否同期。
7. 浏览器扩展是否作为过渡先做（方案 C）。

## 12. 非目标

- 登录态、付费墙、验证码、cookie 导入；
- 服务端抓取（post-snap 形态）；
- 手机第一版；
- 逐站规则预做；
- 运行期用 AI 改写/提取正文（可选兜底也不做默认）；
- iOS。

## 13. 记录

- 2026-11-22：用户定"后期功能，先文档记录，暂不做"；范围 = 公开页。
- 讨论结论：post-snap 服务形态否决；插件自抓不作为主路径；宿主隐藏 WebView + Defuddle 为选定路径；AI 仅用于开发加速/入口/后处理，不做默认提取。
- 参考：[Defuddle](https://github.com/kepano/defuddle)（MIT）、[Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper)（MIT，浏览器扩展 + 剪贴板/URI 的参考实现）。
