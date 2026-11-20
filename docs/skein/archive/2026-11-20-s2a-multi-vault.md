# S2a 多库模型归档（2026-11-20）

> **状态：代码与单测完成**。S2-1 的 built app 交互复验并入任务清单 Now；E2EE 的每库密码字段随 S2b。
> 设计依据：[多库同步设计](../../03-调研/同步评审/06-多库同步设计.md)、[同步方案 §4](../02-方案/同步方案.md)。

## 1. 完成内容

| 项 | 落地 |
| --- | --- |
| 存储模型 | `sync.json` v2：`connections`（连接、凭据引用、默认 prefix）＋ `vaults`（root、connectionId、effective prefix、vaultId、repositoryId、keep）；旧“每文件夹一套配置”读取时迁移成独立连接 + 绑定 |
| 连接共享 | 一个连接一份凭据；多个库可绑定；设置页连接下拉；共享连接地址/凭据默认锁定 |
| 新库布局 | 加入已有连接且远端目录留空 → `<连接默认前缀>/<slug>-<vaultId 前 8 位>/`；独立连接沿用填写的 prefix；迁移库沿用原 prefix |
| 库身份 | `.textus/sync-vault.json` 记 `vaultId`（不参与同步）；复制库保留同一 id |
| 仓库身份 | 明文 v1 以 `connectionId + effective prefix` 定位；绑定存 `repositoryId`，连接/prefix 变化时换新 |
| 本地 base | 按 `(vaultId, repositoryId)` 命名（设备由 app 数据目录隐式隔离）；旧 root-key base 在下一次保存时迁移；库文件夹移动后按身份接上旧 base |
| 库移动 | 旧路径已不存在、身份文件跟随时，`load`/`base`/`save` 解析为同一绑定；保存后 rebind 到新路径，base/last 跟随 |
| 副本分叉 | 同一 `vaultId` 出现在另一**现存**路径 → `vaultCopied`；设置页确认后 `sync_fork_vault` 写新 `vaultId`，生成新子仓库 |
| 冲突保护 | 同一连接 + 同一 prefix 两个库 → `repositoryInUse`；切换连接/改 prefix → 清 base/last 重新规划 |
| 共享连接编辑 | 显式“编辑连接”：地址/凭据/S3 兼容方式/默认 prefix；提示影响 N 个库；远端地址变化重建所有绑定库的 base；只改密码/默认 prefix 不动 base |
| 库列表 | 设置页“已同步的库”：本地文件夹名 → 连接 → effective prefix |
| 删除连接 | 不设单独危险按钮：逐个库“断开”；最后一个库断开时连接与凭据自动删除 |
| 并发 | 桌面最多 2 个库同时同步、手机 1 个；同一库同进程只允许一个 runner；超出报 `busy`/`alreadyRunning` |
| 默认 prefix | 可在共享连接编辑中修改；只影响之后新加入的库，不改已有绑定的 effective prefix |

## 2. 测试与证据

- `sync::store` 18 条：旧格式迁移、v2 回读、共享连接子仓库、`repositoryInUse`、副本 fork、库移动保留 base、旧 root-key base 迁移、共享连接编辑重建/不重建 base、默认 prefix、删除最后库清连接。
- `sync::runners` 1 条：同库只一 runner、桌面 2 上限、释放后可再进。
- `SyncPage.test.tsx` 5 条：共享连接锁定、切新连接恢复表单、显式编辑共享连接（含默认 prefix）、复制库确认后重存、库列表显示。
- 提交：`98c140d6`（v2 模型）、`fff6f12a`（库列表）、`0fc7926d`（共享连接编辑）、`723de90b`（副本 fork）、`9698ee11`（身份/base/并发/默认 prefix）。
- 验证：`cargo test --lib sync::` 24 条；typecheck、eslint、prettier、`check:skein` 通过。

## 3. 不在本片

- **每库同步密码**：E2EE 未实现，绑定里的密码引用随 S2b。
- **built app 交互验收**：连接编辑/默认 prefix/副本确认/移动库的实际点击走查并入 S2-1。
- **连接级传输限流**：当前用全局库数上限；若后续出现同连接多库抢带宽，再在 S5 做连接级预算。
