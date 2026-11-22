# 归档区

> **已关闭的件住这里，不再维护。** 只在查历史、追溯裁决或恢复证据时读；进度看[任务清单](../05-状态/Textus-改造任务清单.md)，当前方案看 [02-方案](../02-方案/)。归档件不进任何门禁，也不再被新任务引用——新任务若需要一个归档件里的结论，把结论搬进在办文档，别把归档件重新拉回正文。

## 收录什么

- **完成的任务记录**：有验收证据、任务清单已迁出的（D1a/D1b/D1c、H0、S2/S2a/S2b/S2c/S6/S3、B3 冒烟与上游合并）。
- **关闭的规格 / spike**：对象已完成或已裁决，规格只剩施工口径与历史依据的（手机格式工具栏、文档稳定身份 v0、同步插件 spike、H0 宿主壳清单）。
- **过期的参考图**：被新方案取代、只还有史料价值的界面图（原宿主改造图）。图放 `assets/`。
- **任务清单的历史切片**：完整已完成的旧清单。

## 不收录什么

- 仍在用的设计/协议/纪律（`02-方案/`、`01-纪律/`）。
- 还在给任务当依据的调研（`03-调研/`，例如同步评审仍供 S3b/S3q/S4/S5）。
- 临时截图、构建产物、安装包：这些属于 scratch 或 `test-results/`，不进仓库，也不进归档。

## 目录

### 任务记录

| 文件 | 日期 | 内容 |
| --- | --- | --- |
| [2026-11-17-collect-plugin.md](2026-11-17-collect-plugin.md) | 2026-11-17 | `skein.collect` 插件规格与首版实现 |
| [2026-11-19-task-list-archive.md](2026-11-19-task-list-archive.md) | 2026-11-19 | 改造任务清单的历史切片（已完成项与封存线） |
| [2026-11-20-s2-acceptance.md](2026-11-20-s2-acceptance.md) | 2026-11-20 | S2 内置同步验收（引擎级、真 WebDAV/S3、20k、失败恢复） |
| [2026-11-20-s2a-multi-vault.md](2026-11-20-s2a-multi-vault.md) | 2026-11-20 | S2a 多库同步 |
| [2026-11-20-s2b-e2ee.md](2026-11-20-s2b-e2ee.md) | 2026-11-20 | S2b 端到端加密 |
| [2026-11-20-s6-migration.md](2026-11-20-s6-migration.md) | 2026-11-20 | S6 迁移与双开提示 |
| [2026-11-21-b3-merge-smoke.md](2026-11-21-b3-merge-smoke.md) | 2026-11-21 | v1.4.6-rc.3 清账合入与冒烟 |
| [2026-11-21-d1a-assets-list.md](2026-11-21-d1a-assets-list.md) | 2026-11-21 | D1a 资产列表（桌面片） |
| [2026-11-21-d1b-confirm-flow.md](2026-11-21-d1b-confirm-flow.md) | 2026-11-21 | D1b 收集确认流 |
| [2026-11-22-d1c-agent-tools.md](2026-11-22-d1c-agent-tools.md) | 2026-11-22 | D1c Agent 七工具 |
| [2026-11-21-h0-host-shell.md](2026-11-21-h0-host-shell.md) | 2026-11-21 | H0 整壳验收 |
| [2026-11-21-s2c-document-identity.md](2026-11-21-s2c-document-identity.md) | 2026-11-21 | S2c 文档稳定身份 spike |
| [2026-11-21-s2c-document-identity-spike-report.md](2026-11-21-s2c-document-identity-spike-report.md) | 2026-11-21 | S2c spike 报告（引擎、保存链路、S3 真服务） |
| [2026-11-21-s3-mobile.md](2026-11-21-s3-mobile.md) | 2026-11-21 | S3 手机端同步 v1 |
| [2026-11-22-b3-v1.4.6.md](2026-11-22-b3-v1.4.6.md) | 2026-11-22 | 上游稳定 tag v1.4.6 合并（分支流程、取舍、验证） |

### 关闭的规格 / spike

| 文件 | 日期 | 内容 |
| --- | --- | --- |
| [2026-11-19-phone-format-toolbar.md](2026-11-19-phone-format-toolbar.md) | 2026-11-19 | 手机格式工具栏（墨契三件套）PH1 规格；已完成 |
| [2026-11-17-phone-visual-polish-plan.md](2026-11-17-phone-visual-polish-plan.md) / [design](2026-11-17-phone-visual-polish-design.md) | 2026-11-17 | 手机视觉打磨的旧实施计划与设计；已被 H0/Slate 取代 |
| [2026-11-19-sync-plugin-spike.md](2026-11-19-sync-plugin-spike.md) | 2026-11-19 | 同步插件多端 spike 三轨计划；轨 0 已执行，A/B 未跑 |
| [2026-11-21-document-identity-v0.md](2026-11-21-document-identity-v0.md) | 2026-11-21 | 文档稳定身份 v0 spike；已裁决并完成 |
| [2026-11-21-h0-host-shell-spec.md](2026-11-21-h0-host-shell-spec.md) | 2026-11-21 | H0 整壳施工口径与验收结论；已完成 |

### 过期的 release 片段

[2026-11-22-superseded-fragments/](2026-11-22-superseded-fragments/) 保存三份未发布的旧 fragment（活动轨 top views、旧尺寸对齐、整窗主题）；它们描述的活动轨与整窗换肤已在 2026-11-20 方向重选和 Slate 锁定后作废，不能进入下一次 release note。

### 参考图

| 文件 | 日期 | 内容 |
| --- | --- | --- |
| [assets/host-nav-2026-11-20.png](assets/host-nav-2026-11-20.png) / [.html](assets/host-nav-2026-11-20.html) | 2026-11-20 | 原宿主两栏/按需三栏改造图；H0 前的参考，历史留存 |
