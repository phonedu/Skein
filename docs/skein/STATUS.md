---
type: status
status: active
summary: 当前工作线、Now/Next、阻塞与触发点
updated: 2026-11-23
---

# 状态

> **自动生成，勿手改。** 源：[status.yaml](status.yaml)；生成：`npm run docs:status`。
> 只写未完成 / 进行中；完成项由 `npm run docs:task -- done <id> --evidence "..."` 删除并归档。
> 基线：上游稳定 tag **v1.4.6**（合并 `457f6693`）· 分支 `base-ui-settings`。

## 1. 工作线

| 线 | 状态 | 当前焦点 | 出处 |
| --- | --- | --- | --- |
| 资产闭环 | ◐ | D1e 资产详情 / 来源链 / 使用记录 | [规格](specs/Textus-改造方案.md) |
| 手机端 UI | ◐ | PH3/PH4 核查 | [规格](specs/Textus-手机端元素一致性方案.md) |
| 同步（S 组） | ◐ | S3q 七牛原生专项；S3b 的 S3 条件写已判负 | [规格](specs/同步方案.md) |
| 上游跟随（B 组） | ◐ | v1.4.6 已并线（457f6693）；TW1 已修（879fd773）；等下一个稳定 tag | [规格](specs/Textus-改造方案.md) |
| 主题（T1） | ◐ | 阶段 0 文档完成；阶段 1 锁皮肤代码按需插队 | [规格](specs/Textus-主题策略.md) |
| 文档（DOC） | ◐ | 文档 / 上游 / 发布命令自动化已落地；等下一次实战 | [规格](decisions/0052-文档体系重排.md) |

## 2. Now（按顺序）

1. **D1e** — 资产详情 / 来源链 / 使用记录。验收：桌面 + 手机能在详情里看到来源与使用历史，写入走确认流。规格：[规格](specs/Textus-改造方案.md#75-资产与确认界面在办)；估算 1–2 周。

## 3. Next

| # | 任务 | 状态 | 验收 / 说明 | 出处 | 估算 |
| --- | --- | --- | --- | --- | --- |
| **D1r** | 外部 AI 复核（opencode） | ☐ | 独立 worktree / 干净检出；只读 + 测试；阻断项修完再进 D0.5 / D1d。 | [规格](discipline/AI协作纪律.md#十外部-ai-复核2026-11-21-用户立规) | 1–2 天 |
| **D0.5** | 理论小样本验证 | ☐ | 4 周 10 个真实交付物；封装 ≥3 条资产并真实调用；复用率 ≥30%；≥3 条反例。 | [规格](specs/Textus-改造方案.md#8-实施计划) | 4 周日历 |
| **D1d** | 附录 A 验收（15 条） | ☐ | 除 iOS 外的 15 条；第 14 条依赖 D0.5。 | [规格](specs/Textus-改造方案.md#附录-a阶段-1-验收清单) | 1 周 |
| **D1f** | 理论淘汰 / 复盘 / 修数 | ☐ | 30 天未验证、3 周期 deprecated、90 天复查、月度复盘。 | [规格](research/笔记资产理论.md) | 1 周 |
| **S3q** | 七牛 Kodo 原生传输专项 | ☐ | 上传凭证 + insertOnly transport；引擎 / 设置接线；真桶首次 / 改 / 删 / 冲突。 | [规格](research/同步评审/07-S3-Provider兼容性.md) | 5–8 天 |
| **PH3+PH4** | 手机元素一致性 + 现状收尾 | ☐ | A/B/G/I 核查 + §4.1/§4.3 未采项；逐项标证据。 | [规格](specs/Textus-手机端元素一致性方案.md#13-执行清单) | 5–8 天 |
| **T1** | 主题分层与 Skein 皮肤阶段 1 | ☐ | 导入主题不再派生 / 覆盖 --ui-*；保留 --doc-*；Prism 降级或做完整皮肤。 | [规格](specs/Textus-主题策略.md) | 3–5 天 |

## 4. Later（3–6 个月，按人周估算）

| # | 任务 | 说明 | 出处 | 估算 |
| --- | --- | --- | --- | --- |
| S4 | 局域网 Hub | 桌面本地仓库服务 + 发现 / 配对；手机同 Wi-Fi 直连。 | [规格](research/同步评审/06-多库同步设计.md) | 2–4 周 |
| S5 | 同步硬化 | signed head、lastRevision、history/head 一致性、块自愈、密钥存储。 | [规格](research/同步评审/05-安全与威胁模型评审.md) | 2–3 周 |
| D2 | 受控写入下沉 | Rust 资产服务；绕过界面无法写正式状态；Android 真机。 | [规格](specs/Textus-改造方案.md) | 4–6 周 |
| D3 | 多端入口完善 | 手机独立完成“收集 → 次日确认”；冲突中心；系统分享按待审默认不做。 | [规格](specs/Textus-改造方案.md) | 3–5 周 |
| ED1 | 块与呈现扩展（候选池） | Mermaid 试点 → 画廊 → 筛选视图 → 多列布局；不做块数据库。 | [规格](specs/Textus-改造方案.md) | 按件估算 |
| ED2a | 代码栅栏 title + 行范围 | 富文本 + 源码 + 导出三处可见；roundtrip 字节不变。 | [规格](specs/Textus-文档便携与呈现扩展方案.md) | 3–5 天 |
| ED2b | 代码栅栏 max-lines 限高 | 限高 + 展开；复制完整；导出时展开。 | [规格](specs/Textus-文档便携与呈现扩展方案.md) | 2–3 天 |
| ED3 | 单文件 Markdown 便携插件 | 含 data URI 的单个 .md；支持相对图片 / <img> / ![[...]]。 | [规格](specs/Textus-文档便携与呈现扩展方案.md) | 3–5 天 |
| CP1 | 网页剪藏（公开页版，后期） | 贴 URL → inbox/N-*.md；只做公开页，不碰登录态。 | [规格](specs/Textus-剪藏功能方案.md) | 桌面 1 周 + 手机 3–5 天 |

## 5. Waiting / Blocked

- 第三方 WebDAV：坚果云 / Nextcloud 无凭据，S2c-V2 等它；外部阻塞。
- 移动端加密：S3 v1 用明文仓库；内置 / 插件真机加密同步未做。
- 传输预算：协议写 32 MiB，内置引擎单文件峰值可达 128 MiB；归 S5。
- 服务器时间：协议要求 Date 优先，内置引擎只用本地 Utc；归 S5。
- 同步页俄语存量标签：Folder / Synced. / Last synced / Service / Server address / Remote folder / Save connection 仍英文；归文案清理。
- D1b 观察期锚点：卡片没有 activated_at，按 created_at 计；D1f 若需要真激活时间再补字段。
- D1b 手机入口：窄屏确认中心已在桌面 WebView 344 CSS px 验过；Android/iOS 入口归 D3。
- H9 SAF：2026-11-21 关闭；content:// 不做，除非出现真实用户场景。
- S3b：七牛 S3 条件写返回 unsafeServer，东区域 IncorrectRegion；原生 insertOnly 走 S3q；阿里云不做。

## 6. 待审 / 触发点

| # | 事项 | 默认 / 建议 | 触发 / 状态 | 出处 |
| --- | --- | --- | --- | --- |
| U11 | 默认连接 / 远端子仓库改名 / 同库双连接 / 多用户共享 / 库只读 | 资产库关系已定（子目录）；其余按 06 §6 | S2a 已落连接 / 绑定 / 身份；其余待后续 | [出处](research/同步评审/06-多库同步设计.md) |
| U15 | DSH 两用法 / 向量 RAG / 子代理编排 / WorkBuddy 自动化 / textus.git | 默认不做；DSH 触发 = 稳定版 + 插件 API 冻结；RAG = 关键词不够；textus.git = 需要 Git 提交而非 _history/ | 待审 | [出处](research/Agent基座与竞品调研.md) |
| U17 | S4 发现 / 配对方式 | S0d 已定方向；二维码 / 短码是连接迁移建议，不是 LAN 发现方案 | S4 前细化 | [出处](research/同步评审/06-多库同步设计.md) |
| U19 | 内容选项卡（注释标记 + 标题前缀） | 暂缓；v1 只做点击切换 + 导出全展开；不做标题编辑 / 加 tab | 真实教程 / 多平台对比需求 | [出处](specs/Textus-文档便携与呈现扩展方案.md) |
| U20 | 每文档 Base64 图片存储 | 不做默认存储；先走 ED3；若做则默认关、可提取、AI / 搜索跳过 | ED3 后仍反复要求单文件 | [出处](specs/Textus-文档便携与呈现扩展方案.md) |
