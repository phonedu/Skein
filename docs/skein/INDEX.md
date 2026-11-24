# Skein 文档索引

> 自动生成，勿手改。运行 `npm run docs:index` 重新生成；`npm run check:skein` 会在过期时失败。

## 现在

- [状态](STATUS.md) — 当前工作线、Now/Next、阻塞与触发点

## 在办规格

| 文档 | 状态 | 更新 | 说明 |
| --- | --- | --- | --- |
| [Textus Agent 工具契约](specs/Textus-Agent工具契约.md) | active | 2026-11-23 | Agent 七工具的输入输出、权限与确认门槛 |
| [Textus 主题策略（Skein）](specs/Textus-主题策略.md) | active | 2026-11-23 | Skein 皮肤与文档主题的分层契约 |
| [Textus 手机端全局元素一致性方案](specs/Textus-手机端元素一致性方案.md) | active | 2026-11-23 | 手机端元素一致性与 PH3 验收清单 |
| [Textus 改造方案（项目基线）](specs/Textus-改造方案.md) | active | 2026-11-23 | 产品定位、架构、数据模型、阶段与验收 |
| [同步方案（内置）](specs/同步方案.md) | active | 2026-11-24 | 内置同步分层、多库、加密与迁移 |
| [同步验收测试工程（专用测试项目）](specs/同步测试工程.md) | active | 2026-11-24 | 同步专用测试项目：双实例桌面 harness、媒体与多库用例 |
| [同步页改版与连接模型（S6 / S7）](specs/同步页面改版.md) | active | 2026-11-25 | 同步页信息架构改版，以及 WebDAV/S3/局域网 Hub 的互斥与切换规则 |
| [局域网 Hub（S4）](specs/局域网Hub.md) | active | 2026-11-24 | 局域网 Hub：桌面内嵌 WebDAV 服务、配对与手机直连 |
| [文档体系 v3](specs/文档体系-v3.md) | active | 2026-11-24 | 文档 v3：四层目录、工作台账、双向链接与提交硬门禁 |
| [界面契约](specs/界面契约.md) | active | 2026-11-23 | 界面适配的权威基准：令牌、桌面/手机模式、图标档位、上游新界面的适配流程与屏幕索引 |

## 提案 / 暂缓

| 文档 | 状态 | 更新 | 说明 |
| --- | --- | --- | --- |
| [Textus 网页剪藏方案（公开页版）](proposals/Textus-剪藏功能方案.md) | deferred | 2026-11-23 | 网页剪藏公开页版（后期） |
| [Textus 文档便携与呈现扩展方案](proposals/Textus-文档便携与呈现扩展方案.md) | draft | 2026-11-23 | 单文件 Markdown、图片内嵌、代码栅栏标注 |
| [笔记理论的传统界面落点（考虑稿）](proposals/Textus-笔记理论的传统界面落点.md) | draft | 2026-11-23 | 笔记理论落到现有界面的考虑稿 |

## 冻结规格

| 文档 | 状态 | 更新 | 说明 |
| --- | --- | --- | --- |
| [Textus-界面改造方案](specs/Textus-界面改造方案.md) | frozen | 2026-11-24 | 已归档，现行规则见界面契约 |
| [同步协议 v1 规范（冻结）](specs/同步协议-v1.md) | frozen | 2026-11-23 | 同步协议 v1：路径、分块、锁、发布顺序 |

## 裁决

- [裁决索引](decisions/README.md) — 64 条，按 ID 查；新裁决写 `decisions/NNNN-*.md`。

## 纪律

| 文档 | 状态 | 更新 | 说明 |
| --- | --- | --- | --- |
| [AI 协作纪律（下游增补）](discipline/AI协作纪律.md) | active | 2026-11-23 | 协作纪律：任务六行、多会话红线、文档更新矩阵 |
| [fork 触点清单（上游合并的回归面）](discipline/fork-触点清单.md) | active | 2026-11-23 | fork 住在上游也有的文件里的改动清单；上游 tag 合并（如 1.4.7）前后按它核对回归面 |
| [发布闸门：Skein 与上游的隔离](discipline/publishing-gate.md) | active | 2026-11-23 | 向上游推送、开 PR 的发布门禁 |
| [安装包与插件上传流程](discipline/发布上传流程.md) | active | 2026-11-24 | 发版时构建哪些安装包、要不要打包插件、上传哪些资产与事后校验 |
| [工程菜谱（本仓操作步骤）](discipline/工程菜谱.md) | active | 2026-11-23 | 本仓高频操作步骤：同步、插件、设置、界面、跟 tag、文档 |
| [薄 fork 魔改原则](discipline/薄fork魔改原则.md) | active | 2026-11-23 | fork 改动最小化、跟随上游的原则 |

## 调研

| 文档 | 状态 | 更新 | 说明 |
| --- | --- | --- | --- |
| [Agent 基座与竞品调研](research/Agent基座与竞品调研.md) | reference | 2026-11-23 | Agent 基座与竞品调研结论 |
| [outl 对照调研与吸收清单](research/outl-对照与吸收.md) | reference | 2026-11-23 | outl 源码、功能、界面对照与吸收清单 |
| [Tau 可吸收功能清单](research/Tau-可吸收功能清单.md) | reference | 2026-11-23 | Tau（LastKnightCoder/editor）可吸收功能清单：对照 Slate 皮肤与现有浮层设置，只记建议吸收项 |
| [上游 1.4.7 界面功能盘点](research/上游1.4.7界面功能盘点.md) | reference | 2026-11-24 | v1.4.6→v1.4.7-rc.4 的界面功能清单、与本仓的差距、取舍建议 |
| [上游的 AI 协作开发方式（参考）](research/上游AI协作开发方式.md) | reference | 2026-11-23 | 上游 AI 协作与文档自动化做法 |
| [代码核对与墨契吸收清单（2026-11-15）](research/代码核对-2026-11-15.md) | reference | 2026-11-23 | 2026-11-15 逐文件代码核对与墨契吸收清单 |
| [同步评审汇总与建议](research/同步评审/00-汇总与建议.md) | reference | 2026-11-23 | 同步评审汇总与建议 |
| [协议兼容性评审（子代理）](research/同步评审/01-协议兼容性评审.md) | reference | 2026-11-23 | 协议兼容性与差分互通评审 |
| [Android 移动端评审（子代理）](research/同步评审/02-Android移动端评审.md) | reference | 2026-11-23 | Android 移动端同步评审 |
| [产品体验与迁移评审（子代理）](research/同步评审/03-产品体验与迁移评审.md) | reference | 2026-11-23 | 产品体验与迁移评审 |
| [架构与维护评审（子代理）](research/同步评审/04-架构与维护评审.md) | reference | 2026-11-23 | 架构与维护评审 |
| [安全与威胁模型评审（子代理）](research/同步评审/05-安全与威胁模型评审.md) | reference | 2026-11-23 | 安全与威胁模型评审 |
| [多库同步设计](research/同步评审/06-多库同步设计.md) | reference | 2026-11-23 | 多库同步设计 |
| [S3 服务商兼容性（S1b 选型）](research/同步评审/07-S3-Provider兼容性.md) | reference | 2026-11-24 | S3 Provider 兼容性 |
| [同步 Provider 支持矩阵与测试边界](research/同步评审/08-Provider支持矩阵与测试边界.md) | reference | 2026-11-24 | 同步 Provider 支持矩阵、未适配清单与测试边界 |
| [同步回馈上游：形态、成熟度门与测试边界](research/同步评审/09-上游同步提案与成熟度门.md) | reference | 2026-11-24 | 同步回馈上游的形态（插件/功能）、成熟度门与 Docker 测试边界 |
| [同步方向评审（讨论中）](research/同步评审/README.md) | reference | 2026-11-24 | 同步评审的阅读顺序与结论索引 |
| [同步插件多端 spike 报告（S1）](research/同步评审/spike-报告.md) | reference | 2026-11-23 | 同步插件 spike 报告 |
| [插件 API 要点（阶段 1 · 资产插件参考）](research/插件API要点.md) | reference | 2026-11-23 | 插件 API 七工具通道要点 |
| [插件兼容性（2026-11-22 核实）](research/插件兼容性.md) | reference | 2026-11-23 | 官方插件在 Skein 上的兼容性核实 |
| [现状核对（2026-11-15 快照）](research/现状核对-2026-11-15.md) | reference | 2026-11-23 | 2026-11-15 的技术栈与代码现状核对快照 |
| [界面现状盘点](research/界面现状盘点.md) | reference | 2026-11-23 | 宿主界面现状：功能、实现、交互位置 |
| [笔记资产理论](research/笔记资产理论.md) | reference | 2026-11-23 | 资产假设、指标与淘汰机制 |

## 归档

- [archive/README.md](archive/README.md) — 已关闭的件，冻结，不再维护。
