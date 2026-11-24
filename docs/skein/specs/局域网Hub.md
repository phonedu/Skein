---
type: spec
status: active
summary: 局域网 Hub：桌面内嵌 WebDAV 服务、配对与手机直连
updated: 2026-11-24
tasks: []
---

# 局域网 Hub（S4）

> **状态：草案，2026-11-24。** S4 从 Later 启动。本文把[同步方案](同步方案.md) §11 的 LAN Hub 展开成可实施的设计：桌面内嵌 WebDAV 仓库服务，手机在同一 Wi-Fi 下配对后像普通 WebDAV 一样同步。数据层仍是 `/1` 仓库，不新造协议。
> **不做**：真 P2P（无服务器直连）、mDNS/自动发现、v1 TLS、公网暴露、后台同步。

## 1. 目标

- 桌面启动一个只服务已配对设备的本地仓库；手机同一 Wi-Fi 输入地址 + 一次性 6 位码即可同步。
- 复用现有 WebDAV transport 与 `/1` 协议；planner/history/冲突/锁不变。
- 每台设备一个 token，可只读、可撤销；不把仓库暴露到公网。
- 桌面自己也通过同一个 Hub 同步（本机 WebDAV），保证两端走同一条 transport。

## 2. 架构

```text
桌面 vault ── WebDAV (127.0.0.1 token) ─┐
                                        ├─ Hub 仓库（app data/hub/<repoId>/v1/...）
手机 vault ── WebDAV (LAN IP token) ────┘
```

- Hub 是**仓库服务**，不是文件共享：它保存 `v1/head.json`、`history.json`、`lock.json`、`blocks/…`、`snapshots/…`。
- 桌面 vault 仍用内置同步引擎；连接配置是一条指向 `http://127.0.0.1:<port>/hub/<repoId>` 的 WebDAV 连接（本机 token）。
- 手机的连接配置也是一条 WebDAV 连接（LAN 地址 + 设备 token），因此不需要新的 transport、协议或同步算法。
- Hub 不读桌面 vault 的文档；它只存 `/1` 对象。桌面首次同步把文档上传到 Hub。

## 3. 存储

- 位置：应用数据目录 `hub/<repoId>/`（与 vault、base 分开；不进 vault 文件夹，避免被扫描/同步）。
- `repoId` 由启动 Hub 时生成（UUID）；一个 Hub 运行期只服务一个仓库（v1 简化），多库可后续扩展为 `/hub/<repoId>` 多路由。
- Hub 停止后数据保留；设置页提供「清除 Hub 数据」危险动作（二次确认）。
- 写入临时文件 + rename；目录逐级创建；不做符号链接跟随。

## 4. 配对与认证

- 启动 Hub 时生成：6 位数字码、有效期 10 分钟、一次性；只在内存。
- 桌面设置页显示：`http://<LAN IPv4>:<port>`、代码、允许读写/只读、已配对设备列表。
- 手机输入地址 + 码 + 设备名 → `POST /pair`：
  - 成功返回 `{token, repoId, readOnly}`；token 32 字节随机（URL-safe base64）。
  - 错误：`invalidCode`（401）、`expired`（410）、`tooManyAttempts`（429）。
  - 配对成功后码作废；Hub 记录设备名、token 的 SHA-256、权限、时间。
- WebDAV 请求使用 Basic auth：用户名 = 设备 id，密码 = token。Hub 用 SHA-256 比对；不保存明文 token。
- token 持久化在 app data 的 owner-only 文件（与 sync_secrets 同级），不写日志、不进同步。
- 撤销：删除该 token；该设备下一次请求 401。
- 只读 token：只允许 GET/HEAD/PROPFIND；PUT/DELETE/MKCOL/MOVE 返回 403。
- 配对尝试限速：每 IP 每分钟 5 次，代码错误延迟响应。

## 5. WebDAV API

路由：`/hub/<repoId>/<relative key>`；只实现同步需要的子集，语义与现有 `WebDavStore` 客户端一致。

| 方法 | 语义 |
| --- | --- |
| `GET` / `HEAD` | 读对象；404 不存在 |
| `PUT` | 写对象（临时文件 + rename） |
| `MKCOL` | 建目录；已存在 405 |
| `DELETE` | 删除文件/目录；404 幂等 |
| `MOVE` + `Destination` + `Overwrite: F` | 原子创建：目标存在 412；用于 `create` |
| `PROPFIND` Depth 0/1 | 目录检查与清理列举 |
| `POST /pair` | 配对（见 §4） |

- 路径必须先在 Hub 根内解析；拒绝 `..`、绝对路径、`%2f` 绕过。
- 请求体上限 128 MiB；按流写临时文件，不整块进内存。
- 支持 `Expect: 100-continue`（客户端大 PUT 可能用）。
- 不实现 WebDAV LOCK/UNLOCK；同步锁仍是 `v1/lock.json`。
- 错误状态映射与 `WebDavStore` 客户端一致：401/403 权限、404 不存在、412 已存在、429 限流、507 配额。

## 6. 桌面端

- 新 Tauri 命令（名称暂定）：
  - `hub_start(root)` → `{repoId, address, port, code, readOnly}`
  - `hub_stop()`；`hub_status()`；`hub_pairings()` / `hub_revoke(deviceId)`；`hub_clear(repoId)`
- 设置 › 同步新增「局域网 Hub」区：
  - 启动/停止、地址与代号、复制地址、读写/只读、已配对设备（名称、时间、权限、撤销）、清除数据。
  - 首次启动后自动建立本机 WebDAV 连接（`127.0.0.1` + 本机 token），用户可像普通连接一样绑定库。
  - 端口默认 7419；被占用时显示错误并允许换端口。
  - 只显示私网 IPv4（10/172.16-31/192.168）；无可用地址时说明需连接 Wi-Fi/网线。
- 地址变化（DHCP）不自动迁移：旧地址失败时提示重新查看地址；不做 mDNS。

## 7. 手机端

- 设置 › 同步 › 新建连接，Service 增加「局域网 Hub」：
  - 地址、6 位码、设备名；配对成功后保存为 WebDAV 连接（地址 + token），后续同步与现有 WebDAV 完全一致。
  - 只读连接在 UI 标记；手机上仍可手动触发同步。
- 配对信息不写日志；token 与其它连接凭据一样进安全存储。
- 手机与桌面同一 Wi-Fi；蜂窝/不同网段失败要给出可操作提示（检查 Wi-Fi、防火墙、地址）。

## 8. 安全

- 只绑定私网 IPv4 或 127.0.0.1；拒绝 0.0.0.0 与公网地址。
- v1 明确是 HTTP：设置页与配对页都显示“局域网内未加密”的警告；TLS 归 S5。
- token 只存散列；配对码一次性、限时、限速；失败不泄露“代码对不对”以外的信息。
- 路径遍历、超长路径、空段、控制字符按 `textus_sync::path::relative_path` 规则拒绝。
- 只读设备不能触发删除/改名；Hub 侧拒绝，不依赖客户端。
- 停止 Hub 即停止监听；退出应用必须释放端口。
- 防火墙：首次启动提示系统可能询问；手机连不上时给出三步检查（同一 Wi-Fi、地址、防火墙）。

## 9. 测试

- 单元：配对码生成/过期/限速/一次性；token 散列与撤销；路径穿越；只读 403；MKCOL/MOVE/PROPFIND 状态。
- 集成：`Hub` + `WebDavStore` 客户端 + `textus-sync` 引擎：probe（MOVE 412）、首次/改/删/冲突、锁、空扫描/大批删除（沿用引擎测试）。
- 双端：desktop Hub + 第二个 vault（本机 WebDAV）双向同步；手机模拟器通过 LAN 地址（10.0.2.2）同步。
- 真机：华为 OXF-AN10 与桌面同一 Wi-Fi；杀进程/锁屏/服务停止/地址变化；防火墙提示。
- 测试工具沿用 `scripts/sync-smoke`（新增 `--provider lanhub` 或独立 profile），不新增一次性脚本。

## 10. 阶段

| 阶段 | 内容 | 产物 |
| --- | --- | --- |
| S4a | Hub 仓库 + WebDAV 服务 + 配对/token + 单元/集成测试 | 桌面可用 WebDAV 客户端连本机 Hub 完成首次/改/删/冲突 |
| S4b | 桌面设置页：启动/停止、地址/码、配对列表/撤销、本机连接 | built app 冒烟 |
| S4c | 手机 Service「局域网 Hub」+ 配对 + 同 Wi-Fi 同步 | 真机/模拟器证据 |
| S4d | 只读、清除数据、错误文案、防火墙/地址变化、文档 | 验收矩阵与 runbook |

## 11. 待审 / 风险

- 端口固定 7419 还是随机（默认 7419，冲突时报错）。
- 一个 Hub 只服务一个仓库（v1）还是多仓库；建议 v1 单仓库，接口预留 repoId。
- Hub 数据清除是否也清桌面 binding/base；建议只清 Hub，桌面连接保持但显示远端缺失。
- v1 HTTP 的安全接受度：只在显式启动 + 一次性码配对时允许；TLS 归 S5。
- DHCP 地址变化、睡眠唤醒、防火墙弹窗是主要现场问题；错误提示必须先写好。
- 手机与桌面同时同步同一仓库：Hub 的 `v1/lock.json` 仍是唯一并发保护；不增加 Hub 侧锁。

## 12. 实现（S4a–S4c，2026-11-24）

- `src-tauri/crates/textus-hub/`：WebDAV 服务、配对/设备 token、仓库路径校验与私网地址枚举；`WebDavStore` 可直接作为客户端。单元与集成测试覆盖配对一次性/限速、只读 403、撤销、路径穿越、MOVE 条件创建、重启保留 token，以及引擎首次/双向同步。
- `WebDavStore` 现在允许 `http://` 仅限 loopback 或私网 IPv4（原先只允许 loopback），公网 HTTP 仍拒绝。
- 桌面：设置 › 同步 ›「局域网 Hub」启动/停止、地址选择、端口、配对码、设备列表、撤销、绑定当前库、清除数据；`hub_start` 成功后只创建本机 WebDAV 连接，绑定要用户点「让此仓库使用这个 Hub」。
- 手机：「局域网 Hub › 加入 Hub」填地址、6 位码、设备名；配对成功后保存为普通 WebDAV 连接并绑定当前库。
- 桌面 harness：`node scripts/sync-smoke/hub.mjs [--keep]`。实测桌面 A 启动 Hub、绑定并上传，实例 B 用与手机相同的配对命令加入，双向首次同步与编辑收敛通过。
- 真机：华为 OXF-AN10（192.168.0.107）对桌面 192.168.0.106:7419 配对；桌面已上传 `Notes/from-desktop.md`，手机下载 1；手机改文件后上传 1，桌面下载 1。全程同一 Wi-Fi、无公网、无 TLS。
- 未做/未手动验证：手机界面上的只读配对与撤销（HTTP/单元已验证）、防火墙弹窗与 DHCP 地址变化的真实提示、iOS、后台常驻。

## 13. 一句话

**桌面 Hub 只做一件事：把 `/1` 仓库用 WebDAV 暴露给已配对设备；桌面和手机都只是它的 WebDAV 客户端，同步算法不复制。**
