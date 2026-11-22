---
type: spec
status: draft
summary: 单文件 Markdown、图片内嵌、代码栅栏标注
updated: 2026-11-23
---
# Textus 文档便携与呈现扩展方案

> **状态：方案初稿（2026-11-22），待用户拍板；本文只定取舍、实现路径与任务，不开工。**
> 对象：桌面 + 手机（按现有 `capabilities.ts` 分端；插件先桌面）。
> 关联：[《改造任务清单》](../STATUS.md) ED2/ED3/A12/U19/U20 · [《改造方案》§7.9](Textus-改造方案.md)（三条红线 / 两条承载台阶）· [《插件 API 要点》](../research/插件API要点.md) · AutumnMark v0.24.44 对照。
> 存放：`docs/skein/specs/`

## 0. 一句话

AutumnMark 的四项扩展按《改造方案》§7.9 的三条红线过筛：**代码栅栏标注做（ED2）**，**单文件图片内嵌做成导出插件（ED3）**，**文件树附件收敛做默认/开关（A12）**，**内容选项卡暂缓（U19）**，**折叠块不另造语法**；**不做 Base64 默认存储**（U20 触发再看）。

---

## 1. 上游做到了什么（基线 v1.4.6）

> 当前基线是 v1.4.6；上游 `origin/main` 已到 v1.4.6-rc.4。以下按本仓基线核对，不把上游 roadmap 当我们的规划。

| 能力                    | 上游现状                                                                                                                                                      | 证据                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 图片存储                | 只有 `local`（文档约定 / 设置里的附件夹）与 `image-host`（图床）；**没有** Base64 内嵌模式                                                                    | `src/prefs/settings-values.ts:207`、`src/editor/images/image-store.ts:96`                             |
| 图片显示                | `data:image/...;base64` 能解析、能显示；HTML 清洗允许 data URI                                                                                                | `src/editor/images/image-plugin.test.ts:97`、`src/editor/html/html-values.ts:61`                      |
| HTML / PDF 导出         | 默认把本地图片**内联**成 data URL；PDF 同路径                                                                                                                 | `src/export/exporters.ts:152`、`:245`、`src/export/standalone-html.ts:148`                            |
| Word / ODT / RTF / EPUB | `export-formats.json` 标 `embedsImages: true`，经 pandoc 导出时图片随文件走                                                                                   | `src/registry/export-formats.json`                                                                    |
| Markdown 导出           | 走 pandoc，图片仍按路径引用，**不是单文件**                                                                                                                   | `src/export/exporters.ts` 的 pandoc 分支                                                              |
| 插件导出                | API 1.8（Textus 1.4.4 起）有 `export.registerFormat({ label, extension, export })`；插件拿到 `{ markdown, html, path }`，返回文本或字节，宿主负责选路径并写入 | `docs/dev/plugins/reference.md` §Export、`src/plugins/host/broker-export.ts`                          |
| 文件树                  | 有“所有文件 / 只看文档”两档；**默认是所有文件**；附件夹照常出现                                                                                               | `src/files/useTreeData.ts:16`、`src/files/TreeNodes.tsx:90`                                           |
| 代码栅栏                | fence 语言后的 meta **原样保留**（`title="a.js" {1,3}` 可 roundtrip）；未渲染文件名 / 行范围 / 预览高度                                                       | `src/editor/markdown/markdown-output.ts:238`、`src/editor/markdown/markdown-output.test.ts:93`        |
| 折叠                    | 已有 `<details>` 折叠、标题折叠、嵌入块折叠；**没有** `<!-- fold -->` 注释协议                                                                                | `src/editor/html/details-fold.ts`、`src/editor/fold/heading-fold.ts`、`src/editor/fold/block-fold.ts` |
| 内容选项卡              | **没有**；只有文档页签                                                                                                                                        | 全仓无 `contentTabs` / `<!-- tabs`                                                                    |
| 官方插件                | 官方插件仓当前未见 `registerFormat` 使用者（2026-11-22 grep 结果）                                                                                            | `textus-plugins` 仓                                                                                   |

**结论**：上游已经把“给人看/给人改”的导出做得很全（HTML/PDF/DOCX/EPUB），也把代码栅栏的 meta 留好了；我们真正缺的是三件小事：

1. 把 fence meta 渲染成文件名 + 行高亮（+ 可选预览高度）；
2. 一个**单文件 Markdown** 的便携出口（插件即可）；
3. 文件树默认不把附件摊在眼前（一个小 UI 改动）。

内容选项卡和折叠块注释不是“缺”，而是“成本高 / 已有替代”，不该因为 AutumnMark 有就跟着做。

---

## 2. AutumnMark 怎么做的、对我们意味着什么

> 功能代码在发布 tag `v0.24.44`；默认 `develop` 分支反而没有这几个文件，别按 develop 读。

| 功能         | AutumnMark 的做法                                                                                                                       | 对 Textus 的判断                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 内容选项卡   | `<!-- tabs -->` + `#### \| 标签`；编辑器把普通块**投影**成 tab bar，切换只改 class，不写文档；导出时全部面板按顺序展开                  | 思路合规（无损 / 单一真相），但 `editor/contentTabs.ts` 721 行，选区、IME、撤销、隐藏块边界都在里面；对我们是**暂缓**项 |
| 折叠块       | `<!-- fold -->` / `<!-- fold open -->` / `<!-- /fold -->`；标题必须是标题或整段粗体；投影成 disclosure；导出 `<details open>`           | Textus 已有 `<details>`、标题折叠、嵌入块折叠；再发明一套注释语法是**重复**，不做                                       |
| 代码栅栏标注 | 解析 `title=` / `{2-3}` / `max-lines=`；按实际行 top 画整行高亮（换行也覆盖）；`max-lines` 限高 + 展开按钮；导出 `<figure><figcaption>` | Textus 的 fence meta 已保留、代码工具栏/行号/高亮已有；**最值得吸收**，且可以留在新目录 + 少量 hook                     |
| Base64 图片  | 设置“嵌入 Markdown（Base64）”；粘贴后写成标准 `![](data:image/...;base64,...)`；异步粘贴 + diff 映射光标；可“转换为本地图片”            | 功能价值真实，但**只做导出/便携副本**，不做默认存储；用插件实现，避免上游 rebase                                        |
| 设计原则     | 四项都支持渐进回退：别的编辑器打开至少能读                                                                                              | 与《改造方案》§7.9.1 的三条红线同源；作为评审规则沿用                                                                   |

实现位置（供开工时对照）：

- [README / 渐进回退表](https://github.com/Autumn-one/autumnmark/blob/v0.24.44/README.md)
- [内容选项卡语法层](https://github.com/Autumn-one/autumnmark/blob/v0.24.44/packages/muya/src/utils/contentTabs.ts) · [编辑器投影层](https://github.com/Autumn-one/autumnmark/blob/v0.24.44/packages/muya/src/editor/contentTabs.ts)
- [折叠块语法层](https://github.com/Autumn-one/autumnmark/blob/v0.24.44/packages/muya/src/utils/foldBlocks.ts) · [编辑器投影层](https://github.com/Autumn-one/autumnmark/blob/v0.24.44/packages/muya/src/editor/foldBlocks.ts)
- [代码栅栏解析](https://github.com/Autumn-one/autumnmark/blob/v0.24.44/packages/muya/src/utils/codeFenceAnnotations.ts) · [行高亮测量](https://github.com/Autumn-one/autumnmark/blob/v0.24.44/packages/muya/src/utils/codeBlockLineNumbers.ts) · [限高](https://github.com/Autumn-one/autumnmark/blob/v0.24.44/packages/muya/src/editor/compactBlocks.ts)
- [内嵌图片](https://github.com/Autumn-one/autumnmark/blob/v0.24.44/packages/muya/src/utils/embeddedImage.ts) · [异步粘贴改写](https://github.com/Autumn-one/autumnmark/blob/v0.24.44/packages/muya/src/clipboard/embedPastedImages.ts)

---

## 3. 取舍（按 §7.9 三条红线）

| 候选                     | md 真身                                                | 承载                              | 判定            | 理由                                                              | 任务    |
| ------------------------ | ------------------------------------------------------ | --------------------------------- | --------------- | ----------------------------------------------------------------- | ------- |
| 代码栅栏标注             | fence info string（`title=` / `{n-m}` / `max-lines=`） | 内核渲染小改（新目录 + 装饰插件） | **做**          | 无损、字节一致；Textus 已保留 meta；技术写作高频                  | **ED2** |
| 单文件 Markdown 便携     | 标准 md + `data:` URI                                  | 插件轨道 `export.registerFormat`  | **做**          | 上游 API 已够；不碰内核；解决“一个文件带走”                       | **ED3** |
| 文件树附件收敛           | 不改 md                                                | 宿主 UI                           | **做**          | 最便宜的“手感”改动；直接解决附件夹碍眼                            | **A12** |
| 内容选项卡               | 注释 + `\|` 标题                                       | 内核投影                          | **暂缓**        | 成本高（700+ 行 + 选区/IME/撤销）；受众窄；标题会进 outline       | **U19** |
| 折叠块注释               | 注释 + 标题                                            | 内核投影                          | **不做**        | 已有 `<details>` / 标题折叠 / 嵌入块折叠；§7.9 已把 toggle 列暂缓 | —       |
| Base64 默认存储          | 正文里的 `data:`                                       | 内核图片管线                      | **不做 / 触发** | 连续成本高（体积 / AI / 搜索 / 同步 / 移动端）；兼容性不稳        | **U20** |
| 文档转图片               | —                                                      | 导出 / 插件                       | **不做本期**    | 适合社交/封面/速览，不是长文文档格式；查看用 HTML/PDF 更好        | —       |
| DOCX / HTML / PDF / EPUB | —                                                      | 上游已有                          | **不重复**      | 直接使用现有导出；不因 AutumnMark 重做                            | —       |
| 渐进回退                 | —                                                      | 评审规则                          | **沿用**        | 已是 §7.9.1 的三条红线；新语法必须过                              | —       |

**判断依据**：图片内嵌的收益主要在分享/搬文件时，成本（体积、AI 上下文、搜索、同步、移动端内存）却每天存在；所以把它做成 **ED3 的导出/便携副本**，不做默认存储。提取命令保证图片拿得回来，不是锁死。图片内嵌本身没有被否掉，ED3 就是它的落地形态。

---

## 4. 选定方案

### 4.1 ED2：代码栅栏标注

**语法（只读解析，不发明新块）**

````markdown
```python title="ridge.py" {2-3} max-lines=4
heights = [720, 1160, 1380]
...
```
````

- `title="..."`：文件名，显示在代码块上方；没有就不显示。
- `{2-3}` / `{1,3-5}`：行范围，合并重叠/相邻区间；非法区间忽略。
- `max-lines=4` / `max-lines=none`：只影响显示高度，复制仍拿完整代码。
- v1 只解析手写 meta，不做“可视化选行”编辑器；后续需要再加菜单。

**实现路径（先 spike，再定）**

1. **纯解析层**：新目录 `src/features/code-fence-annotations/`，解析 `node.attrs.meta`，不碰 schema / markdown roundtrip。
2. **富文本渲染**：优先用 ProseMirror 装饰插件，不改 Milkdown 的 code block node view：
   - 文件名：在代码块前放一个 `contenteditable=false` 的 widget decoration，CSS 做成标题条；需要验证它不进入复制文本、不影响上下方向键。
   - 行高亮：插件视图读取代码块 DOM，按实际逻辑行 top 设背景渐变；Textus 的代码是 `white-space: pre-wrap`，**不能**用 `line-height × 行号` 直接算。
   - 若 widget/装饰在 node view 上不可行，退化为对 `src/editor/code/code-block-language-view.ts` 的一处小补丁；补丁必须小、可 rebase。
3. **源码模式**：CodeMirror 行装饰画 `{n-m}` 范围；标题不特殊渲染（源码里就是 meta 文本）。
4. **导出**：HTML/PDF 序列化实时 DOM，标题与行高亮自然带出；`max-lines` 的折叠态要在 `src/export/standalone-html.ts` 里展开（已有块折叠/标题折叠的展开逻辑，接一条同样的规则）。
5. **测试**：纯解析单测；富文本/源码/导出三处视图测试；大代码块性能；手机窄屏；新增 UI 字符串（展开/收起）进十个 locale。

**分片**

- **ED2a**：`title` + 行范围（先做）。
- **ED2b**：`max-lines` 限高 + 展开按钮（第二片，避免第一片被交互拖大）。

**验收**

- 带标注的文档保存后字节不变（roundtrip 门禁照过）。
- 富文本与源码模式都能看到行范围；换行行的高亮覆盖整个视觉行。
- HTML/PDF 导出带文件名和行高亮；`max-lines` 导出时全部展开；复制始终完整。
- 手机布局不溢出；十个 locale 有展开/收起文案。

**估算**：ED2a 3–5 天；ED2b 2–3 天。**风险**：代码块换行测量、widget 是否进入复制、上游 code block 改动导致 rebase；先做 0.5–1 天 spike。

### 4.2 ED3：单文件 Markdown 便携插件

**为什么走插件**：上游 API 1.8 的 `export.registerFormat` 已经让插件拿到 `{ markdown, html, path }` 并返回文件内容；这正好是“把图片换成 data URL 后写一份 .md”的接口。**不需要改宿主**，rebase 成本约为零。

**插件行为**

- 文件菜单出现一个独立格式，例如 **“Portable Markdown (images embedded)”**，扩展名 `md`；不要和现有“Markdown”导出混名。
- 导出时：
  1. 扫 Markdown 里的图片引用：`![](...)`、`<img src=...>`、`![[...]]`（按文件夹约定解析）；
  2. 用 `files.read` 读图片字节，转 `data:<mime>;base64,...`；
  3. 返回改写后的 Markdown；源文件不动。
- 反向命令 **“Extract embedded images”**：扫 `data:image/...`，用 `files.write` 写到附件夹，再用 `files.process` 改回相对路径（`files.process` 是撤销友好的）。
- 兼容提示：导出后提示“GitHub/GitLab 等平台通常不显示 `data:` 图片；要保证对方能看，用 HTML/PDF”。大文件提示体积。
- 权限最小集：`files.read`；提取再加 `files.write`。不联网。
- 先桌面；手机插件运行时可用再补手机。

**先验证的两点**

1. `files.read` 对文档图片路径的解析：`path` 是绝对路径还是文件夹相对路径；`![[图片]]` 怎么用 `files.find` / `resolveNote` 找。
2. 插件格式与现有 pandoc Markdown 导出在 File › Export 里的排序/命名是否会让用户混淆；必要时只放命令面板。

**验收**

- 含相对图片、`<img>`、`![[...]]` 的文档导出为单个 `.md`；在 Textus 和至少两个允许 data URI 的 Markdown 编辑器里图片可见。
- 源文档不变；再次导入/提取能恢复成附件文件；提取是一次可撤销编辑。
- GitHub 不可见的限制写在提示里，不假装通用。
- 插件不要求网络权限；停用插件后导出项消失。

**估算**：3–5 天（含路径解析 spike、提取、测试、兼容性走查）。

### 4.3 A12：文件树附件收敛

**现状**：Textus 默认文件树是“所有文件”（`src/files/useTreeData.ts:16`），图片落在文档约定或设置里的附件夹；用户会看到附件夹和一堆图片。上游已经支持“只看文档”（`src/files/TreeNodes.tsx:90`），只是默认没用。

**方案（按成本从低到高）**

- **A（推荐先做）**：默认 `documents` scope。图片文件不再出现在树里；用户仍可切到“所有文件”。附件夹这一行可能还在，但里面不再摊图片。
- **B（A 不够再做）**：给“隐藏附件文件夹”一个开关，按文档约定/设置识别附件夹并从树里隐藏（只在树里隐藏，磁盘不动）。
- **C（不推荐）**：把附件夹改成隐藏点目录或搬进应用数据目录——会破坏现有相对路径/第三方约定，先不做。

**与 D1 资产库的关系**：资产库/右侧栏负责“看图片、管理图片”；文件树负责“只显示文档”。两者不重复。不要为了树干净去做 Base64 默认存储。

**验收**

- 新用户默认看不到图片文件；切“所有文件”能看到。
- 已有文档的相对路径、图片显示、搜索不受影响。
- 手机文件树同样生效；设置/开关有十语言文案（若加开关）。
- 不改变图片存储位置与现有约定。

**估算**：A 1 天；B +1–2 天。

### 4.4 U19：内容选项卡（暂缓）

**判定**：不在 ED1 优先序里立项；记为触发点。

**不作为默认做的原因**

- 编辑器投影约 700 行，选区、IME、撤销、隐藏块边界、Select All、方向键都要单独处理；
- tab 标题是真标题，会进 outline / 影响标题编号；Textus 还要改 `outline-parse`；
- 当前 tab 不落盘，重新打开永远回第一个；对教程类够用，对“记住上次选择”不够；
- Textus 的 HTML 注释已有自己的批注预览，`<!-- tabs -->` 会被当普通注释显示，需要额外压制。

**触发**：出现真实的“教程/多平台步骤/对比”写作需求，且用户接受“默认第一个 tab”。

**若做，v1 只做**：点击切换 + 导出全部展开；不做标题编辑、加 tab、源码开关。**备选**：插件轨道做一个 ` ```tabs ` 围栏试验，成本低但降级效果差（别的编辑器看到的是代码块，不是可读标题）。

### 4.5 U20：每文档 Base64 存储（暂缓）

**判定**：不做默认存储；ED3 导出不够用时再看。

**触发**：ED3 上线后，用户反复要求“原文件本身就必须单文件”，且能接受体积/兼容性。

**若做，边界**：

- 按文档开关，默认关；显示体积与兼容性提示；
- 大图/大文档阈值提醒；
- AI 上下文、搜索索引跳过 Base64；
- 图片可右键“提取/另存为”；
- 不改变默认 `imageStorageMode`。

### 4.6 明确不做

- **折叠块注释**：已有 `<details>`、标题折叠、嵌入块折叠；`§7.9.3` 已把 toggle 列暂缓。若只是缺入口，另做“插入 `<details>`”的小命令，不新增语法。
- **文档转图片**：适合社交/封面/速览，不是长文文档格式；查看用 HTML/PDF，编辑用 DOCX/Markdown。
- **重做 DOCX/HTML/PDF/EPUB**：上游已有，直接使用；HTML/PDF 已内联图片，DOCX/EPUB 已嵌图。

### 4.7 渐进回退

AutumnMark 的四项都遵守“别的编辑器打开至少能读”。Textus 已有 §7.9.1 三条红线（信息无损 / 真相单一 / 往返字节一致），本方案不新增规则；ED2/ED3 的实现必须按这三条过。

---

## 5. 任务清单（挂账）

| ID       | 任务                                              | 状态   | 验收                                                              | 出处      | 估算             |
| -------- | ------------------------------------------------- | ------ | ----------------------------------------------------------------- | --------- | ---------------- |
| **A12**  | 文件树附件收敛（默认 documents / 隐藏附件夹开关） | ☐      | 默认看不到图片文件；切换可看；路径/搜索/手机不受影响              | 本文 §4.3 | 1–2 天           |
| **ED2a** | 代码栅栏 `title` + 行范围                         | ☐      | roundtrip 不变；富文本/源码/导出可见；换行行整行高亮；手机/十语言 | 本文 §4.1 | 3–5 天           |
| **ED2b** | 代码栅栏 `max-lines` 限高                         | ☐      | 限高 + 展开；复制完整；导出展开；光标/选区安全                    | 本文 §4.1 | 2–3 天           |
| **ED3**  | 单文件 Markdown 便携插件 + 提取图片               | ☐      | 单个 `.md` 含 data URI；源文件不变；提取可撤销；兼容提示          | 本文 §4.2 | 3–5 天           |
| **U19**  | 内容选项卡                                        | ☐ 暂缓 | 触发才立项；v1 只做点击切换 + 导出全展开                          | 本文 §4.4 | 1.5–2 周（若做） |
| **U20**  | 每文档 Base64 存储                                | ☐ 暂缓 | ED3 后仍被反复要求才做；默认关、可提取                            | 本文 §4.5 | 3–5 天（若做）   |

**顺序（一个人不并两条链）**：A12 → ED2a → ED3 → ED2b；U19/U20 只在触发后插队。  
**依赖**：ED2 先做 0.5–1 天 widget/装饰 spike；ED3 先做 `files.read` 路径解析 spike；A12 先定“默认 documents 还是加开关”。

---

## 6. 怎么衡量（做完看什么）

- **A12**：新用户文件树里图片文件数 = 0；从“打开库”到找到目标笔记的步骤数不增加；无“图片看不见了”的误报（切所有文件仍可见）。
- **ED2a**：带 `title=` / `{n-m}` 的文档数；roundtrip 零失败；大代码块打开/滚动无卡顿；导出的 HTML/PDF 走查。
- **ED3**：导出次数 / 提取次数；兼容性走查（Textus、至少两个 Markdown 编辑器、浏览器、GitHub）；导出文件体积；5 人任务测试（写带图笔记 → 移动 → 发送 → 对方打开）。
- **U20 触发**：ED3 后仍反复要求“原文件单文件”；大文件导致打开/搜索/AI 明显变慢则不做。
- **U19 触发**：真实教程/对比需求；若做插件试验，看使用次数与“别的编辑器可读”投诉。

**判断规则**：如果 A12 + ED3 解决了“树脏 / 单文件分享”，U20 不做；如果 ED2a 的使用率低，ED2b 不做。

---

## 7. 风险与纪律

- **薄 fork**：ED2 的解析/装饰住 `src/features/code-fence-annotations/`，上游文件只留单点 `.use(...)` / 一处小补丁；接入点按《改造方案》§12.4 记录。ED3 全在插件，不改宿主。A12 是宿主小改，尽量只动 `useTreeData` / `TreeNodes`。
- **上游跟随**：ED2 会碰代码块附近的上游文件，rebase 时优先 rerere；上游若改 code block node view，按新接口重接，不改上游公共文件。
- **换行**：Textus 代码块 `pre-wrap`，行高亮必须按实际行 top 测量；不能按行号乘行高。
- **widget 复制**：文件名 widget 必须 `contenteditable=false` 且不进入复制文本；spike 先验证。
- **Base64 兼容**：GitHub/GitLab 等平台通常不显示 `data:`；插件提示，不假装通用。提取必须可逆。
- **文件树默认**：改默认会影响老用户；加开关/迁移说明，保证“所有文件”一键可见。
- **手机/十语言/设计**：ED2 的展开/收起、A12 的开关、ED3 的提示都要十语言；颜色/间距用 token，不写裸值。
- **不扩范围**：内容选项卡、折叠块注释、文档转图片不在本期；有人提需求先改本文再改任务清单。

---
