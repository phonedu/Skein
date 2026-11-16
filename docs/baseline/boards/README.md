# 画板与截图对照（界面基线的视觉依据）

> 《Textus-界面改造方案》§2 与 §3 的视觉依据：**画板（设计）与落地截图（实现）放在一处，逐张对照。**
> 入库日期：2026-11-16 · 版本：v0.1

## 为什么在这里

画板原本只存在于本地草稿 `.ryugi/artifacts/artboard/textus-breakpoints/`（Ryugi 画板工作区，未入库），
机器一换、目录一清就失联。而 §2.1 的规矩是「**画板是尺寸的权威**」——这条规矩要能被后来人核对，
画板本身就必须在仓里：图与源文件（HTML）都搬到了这里，源文件保持逐字节原样。

**权威顺序不变**：画板声明的尺寸 > `docs/design/design-language.md` > 平台规范（Fluent / Apple HIG）。

## 目录

| 目录                | 内容                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `screens/`          | 界面清单：桌面七屏 + 手机九屏 + 总览（每张一张 PNG + 一份 HTML 源）                                      |
| `skeleton/`         | A 方案的骨架：今天（桌面 / 手机）、断点阶梯、行与三段式、两个缺口的出路（PNG + HTML）                    |
| `directions/`       | 三份方向稿：A 连续面（已选）/ B 书房 / C 专注流（只有 HTML 源，未渲染成图）                             |
| `shots/`            | 落地截图：桌面三档尺寸 + 暗色 + 手机，以及设置浮层的「通用」「外观」× 亮 / 暗                          |
| `skins/`            | 配色对照（2026-11-16 界面复审）：石墨 / 亮纸 / 苹果 / Craft × 亮暗 + 控件条，同屏同内容只有调色板不同——裁决为**未来主题库参考**（《界面改造方案》§4.3 裁决 13），不入当前工作线 |

> 源文件与图的对应关系是一一的：`screens/ui-d-settings.html` 画出 `screens/ui-d-settings.png`，
> 打开源文件能看到画板声明的每一个数值（宽度、行高、字号、颜色变量）。

---

## 界面清单（screens/）

### 总览：一张图看全部界面

桌面七屏 + 手机九屏，同一套 token、同一条三段式。

![界面清单 · 总览](screens/ui-all.png)

### 桌面 · 今天 —— 队列即首页，五个固定分组

![桌面 · 今天](screens/ui-d-today.png)

### 桌面 · 笔记 —— 文件树 + Markdown 编辑器

![桌面 · 笔记](screens/ui-d-notes.png)

### 桌面 · 资产 —— 按触发排，边界三件套

![桌面 · 资产](screens/ui-d-assets.png)

### 桌面 · 确认中心 —— 列表 / diff / 证据三栏

![桌面 · 确认中心](screens/ui-d-confirm.png)

### 桌面 · Agent 时间线 —— 每次调用一张卡片

![桌面 · Agent 时间线](screens/ui-d-agent.png)

### 桌面 · 收集 —— 浮层，不占轨道位置

![桌面 · 收集](screens/ui-d-collect.png)

### 桌面 · 设置 —— 弹窗面板，不占一轨

![桌面 · 设置](screens/ui-d-settings.png)

### 移动端 · 今天 / 笔记 / 收集 / 资产 —— 底栏 56 + 安全区 34，触栏 44 起

![移动端 A](screens/ui-p-a.png)

### 移动端 · 详情 / 确认 / Agent / 更多 / 设置

![移动端 B](screens/ui-p-b.png)

---

## A 方案骨架（skeleton/）

### 今天（桌面 1440）

![A 骨架 · 今天（桌面）](skeleton/a-today-desktop.png)

### 今天（手机 390）

![A 骨架 · 今天（手机）](skeleton/a-today-phone.png)

### 断点阶梯 —— 断点不是新造的，是设计语言 §5.4 那条规则的必然结果

四个断点：≥1280 四区满配 / 1024–1279 四区压缩 / 760–1023 Agent 转覆盖 / <760 单列；
轨道 48 · 侧栏 198–528 · Agent 330–792 · 文档 ≥360。

![A 骨架 · 断点阶梯](skeleton/a-ladder.png)

### 行 / 三段式 / 提案卡 —— 一处定义，四处复用

三种镜头共用同一行字段与同一个详情骨架；行高：笔记 28 / 队列 48 / 触控 56，都落在 4px 网格上。

![A 骨架 · 行 / 三段式 / 提案卡](skeleton/a-card.png)

### 两个缺口的出路 —— 不改七工具的形状：一个加字段，一个加一次动作

阶段与验证这两个缺口各给一条出路（任务卡加 stage 字段；验证改成一次用户动作、一条记录）。

![A 骨架 · 两个缺口的出路](skeleton/a-gaps.png)

---

## 方向稿（directions/）

三份方向稿只留源文件，没有渲染成图：

| 源文件        | 方向                       | 结论                             |
| ------------- | -------------------------- | -------------------------------- |
| `a.html`      | A · 连续面                 | **已选**——骨架与界面清单都出自它 |
| `b.html`      | B · 书房                   | 未采用                           |
| `c.html`      | C · 专注流                 | 未采用                           |

---

## 落地截图（shots/）

截图是**实现**的一侧，与上面的画板一一对照用：改完界面先比这里，差在哪里要能说清。

### 桌面三档尺寸（亮色）

| Small                   | Medium                   | Large                    |
| ----------------------- | ------------------------ | ------------------------ |
| ![Small](shots/desktop-small-light.png) | ![Medium](shots/desktop-medium-light.png) | ![Large](shots/desktop-large-light.png) |

### 桌面 Medium（暗色）与手机

| 桌面 · 暗色                       | 手机 · 亮色                    |
| --------------------------------- | ------------------------------ |
| ![桌面暗色](shots/desktop-medium-dark.png) | ![手机](shots/phone-light.png) |

### 设置浮层（Base UI 模块，`src/features/settings/`）

| 亮色                                        | 暗色                                          |
| ------------------------------------------- | --------------------------------------------- |
| ![通用](shots/settings-dialog-general-light.png) | ![通用](shots/settings-dialog-general-dark.png) |
| ![外观](shots/settings-dialog-appearance-light.png) | ![外观](shots/settings-dialog-appearance-dark.png) |

---

## 原路径对照

入仓前它们在本地草稿里，路径如下（右列为现在的入库位置）：

| 原路径（本地草稿，未入库）                                          | 入库位置                              |
| ------------------------------------------------------------------- | ------------------------------------- |
| `.ryugi/artifacts/artboard/textus-breakpoints/pages/screens/*.html`  | `boards/screens/*.html`               |
| `.ryugi/artifacts/artboard/textus-breakpoints/pages/skeleton/*.html` | `boards/skeleton/*.html`              |
| `.ryugi/artifacts/artboard/textus-breakpoints/pages/breakpoints/*.html` | `boards/directions/*.html`         |
| `.ryugi/sdd/textus-redesign.zh.md/shots/*.png`                       | `boards/shots/desktop-*.png`、`phone-*.png` |
| `.ryugi/sdd/2026-11-15-base-ui-settings-design/shots/*.png`         | `boards/shots/settings-dialog-*.png`  |

图（PNG）由画板工作区渲染而来，与源文件同源；`directions/` 的三份方向稿当时没渲染成图，
要用浏览器打开源文件看。

## 怎么用这份对照

1. **改尺寸前先看画板**：画板写死的数值就是目标值，别用平台规范的默认值覆盖它（除非 §2.2 记了裁决）；
2. **改完对着截图比**：截图是当前实现的真实样子，与画板有差就说明这次改动没对齐——记进《界面改造方案》§2.2 的表；
3. **画板与实现不一致时**：先改画板（重新设计）还是先改实现（对齐）是一次裁决，裁决要落到本文档的表里，别只留在对话里；
4. **源文件是数值的唯一出处**：图上量出来的数可能带误差，要精确值就打开同名的 HTML 看它声明的值。
