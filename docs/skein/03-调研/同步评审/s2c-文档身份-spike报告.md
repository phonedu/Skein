# S2c 文档稳定身份 spike 报告（第一切片）

> 日期：2026-11-21 · 状态：**引擎级第一切片完成；未推广到全部笔记**
> 依据：[《文档稳定身份 v0》](../../02-方案/Textus-文档稳定身份-v0.md) §6–§9；任务清单 S2c
> 代码：`textus-sync` 的 `identity`、`protocol::Entry.id`、引擎的改名与历史跟随

## 任务六行

```text
问题：Textus 以路径作文档身份；改名+改内容会被当成删除+新建，历史留在旧路径，跨设备改名会留下两份。
期望：文件 front matter 的 textus_id 作真值，清单 Entry.id 作缓存；改名/移动仍是一条文档，旧客户端丢 id 可重建。
标准：E1/E2/E6/E8 引擎级自动化通过；E3/E4/E12 至少能识别为 fork/conflict 且不静默覆盖；E5/E7/E9/E10 有引擎级测试。
不做：不碰块身份、CRDT、块级合并；不推广到全部笔记；不改 md 是唯一内容真相；不做实时协同。
范围：S 组 S2c，仅 textus-sync 引擎与协议；不接 UI、不接真远端、不碰真机。
证据：`cargo test -p textus-sync`（47 单元 + 29 引擎 + 4 wire + 4 scale；scale 的 20k 无 id 版本仍过）。
```

## 一、这一片做了什么

1. **协议**：`Entry` 增加可选 `id`（serde 默认缺省、跳过空值）。旧客户端读写时忽略/丢掉，不阻止同步。
2. **读取真值**：`identity::document_id` 从 Markdown 开头 front matter 读 `textus_id`，接受带/不带连字符、大小写，归一化为小写 UUID；非法值按缺失。`describe` 在扫描/下载时自动带上这个缓存。
3. **配对**：`identity::pair` 用 id 分类 `LocalRename`、`RemoteRename`、`Fork`、`Conflict`；无 id 的文件完全回退到原来的路径/哈希规划。
4. **引擎**：
   - 本地改名+改内容：按原路径规划上传新路径、删远端旧路径，历史复制到新路径、base 跟到新路径。
   - 远端改名、本地在旧路径编辑：先把本地文件移到新路径，再把本地内容上传到新路径；最终一条新路径，本地编辑不丢。
   - 旧客户端重写 head 丢掉 `Entry.id`：下一次同步从文件 front matter 重建。
   - fork（同一 id 两个路径）与“两端都改了 id”在写盘前停止，错误码 `identityFork` / `identityConflict`，不静默产生重复 id。
5. **E2EE**：id 只在文件 front matter 与加密后的 `v2/head.bin` 里；明文 `v1/head.json` 描述符和对象名不含 id。

## 二、实验证据

| #   | 场景                             | 结果                                                         | 测试                                                                                                             |
| --- | -------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| E1  | 单设备改名 + 改内容              | 通过：新路径保留 id，历史跟随，无冲突                        | `a_renamed_and_edited_document_keeps_its_id_and_history`                                                         |
| E2  | A 改名，B 改旧路径内容           | 通过：一条新路径，B 的内容保留                               | `a_remote_rename_keeps_the_local_edit_at_the_new_path`                                                           |
| E3  | A/B 各改名到不同路径             | 识别为 fork；引擎停止，不自动分配新 id                       | `two_renames_are_a_fork`；`identityFork` 守卫                                                                    |
| E4  | 复制文件                         | 识别为 fork；引擎停止，不静默共用 id                         | `a_copy_on_one_side_is_a_fork`；`a_copy_with_one_id_stops_before_two_documents_share_it`                         |
| E5  | 外部新建无 id 文件               | 可同步；**尚未自动分配 id**                                  | `a_file_without_an_id_still_syncs_by_path`                                                                       |
| E6  | 旧客户端重写 head 丢 `Entry.id`  | 通过：从文件重建                                             | `an_old_client_dropping_entry_ids_has_them_rebuilt_from_the_file`                                                |
| E7  | 旧客户端重写 front matter 丢字段 | 内容/历史不丢；head 暂为无 id，未自动重分配                  | `losing_the_front_matter_id_does_not_lose_the_content_or_history`                                                |
| E8  | E2EE 仓库                        | 通过：明文描述符与加密对象都不含 id                          | `a_document_id_never_reaches_the_plaintext_objects`                                                              |
| E9  | 删除 + 恢复                      | 通过：同 id 接上历史                                         | `deleting_and_restoring_a_document_reuses_its_id`                                                                |
| E10 | 用户改 `textus_id`               | 一侧改动按新身份接受；两端都改停止                           | `changing_the_id_is_a_new_identity_at_the_same_path`；`both_sides_changing_the_id_stop_before_one_is_lost`       |
| E11 | 20k 文件                         | 未带 id 实测；清单每文件约多 40–50 字节，未测带 id 的 20k    | 现有 `scale` 只证明无 id 路径                                                                                    |
| E12 | 两端同时分配不同 id              | 同路径两端都改 → `identityConflict`；一侧未改则采纳已发布 id | `an_unchanged_side_adopts_the_id_the_other_side_published`；`both_sides_changing_the_id_stop_before_one_is_lost` |

全部命令：

```sh
cargo test -p textus-sync
```

结果：47 单元测试、29 引擎测试、4 wire、4 scale 全过；live WebDAV/S3 仍按环境变量跳过。

## 三、尚未做的（决定不冒充完成）

1. **分配/写入 `textus_id`**：目前只认已经在文件里的 id；新建、外部新建、打开旧文件都还没有自动补字段，也没有“只对资产卡/被引用笔记启用”的范围控制。E5/E7 的自动分配因此未实现。
2. **fork/复制的自动解决**：E3/E4 只做到“识别并停止”。还没有给副本写新 `textus_id`、保留哪一侧、提示用户的 UI。
3. **冲突副本的 id**：带 id 的内容冲突目前也停止（`identityConflict`）；还没有“副本新 id”的字节重写与上传。
4. **历史按 id**：这一片按裁决 Q6 只把版本复制到新路径，旧路径记录按 keepDays 淡出；没有 id 级历史。
5. **20k 带 id 的性能**：需要补一次真实扫描/清单体积/同步时间测量。
6. **UI/文案**：没有新增 `identityFork` / `identityConflict` 的用户提示与十语字符串。

## 四、结论与建议

**建议：暂不推广到全部笔记（U18 不触发）。** 这一片证明 R1 真值 + R3 缓存的 rename 语义在引擎级成立，且旧客户端/ E2EE 路径不破；但分配、fork 解决、冲突副本新 id、20k 实测这四件是推广前的硬前置。

下一片（仍属 S2c，不是 D1）：

1. 资产卡/被引用笔记的 `textus_id` 分配与写回（保留 front matter 注释/顺序）。
2. fork/复制的“保留一侧 + 新 id + 通知”解决路径。
3. 带 id 的冲突副本新 id。
4. 20k 带 id 的扫描/清单/同步实测。
5. 完成后按 E1–E4/E6/E12 + 用户确认，再决定是否打开 U18 推广。
