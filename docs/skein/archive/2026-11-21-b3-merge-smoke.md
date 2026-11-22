# B3 上游 v1.4.6-rc.3 合并冒烟归档（2026-11-21）

> **状态：完成。** 桌面 built app、Android 模拟器、华为真机都跑过；合并提交 `1d7cceff` 之后的门禁与 UI 冒烟通过。
> 依据：[上游跟随策略](../specs/Textus-改造方案.md) §12；任务清单 B3。

## 1. 门禁

- `npm run check`：typecheck、lint、全量 vitest、prettier、check:repo 通过。
- `cargo test --lib`：1112 passed；`cargo test -p textus-sync`：49 单元 + 32 引擎 + 4 wire + 5 scale 通过。
- 合并后修复的回归：folderDocuments、文件树多选、WhoAnswersProvider、页面底色、SyncPage 共享连接字段禁用。

## 2. 桌面 built app

隔离临时库（未碰真实数据）：启动、背景色、设置浮层、同步页、文件树 Ctrl 多选正常，无 page error。

## 3. Android 模拟器

API 35 / x86_64，APK `1.4.6-rc.3`（1004006）：安装、启动、语言引导、设置列表、同步页（App Documents）正常，无 `FATAL EXCEPTION`。

## 4. 华为真机

设备 PKT0220512001548，Android 12 / arm64-v8a。安装当前 debug APK（覆盖旧 1.4.5，数据保留）→ 启动，出现上次会话残留文档缺失提示「无法打开 a.md」；点「好」后首页为空库正常态。设置列表、同步页正常显示；无 `FATAL EXCEPTION`。验证后已强制停止 App。

## 5. 不在本片

- iOS 归上游。
- S2c 余项（WebDAV live、同步页 reassignment 文案视觉走查）见任务清单。
