# 同步插件多端 spike 报告（S1）

> **状态**：进行中（2026-11-19 开始）。本文只记真机与远端数据；协议结论在 [同步协议 v1](../02-方案/同步协议-v1.md)，架构在 [同步方案](../02-方案/同步方案.md)。
> **设备**：华为 PKT0220512001548（OXF-AN10，Android 12，1080×2400）。
> **插件分支**：`C:/Project/textus-plugins` 的 `skein-sync-prep`（本地，未推上游）。

## 1. 已就位

| 件                              | 状态      | 证据                                                                                               |
| ------------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| 插件 manifest 可在 Android 运行 | ✅        | `platforms: ["desktop", "ios"]`（Android 走 iOS 运行时）；提交 `8d57c7c`                           |
| 空扫描 / 大批删除保护           | ✅ 插件源 | engine `emptyScan` / `bulkDelete`；`engine.test` 29/29；提交 `4874d4c`。大批删除确认 UI 未接，先停 |
| 锁 412 接管                     | ✅ 插件源 | create 写后抛 412 可接管；他人锁不抢；测试过                                                       |
| 状态 `deferred` ≠ 已同步        | ✅ 插件源 | `statusPartial`，十语言 manifest，`status.test` 2/2                                                |
| S3 权限文档                     | ✅        | README 写清 prefix 条件化 `s3:ListBucket`                                                          |
| 宿主默认库                      | ✅        | App Documents（H1）；删除进 App trash（H2）；外部改文件弹冲突（D0）                                |
| 桌面插件仍可读 `/1`             | 沿用      | 官方插件 0.6.1，协议未改                                                                           |

## 2. 三条轨

| 轨              | 目标                         | 状态   | 结果                                |
| --------------- | ---------------------------- | ------ | ----------------------------------- |
| 0 App Documents | 普通路径 + 前台 + 文本/附件  | 未开始 | 需先装插件到 Android 应用数据并启用 |
| A 所有文件访问  | 授权持久化 / 跨卷 move       | 未开始 | 依赖轨 0                            |
| B SAF 边界      | 插件被拒 / 提示 / grant 留存 | 未开始 | 不解禁 gate；只记录                 |

## 3. 环境与阻塞

- 本机没有 MinIO / Nextcloud / Docker（`which minio mc docker` 全空），需要先起一个远端：
  - S3：下载 MinIO 单文件（或本机 Docker），建一个空 bucket；
  - WebDAV：Nextcloud/坚果云账号，或本地 WebDAV 服务。
- `textus-plugins` 的 `npm run check` 在 Windows 上会把 `host.js` 误报超 500 行（`scripts/check-lines.mjs` 用正斜杠比较、Windows `join` 给反斜杠）；`host.ts` 500 行本身合规。Linux CI 不受此误报。
- Android 上插件入口/状态面（H8）未做；spike 暂时只能靠应用数据里的 `plugins/<id>/` + 状态开关驱动，或先做最小入口。
- 插件大批删除确认 UI 未接：当前 `bulkDelete` 只中止并提示，用户没有“继续”路径；S1 需要在插件页补确认或临时改用删除阈值配置。

## 4. 下一步

1. 起 MinIO（S3）与一个 WebDAV 端点，各建空 prefix。
2. 把 `plugins/catvinci.cloud-sync/` 安装进 Android 应用数据，启用插件，确认设置页/命令在手机上出现（或先补 H8 最小入口）。
3. 跑轨 0：Documents 空库 → 新建 2 篇 + 1 图 → 首次同步 → 桌面官方插件读同一远端 → 手机改/桌面改 → 冲突两份。
4. 跑轨 A：所有文件访问目录，验证授权持久化与跨卷 move。
5. 跑轨 B：SAF 只验被拒/提示/grant，不解禁。
6. 记录耗时/流量/失败 API；写 S2 范围建议。

## 5. 通过标准（摘 S0c）

- 不误删远端；不半截；冲突两份；旧端可读；错误可操作；1000 文件性能记录。

## 6. 结论

**尚未开始真机同步**；当前完成的是插件可在 Android 运行的 manifest、宿主前置（默认库/trash/冲突/外部改）与安全补丁。下一步先搭远端与手机插件入口。
