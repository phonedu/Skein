---
type: research
status: reference
summary: S3 Provider 兼容性
updated: 2026-11-24
---

# S3 服务商兼容性（S1b 选型）

> **结论（2026-11-24 更新）**：**缤纷云 S4（Bitiful）已实测通过 S1b**；内置 Rust 已有 `S3Flavor::Oss`（`x-oss-forbid-overwrite`，409/400 映射）并在设置页可选；**七牛 Kodo 2026-11-21 实测：凭据有效，但 S3 条件写不可用（`unsafeServer`）；S3q 已用原生上传凭证 + `insertOnly` 接入（§3 第 6 条），设置页可选「七牛 Kodo（原生上传）」**；**阿里云 OSS 按用户 2026-11-21 决定不测试**（补充协议与版本控制限制太麻烦），代码保留但不作为验收项。
>
> 协议要求见[同步协议 v1](../../specs/同步协议-v1.md)；插件当前 S3 transport 见 `textus-plugins/development/cloud-sync/src/transport.ts`。

## 1. 插件对 S3 的硬要求

| 要求                                               | 为什么                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| SigV4、标准 S3 API                                 | 插件用 `aws4fetch`，只做 S3 签名                                 |
| `PutObject` 条件创建（`If-None-Match: *`）返回 412 | 远端锁、并发写入保护；服务不支持时插件会报 `unsafeServer` 并停止 |
| Path-style 或 virtual-hosted 至少一种              | 不同服务商默认不同，配置里已有 `pathStyle`                       |
| GET/HEAD/PUT/DELETE、按前缀列出                    | 协议对象读写                                                     |
| 128 MiB 单文件、2 MiB 分块                         | 协议上限；插件自己分块 PUT，不依赖 S3 Multipart                  |
| HTTPS、普通对象权限（读/写/删）                    | 安全线                                                           |

> **不要用 s3rver 判断插件能否支持某家 S3**：它不实现条件写，插件会按设计中止（S1 已实测）。

## 2. 三家对比

| 服务                     | S3 兼容          | Endpoint / Region                                                                       | 寻址                                         | 条件写                                                                                                                                                                                            | 结论                                                           |
| ------------------------ | ---------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **缤纷云 S4（Bitiful）** | 标准 S3 + SigV4  | `https://s3.bitiful.net` / `cn-east-1`                                                  | virtual-host 默认，path-style 可用           | **已实测：第二次 `If-None-Match: *` PUT 返回 412**                                                                                                                                                | **S1b 已通过**：接口最接近标准 S3，单区域，免费额度够 spike    |
| **七牛云 Kodo**          | 官方 S3 兼容 API | `https://s3.<region>.qiniucs.com`，如 `s3.cn-south-1.qiniucs.com` / region `cn-south-1` | path-style 与 virtual-host 都支持            | **2026-11-21 实测：南区域 path-style/virtual-host 第二次条件创建均未被拒绝（`unsafeServer`）；东区域 endpoint 400。S3 `If-None-Match` 不可用**；原生上传用 `insertOnly=1`（上传凭证，不是 S3 头） | **S3 兼容层不可用**；要用需原生 `insertOnly` transport，另立项 |
| **阿里云 OSS**           | S3 兼容 API      | `https://<bucket>.oss-<region>.aliyuncs.com` / 对应 region                              | **只支持 virtual-hosted，不支持 path-style** | **不支持 `If-None-Match` PutObject**（400 NotImplemented）；用 `x-oss-forbid-overwrite: true`，已存在返回 **409 FileAlreadyExists**；开启/暂停过版本控制后该头失效                                | 第三：需要 OSS 专用适配，不能直接走当前 S3 create              |

### 2.1 各家的额外注意

**缤纷云 S4**

- Endpoint 不要带桶名；桶名走 virtual-host 或 path-style。
- **桶名按 S3 规范用小写**：控制台可见名称可能与 S3 bucket 名不同（控制台显示名与 S3 bucket 名可能不同，以实际 bucket 名为准）。
- 官方称标准 S3；当前预览阶段不支持生命周期、服务端加密、WORM、多版本——同步协议不依赖这些。
- 实测（2026-11-19）：条件写第二次返回 412；首次同步 5 个文件（含 16 MiB PDF）、32 MiB 随机 PDF 16 块哈希全对、冲突副本、删除、杀进程留锁 + `清除遗留锁` 后重跑全部通过。

**七牛云 Kodo**

- S3 域名按区域；桶的 S3 名称可能由系统生成，需在控制台“空间概览”确认。
- S3 条件写没有官方承诺；原生 `insertOnly` 只在上传凭证里生效，S3 SigV4 请求带不了。
- 若 S3 `If-None-Match` 实测不生效，插件会判 `unsafeServer`；此时要么改七牛原生上传（工作量大），要么换服务。

**阿里云 OSS**

- 只能 virtual-host；配置 `pathStyle=false`，endpoint 用 bucket 前缀域名。
- `If-None-Match`/`If-Match` 的 PutObject 会被拒（400）；锁要改成 `x-oss-forbid-overwrite: true` 并把 409 当“已存在”。
- `x-oss-forbid-overwrite` 在桶开启或暂停过版本控制后失效，适配时必须明确这个限制。
- ETag 大小写、分片 ETag 算法与 S3 不同；插件只把 ETag 当不透明值，问题不大。
- Node/`aws4fetch` 默认不做 chunked encoding，避开了 OSS 的 chunked 限制。

## 3. S1b 结果与后续

1. **缤纷云 S4（已通过，2026-11-19）**：专用测试桶、子账号 AK/SK；`endpoint=https://s3.bitiful.net`、`region=cn-east-1`、`pathStyle=true`；`测试连接` 通过“两次 create，第二次 412”。
2. 通过后跑 S1 同款：首次（5 个文件）、改、删、冲突、杀进程；再加 16 MiB 和 32 MiB 随机 PDF；32 MiB 的 16 个块逐块 SHA-256 校验一致。
3. 七牛云 Kodo 待跑（同流程；S3 条件写不生效就记录，不硬改协议）。**2026-11-20 内置侧进展**：`textus-sync` 已加 `S3Flavor::Oss`，设置页可选「阿里云 OSS」兼容方式（`x-oss-forbid-overwrite`，409 视为已存在，400 报 `conditionalWriteUnsupported`）；阿里云与七牛真桶仍未实测。
4. 阿里云 OSS：**2026-11-21 用户决定不做**（不改协议、不跑真桶）；`S3Flavor::Oss` 代码保留给已有配置，但不进 S3b 验收。
5. 七牛 Kodo：**2026-11-21 凭据已验证**——`s3.cn-south-1.qiniucs.com` + `cn-south-1` 的无条件 PUT/GET/DELETE 通过（path-style 与 virtual-host 都可）；`s3.cn-east-1` 与 `cn-south-1` 组合返回 `IncorrectRegion` 400。**但 S3 条件写不可用**：南区域第二次条件创建未被拒绝，客户端判 `unsafeServer`。当前 S3 transport 不能安全用于七牛；原生 `insertOnly` 专项列 S3q（D1f 后，5–8 天）。
6. **S3q 已完成（2026-11-24）**：新增 `S3Flavor::Kodo`。读、改、删仍走已实测的 S3 SigV4 endpoint；只有 `create` 走七牛原生表单上传：上传凭证 = `accessKey:sign:encodedPolicy`，policy 固定 `bucket:key` + `insertOnly=1`，614 视为“已存在”。设置 › 同步的「S3 兼容方式」可选「七牛 Kodo（原生上传）」；区域填 S3 区域（如 `cn-south-1`），上传域名按区域映射（`cn-south-1` → `up-z2.qiniup.com`，八个区域见 `textus-sync/src/kodo.rs`），未知区域保存时报 `unsupportedRegion`。
   - 真桶验证（同一测试桶）：probe 第一次创建成功、第二次 614；首次上传、修改、删除、两设备冲突（保留两份）全部通过。
   - 桌面双实例验证（portable debug，两个独立 `TextusData`，同一连接/prefix/加密密码，均选「七牛 Kodo（原生上传）」）：A 首次上传 1 → B 首次 1 上 1 下 → A/B 各自编辑互传各 1 上 1 下 → 同时改同一文件产生 1 个冲突副本（`Sync conflicts/…`，两端一致）→ 一端删除后另一端收敛（各 removed 1）。每次运行前的 probe 均通过，说明条件创建走的是原生 `insertOnly`。
   - 已知边界：Kodo 对“同 key、同 etag”的 `insertOnly` 上传返回成功而非 614；内容相同，故无害。没有原生 GET/DELETE/列举（仍走 S3）。上传域名只覆盖七牛当前的 8 个 S3 区域。

## 4. 适配层要改哪里

当前 S3 `create` 只认 412：

```ts
if (res.status === 412) return false;
this.require(res);
return true;
```

若接 OSS，需要按 provider 分支：

- 加 `x-oss-forbid-overwrite: true`；
- `409`（且对象存在）当 `false`；
- `400 NotImplemented` 给出“该服务不支持条件写”的可操作错误，而不是泛化网络错误；
- 探测阶段同样走这条 create，保证 `unsafeServer` 判断准确。

七牛若走原生 `insertOnly`，则不是改一个头：需要上传凭证/签名，等于第二个 transport，不建议在 S1b 做。**S3q 的选择不是第二套 transport，而是“S3 读写 + 原生 create”**：只有条件创建需要 token，其余已由 S3 endpoint 验证，因此 `S3Flavor::Kodo` 只替换 `create` 的实现（`textus-sync/src/kodo.rs`）。

## 5. 结论

- **S1b 已用缤纷云 S4 通过**；它是三家最接近标准 S3 的，把“协议/插件问题”和“服务商差异”分开了。
- 七牛云 Kodo 作为第二家已实测：凭据有效，S3 条件写不可用，见 §3.5；原生 `insertOnly` 已由 S3q 接入（§3 第 6 条），设置页可选「七牛 Kodo（原生上传）」。
- 阿里云 OSS 按用户 2026-11-21 决定不做真桶验收。
- 阿里云 OSS 作为适配目标，不污染首轮 spike，尚未跑。
- 三家都只给专用桶/子账号，AK/SK 不进仓库、不进日志。
