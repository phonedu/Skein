# S2c 文档稳定身份 spike 报告（第一至第三切片）

> 日期：2026-11-21 · 状态：**spike 完成（引擎级、保存链路、S3 真服务）；未推广到全部笔记**
> 依据：[《文档稳定身份 v0》](../../02-方案/Textus-文档稳定身份-v0.md) §6–§9；任务清单 S2c
> 代码：`textus-sync` 的 `identity`、`protocol::Entry.id`、引擎的改名与历史跟随

## 任务六行

```text
问题：Textus 以路径作文档身份；改名+改内容会被当成删除+新建，历史留在旧路径，跨设备改名会留下两份。
期望：文件 front matter 的 textus_id 作真值，清单 Entry.id 作缓存；改名/移动仍是一条文档，旧客户端丢 id 可重建。
标准：E1/E2/E6/E8 引擎级自动化通过；E3/E4/E12 至少能识别为 fork/conflict 且不静默覆盖；E5/E7/E9/E10 有引擎级测试。
不做：不碰块身份、CRDT、块级合并；不推广到全部笔记；不改 md 是唯一内容真相；不做实时协同。
范围：S 组 S2c，仅 textus-sync 引擎与协议；不接 UI、不接真远端、不碰真机。
证据：`cargo test -p textus-sync`（49 单元 + 32 引擎 + 4 wire + 5 scale）；S3 真服务带 id 用例；`vitest` 的 front matter 写入、保存链路与同步文案测试。
```

## 一、这一片做了什么

1. **协议**：`Entry` 增加可选 `id`（serde 默认缺省、跳过空值）。旧客户端读写时忽略/丢掉，不阻止同步。
2. **分配**：Textus 保存 Markdown 时，没有 `textus_id` 就补 UUIDv4；已有 id 保留，下一次保存复用磁盘上的 id；`asset-library/` 随保存自然覆盖。不做全库回填，打开但不保存的旧笔记不改文件。
3. **读取真值**：`identity::document_id` 从 Markdown 开头 front matter 读 `textus_id`，接受带/不带连字符、大小写，归一化为小写 UUID；非法值按缺失。`describe` 在扫描/下载时自动带上这个缓存。
4. **配对**：`identity::pair` 用 id 分类 `LocalRename`、`RemoteRename`、`Fork`、`Conflict`；无 id 的文件完全回退到原来的路径/哈希规划。
5. **引擎**：
   - 本地改名+改内容：按原路径规划上传新路径、删远端旧路径，历史复制到新路径、base 跟到新路径。
   - 远端改名、本地在旧路径编辑：先把本地文件移到新路径，再把本地内容上传到新路径；最终一条新路径，本地编辑不丢。
   - 旧客户端重写 head 丢掉 `Entry.id`：下一次同步从文件 front matter 重建。
   - fork：本侧副本自动分配新 id 并保留；远端已有两份同 id 时，保留一份，另一份下载后改写 front matter、上传新块并写回清单；两侧同路径的副本复用同一个新 id。
   - 带 id 的内容冲突：冲突副本写入新 id 并上传该新版本；原路径保留本地内容与原 id。
   - 两端都改同一个 id：`identityConflict` 停止，不静默覆盖。
   - 重新分配写入 `SyncResult.identityReassigned`；设置页摘要显示数量，fork/冲突错误有十语文案。
6. **E2EE**：id 只在文件 front matter 与加密后的 `v2/head.bin` 里；明文 `v1/head.json` 描述符和对象名不含 id。

## 二、实验证据

| #   | 场景                             | 结果                                                         | 测试                                                                                                             |
| --- | -------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| E1  | 单设备改名 + 改内容              | 通过：新路径保留 id，历史跟随，无冲突                        | `a_renamed_and_edited_document_keeps_its_id_and_history`                                                         |
| E2  | A 改名，B 改旧路径内容           | 通过：一条新路径，B 的内容保留                               | `a_remote_rename_keeps_the_local_edit_at_the_new_path`                                                           |
| E3  | A/B 各改名到不同路径             | 通过：远端保留原 id，本地另一路径自动新 id，两份都保留       | `two_renames_are_a_fork`；`two_different_renames_keep_both_documents_with_new_ids`                               |
| E4  | 复制文件 / 远端重复              | 通过：本侧副本、远端两份同 id 都自动新 id；原文件保留        | `a_copy_with_one_id_gets_a_new_id`；`two_remote_copies_with_one_id_get_a_new_id`                                 |
| E5  | 外部新建无 id 文件               | 可同步；保存时补 id（不保存不改文件）                        | `a_file_without_an_id_still_syncs_by_path`；`document-identity.test.ts`                                          |
| E6  | 旧客户端重写 head 丢 `Entry.id`  | 通过：从文件重建                                             | `an_old_client_dropping_entry_ids_has_them_rebuilt_from_the_file`                                                |
| E7  | 旧客户端重写 front matter 丢字段 | 内容/历史不丢；下一次保存补 id                               | `losing_the_front_matter_id_does_not_lose_the_content_or_history`；`doc-tabs.test.ts`                            |
| E8  | E2EE 仓库                        | 通过：明文描述符与加密对象都不含 id                          | `a_document_id_never_reaches_the_plaintext_objects`                                                              |
| E9  | 删除 + 恢复                      | 通过：同 id 接上历史                                         | `deleting_and_restoring_a_document_reuses_its_id`                                                                |
| E10 | 用户改 `textus_id`               | 一侧改动按新身份接受；两端都改停止                           | `changing_the_id_is_a_new_identity_at_the_same_path`；`both_sides_changing_the_id_stop_before_one_is_lost`       |
| E11 | 20k 文件                         | 带 id：清单 4,880,142 字节（< 8 MiB），内存首同步 4.30 s     | `twenty_thousand_identified_files_stay_within_the_manifest_limit`                                                |
| E12 | 两端同时分配不同 id              | 同路径两端都改 → `identityConflict`；一侧未改则采纳已发布 id | `an_unchanged_side_adopts_the_id_the_other_side_published`；`both_sides_changing_the_id_stop_before_one_is_lost` |

全部命令：

```sh
cargo test -p textus-sync
```

结果：49 单元测试、32 引擎测试、4 wire、5 scale 全过；S3 真服务带 id 用例通过（Bitiful，一次性前缀）；WebDAV live 因无凭据仍跳过。前端 `doc-tabs`、`document-identity`、`useSaveTabs`、`sync-page-model` 共 34 测试通过。

## 三、尚未做的（决定不冒充完成）

1. **WebDAV 真服务**：本机没有可用的 WebDAV 凭据，带 id 的 WebDAV live 回归未跑；S3（Bitiful）已跑。
2. **历史按 id**：按裁决 Q6 只把版本复制到新路径，旧路径记录按 keepDays 淡出；没有 id 级历史。
3. **UI 走查**：文案与摘要已有十语和单测，但 built app 的同步页尚未做视觉走查。
4. **分配范围**：按保存分配，不做全库回填；打开但不保存的旧笔记仍无 id。这是有意选择，不是遗漏。

## 四、结论与建议

**S2c spike 到此收口（引擎级 + 保存链路 + S3 真服务），U18 仍不自动触发。** 建议把 S2c 归档；推广到全部笔记要你先确认，并且最好再补一次 WebDAV live 与 built app 同步页视觉走查。

后续若继续身份线，可另立小项：按 id 的历史（v2）、WebDAV live、以及推广到全部笔记的迁移提示。
