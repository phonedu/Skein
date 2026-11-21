# S2c 文档稳定身份归档（2026-11-21）

> **状态：spike 完成；U18 已批准推广到全部笔记（保存时分配，不做全库回填）。** `textus_id` 真值 + `Entry.id` 缓存的 rename / 跨设备 move / fork / 冲突副本已在同步引擎与保存链路打通；U18（推广到全部笔记）等用户确认。
> 设计与报告：[《文档稳定身份 v0》](../02-方案/Textus-文档稳定身份-v0.md)、[S2c spike 报告](../03-调研/同步评审/s2c-文档身份-spike报告.md)。
> **不在本片**：块身份、CRDT、块级合并、实时协同、历史按 id（v2）、WebDAV 真服务回归（本机无凭据）。

## 1. 完成内容

| 层 | 落地 |
| --- | --- |
| 协议 | `Entry` 可选 `id`；旧客户端缺省/丢弃，新客户端从文件 front matter 重建 |
| 读取 | `identity::document_id` 读 `textus_id`，UUID 归一化；非法值按缺失 |
| 保存 | 保存 Markdown 时补 `textus_id`；已有 id 保留、下次保存复用磁盘 id；不做全库回填 |
| 改名 | 本地改名+改内容、远端改名本地编辑：一条新路径，历史跟随，base 跟到新路径 |
| fork | 本侧副本/双改名自动新 id；远端两份同 id 也自动改写一份；两侧同路径副本复用同一新 id |
| 冲突 | 带 id 的冲突副本写新 id 并上传；原路径保留本地内容与原 id |
| 竞态 | 同路径两端都改 id → `identityConflict` 停止；一侧未改则采纳已发布 id |
| E2EE | id 只在文件与加密 `v2/head.bin`；明文描述符/对象名不含 id |
| 文案 | `identityReassigned` 摘要、`identityFork` / `identityConflict` 十语错误 |

## 2. 证据

- `cargo test -p textus-sync`：49 单元 + 32 引擎 + 4 wire + 5 scale 通过；S3 真服务带 id 通过，WebDAV live 因无凭据跳过。
- S3 真服务（Bitiful，一次性前缀）：带 `textus_id` 的首传、head id、第二设备下载字节一致，通过。
- 20k 带 id：清单 4,880,142 字节（< 8 MiB），内存首同步 4.30 秒。
- 前端：`doc-tabs`、`document-identity`、`useSaveTabs`、`sync-page-model` 共 49 测试通过；全量 vitest 586 文件 / 4906 tests 通过（收口前一次全量，后续只加同步文案测试）。
- typecheck、lint、`check:repo`、Prettier 通过。

## 3. S2c-V1 视觉走查（2026-11-21 补）

built app（portable debug，隔离临时库）用演示 `last` 结果打开设置 › 同步：中文、英文、俄文的 reassignment 摘要都在状态条内换行，无溢出；`identityFork` / `identityConflict` 文案走查由单测覆盖。发现俄语同步页仍有英文存量标签（Folder / Synced. / Last synced / Service / Server address / Remote folder / Save connection），非本片新增，已记入任务清单缺口。

## 4. 仍未做

- **推广到全部笔记（U18）**：已于 2026-11-21 批准；按保存分配，不做全库回填，打开但不保存的旧笔记不改文件。
- **WebDAV 真服务带 id**：本机无 WebDAV 凭据，未跑。
- **built app 同步页视觉走查**：文案与摘要已有单测，未做视觉走查。
- **历史按 id（v2）**：只做路径迁移 + keepDays 淡出。
- **块身份**：不在本片。
