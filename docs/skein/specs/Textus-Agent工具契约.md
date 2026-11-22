---
type: spec
status: active
summary: Agent 七工具的输入输出、权限与确认门槛
updated: 2026-11-23
---

# Textus Agent 工具契约

> 日期：2026-11-15（初版）· 2026-11-19（修订）
> 关联：《Textus-改造方案》第 5 节与附录 B、《笔记资产理论》v0.2、《Textus-界面改造方案》v0.7
> 状态：已评审（2026-11-15），作为实现基线随阶段推进

v0.2 对齐“结果闭环”：增加结果、边界、触发与复用形态；新增 `resolve_assets_for_trigger`，把资产检索从“搜索框”改为“按动作阶段触发”。

v0.3 修评审发现的不一致：`taskType` 定义匹配口径（§3.7）；理论卡不入工具系统、计数字段外部编辑约束（§2.2）；复用成功率分母口径（§3.6）；§8 方法名对齐 Textus v1.4.2 实际 API（当时误写为 `files.processRead` / `files.processWrite`）。

v0.3.1（2026-11-19）：① 修正插件 API 名称为 `files.process`（`processRead/Write` 是宿主 broker 内部名）；② 明确资产库 = 主库内子目录 `<vault>/asset-library/`，`libraryRoot` 指该子目录，主库根不暴露给工具；③ 关联《界面改造方案》升到 v0.7；④ 阶段 2 命令表标注“建议、未冻结”。

## 0. 目的与边界

这份契约只定义 **Agent 能做什么、不能做什么**，不定义界面长什么样。

三条边界：

1. Agent 不是文件的拥有者，只是加工者。
2. Agent 不能直接改变正式状态，只能发起请求。
3. 所有写入都必须带版本号，冲突就停止，不覆盖。

契约实现分两个阶段：

- **阶段 1**：插件内实现，属于"约定约束"，能被绕过。
- **阶段 2**：下沉到 Rust 宿主，属于"强制执行"，不能被绕过。

---

## 1. 类型定义

建议位置：`src/features/assets/tools/contracts.ts`

```ts
export type CardType = "task" | "judgment" | "asset";

export type TaskStatus = "inbox" | "active" | "blocked" | "done" | "archived";
export type JudgmentStatus = "draft" | "confirmed" | "archived";
export type AssetStatus = "draft" | "active" | "deprecated" | "archived";

export type CardStatus = TaskStatus | JudgmentStatus | AssetStatus;
export type Actor = "user" | "agent" | "import";

export interface CardRef {
  id: string;
  type: CardType;
  title: string;
  status: CardStatus;
  revision: number;
  updatedAt: string;
  sourceCount: number;
}

export type ReuseForm =
  "checklist" | "template" | "prompt" | "script" | "decision_table" | "doc";

export type TriggerStage =
  "before_delivery" | "during_task" | "after_result" | "on_demand";

export interface AssetTrigger {
  stage: TriggerStage;
  label: string;
}

export interface AssetBoundary {
  appliesWhen: string[];
  failsWhen: string[];
  counterexample?: string;
}

export interface CardDocument extends CardRef {
  createdAt: string;
  createdBy: Actor;
  tags: string[];
  sourceIds: string[];
  body: string;
  expectedOutcome?: string;
  actualOutcome?: string;
  variance?: string;
  boundary?: AssetBoundary;
  trigger?: AssetTrigger;
  reuseForm?: ReuseForm;
  lastUsedAt?: string | null;
  path: string; // 相对库根目录，不返回绝对路径
}

export interface EvidenceRef {
  id: string;
  kind: "note" | "file" | "url" | "message";
  title: string;
  locator: string;
  addedAt: string;
}

export interface HistoryEntry {
  revision: number;
  changedAt: string;
  changedBy: Actor;
  summary: string;
  path: string;
}

export type ToolErrorCode =
  | "NOT_FOUND"
  | "REVISION_CONFLICT"
  | "INVALID_STATE"
  | "PERMISSION_DENIED"
  | "VALIDATION_FAILED"
  | "STORAGE_UNAVAILABLE"
  | "RATE_LIMITED"
  | "NEEDS_CONFIRMATION";

export interface ToolError {
  code: ToolErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export type ToolResult<T> =
  { ok: true; data: T } | { ok: false; error: ToolError };

export interface ToolEnvelope<I> {
  requestId: string; // 写入类工具必填，用于幂等
  input: I;
}
```

> 注（v0.3）：理论卡（`type: theory`，见《笔记资产理论》§7.2）不是本契约的卡片——由人手写维护，七个工具不索引、不返回它（§2.2）。

---

## 2. 通用调用约定

### 2.1 调用方身份

Agent 调用时固定携带：

```ts
export interface ToolContext {
  actor: "agent";
  sessionId: string;
  libraryRoot: string; // 资产库根 = <主库>/asset-library/（2026-11-19 用户裁）；主库根不暴露给工具
  contractVersion: 1;
  now: string; // ISO 8601
}
```

### 2.2 通用规则

- 所有路径必须是库内相对路径，禁止 `..` 和绝对路径。
- **资产库是主库内的子目录 `<vault>/asset-library/`**（2026-11-19 用户裁）；`libraryRoot` 指这个子目录，主库其他目录不暴露给工具；`inbox/`、`judgments/`、`assets/` 等都相对 `libraryRoot`。
- 所有写入必须带 `requestId`，同一 `requestId` 在 24 小时内返回同一结果。
- 所有修改类工具必须带 `expectedRevision`。
- 返回值不包含绝对路径、系统用户名、模型密钥。
- `message` 面向用户时会经过 i18n，工具本身只返回错误码和英文兜底文案。
- 理论卡（`type: theory`，见《笔记资产理论》§7.2）不是本契约的卡片：由人手写维护，七个工具不索引、不返回它。
- `use_count` / `verified_count` / `last_used_at` 只能由 `record_use` 写入；外部编辑器不写这些字段，写坏以审计日志修复。

### 2.3 限制值

| 项目                                 | 限制             |
| ------------------------------------ | ---------------- |
| 搜索关键词                           | ≤ 200 字符       |
| 搜索返回                             | 默认 20，最大 50 |
| 标题                                 | ≤ 120 字符       |
| 正文                                 | ≤ 20,000 字符    |
| `sourceIds`                          | ≤ 20 个          |
| 单次 patch 字段                      | ≤ 20 个          |
| 使用记录上下文                       | ≤ 200 字符       |
| `boundary.appliesWhen` / `failsWhen` | 各 ≤ 10 项       |
| `trigger.label`                      | ≤ 40 字符        |
| 触发匹配返回                         | 默认 10，最大 20 |

### 2.4 限流（每个会话每分钟）

| 工具                         | 上限 |
| ---------------------------- | ---- |
| `search_notes`               | 30   |
| `resolve_assets_for_trigger` | 30   |
| `read_note`                  | 60   |
| `create_draft`               | 5    |
| `propose_patch`              | 20   |
| `request_confirm`            | 5    |
| `record_use`                 | 30   |

超限返回 `RATE_LIMITED`，`retryable: true`。

---

## 3. 工具定义

### 3.1 `search_notes`

只读。用于先检索再回答，禁止凭记忆生成卡片内容。

```ts
export interface SearchNotesInput {
  query?: string;
  types?: CardType[];
  statuses?: CardStatus[];
  updatedAfter?: string;
  limit?: number; // 1..50，默认 20
}

export interface SearchNotesOutput {
  items: Array<
    CardRef & {
      snippet: string;
      matchedFields: Array<"title" | "body" | "tags">;
    }
  >;
  total: number;
  truncated: boolean;
}
```

规则：

- 无 `query` 时按 `updatedAfter` 或更新时间倒序返回。
- `snippet` 最长 200 字符。
- 不返回正文全文。
- 不返回已归档卡片，除非显式传入 `statuses: ['archived']`。

错误：`VALIDATION_FAILED`、`RATE_LIMITED`、`STORAGE_UNAVAILABLE`。

### 3.2 `read_note`

只读。读取单张卡片的完整内容与关系。

```ts
export interface ReadNoteInput {
  id: string;
  includeHistory?: boolean;
}

export interface ReadNoteOutput {
  card: CardDocument;
  evidence: EvidenceRef[];
  outbound: CardRef[];
  inbound: CardRef[];
  history?: HistoryEntry[];
}
```

规则：

- 默认不返回历史版本，显式请求才返回。
- 原始证据只读，不提供修改入口。
- 卡片不存在返回 `NOT_FOUND`。

### 3.3 `create_draft`

创建草稿。唯一有新建副作用的工具。

```ts
export interface CreateDraftInput {
  type: CardType;
  title: string;
  body: string;
  sourceIds: string[];
  tags?: string[];
  rationale?: string;
  expectedOutcome?: string;
  boundary?: AssetBoundary;
  trigger?: AssetTrigger;
  reuseForm?: ReuseForm;
}

export interface CreateDraftOutput {
  id: string;
  type: CardType;
  status: "inbox" | "draft";
  revision: 1;
  path: string;
}
```

规则：

- Agent 创建的任务固定在 `inbox`，判断和资产固定在 `draft`。
- 判断和资产必须至少有一个有效 `sourceIds`，否则 `VALIDATION_FAILED`。
- 一次调用最多创建一张卡片。
- `rationale` 只写入历史，不进入正文。
- 任务卡可以在创建时填 `expectedOutcome`，实际结果由后续任务更新。
- 资产草稿允许暂不填 `boundary`、`trigger`、`reuseForm`，但激活前必须补齐。
- Agent 不能创建已激活资产，也不能代替用户填写 `actualOutcome`。
- 不允许指定 `id`、`revision`、`createdAt`。
- 不允许创建 `confirmed` 或 `active` 状态。

错误：`VALIDATION_FAILED`、`PERMISSION_DENIED`、`RATE_LIMITED`、`STORAGE_UNAVAILABLE`。

### 3.4 `propose_patch`

提议修改，不写文件。返回 diff 供用户确认。

```ts
export type PatchField =
  | "title"
  | "body"
  | "tags"
  | "sourceIds"
  | "expectedOutcome"
  | "actualOutcome"
  | "variance"
  | "boundary_applies"
  | "boundary_fails"
  | "boundary_counterexample"
  | "trigger_stage"
  | "trigger_label"
  | "reuseForm";

export interface FieldPatch {
  field: PatchField;
  before?: string | string[];
  after: string | string[];
}

export interface ProposePatchInput {
  id: string;
  expectedRevision: number;
  patches: FieldPatch[];
  rationale: string;
  evidenceIds?: string[];
}

export interface ProposePatchOutput {
  proposalId: string;
  id: string;
  expectedRevision: number;
  diff: string;
  requiresConfirmation: true;
  expiresAt: string;
}
```

规则：

- 允许修改的字段只有 `title`、`body`、`tags`、`sourceIds`、任务结果字段、`boundary_*`、`trigger_*`、`reuseForm`。
- `boundary` 按 `boundary_applies`、`boundary_fails`、`boundary_counterexample` 三个字段分别提议，保持 diff 粒度。
- `actualOutcome` 只能由用户在交付完成后填写或确认，Agent 可以提议但不能自行定稿。
- `sourceIds` 只能追加，不能删除。
- 禁止通过该工具修改 `id`、`type`、`status`、`revision`、`createdAt`、`createdBy`。
- 状态变化必须走 `request_confirm`。
- `expectedRevision` 与当前不一致时返回 `REVISION_CONFLICT`，不生成 proposal。
- proposal 默认 30 分钟过期，过期后不可确认。
- 返回的 `diff` 是统一 diff 文本，包含 Front Matter 变化和正文变化。

错误：`NOT_FOUND`、`REVISION_CONFLICT`、`INVALID_STATE`、`VALIDATION_FAILED`、`RATE_LIMITED`。

### 3.5 `request_confirm`

发起人工确认请求。不改变状态。

```ts
export type TransitionTarget =
  "active" | "blocked" | "done" | "archived" | "confirmed" | "deprecated";

export interface RequestConfirmInput {
  id: string;
  expectedRevision: number;
  target: TransitionTarget;
  reason: string;
  evidenceIds: string[];
}

export interface RequestConfirmOutput {
  requestId: string;
  id: string;
  target: TransitionTarget;
  status: "pending";
  expiresAt: string;
}
```

规则：

- 只创建待确认请求，实际写入由宿主在用户点击确认后完成。
- 目标状态必须符合第 5 节的迁移表。
- 判断转 `confirmed`、资产转 `active` 时，`evidenceIds` 不能为空。
- 同一卡片同一目标状态只保留一个 pending 请求。
- 请求默认 24 小时过期。
- Agent 不能确认自己的请求。

错误：`NOT_FOUND`、`REVISION_CONFLICT`、`INVALID_STATE`、`VALIDATION_FAILED`、`RATE_LIMITED`。

### 3.6 `record_use`

记录资产被调用。只追加，不改内容。

```ts
export interface RecordUseInput {
  assetId: string;
  context: string;
  result?: "better" | "same" | "worse";
  taskId?: string;
}

export interface RecordUseOutput {
  assetId: string;
  useCount: number;
  verifiedCount: number;
  lastUsedAt: string;
}
```

规则：

- 只能记录 `active` 资产，其他状态返回 `INVALID_STATE`。
- `useCount` 递增。
- `verifiedCount` 不变。验证次数只能由用户确认增加。
- `result` 表示复用后相对验收标准的结果，不自动映射为验证。
- `result` 缺省的调用照常递增 `useCount`，但不计入"复用成功率"的分母（月度复盘单列为 unknown）。
- `lastUsedAt` 由服务端写入当前时间，请求方不能指定。
- 同一 `requestId` 不重复计数。

错误：`NOT_FOUND`、`INVALID_STATE`、`VALIDATION_FAILED`、`RATE_LIMITED`。

### 3.7 `resolve_assets_for_trigger`

只读。按动作阶段取回该用的资产。资产的价值发生在动作之前，所以这是“今天”视图的主要数据源，不是搜索的替代品。

```ts
export interface ResolveAssetsForTriggerInput {
  stage: TriggerStage;
  taskType?: string; // 匹配卡片 `tags` 中 `type:` 前缀的项（如 `type:报价`），见下方规则
  limit?: number; // 1..20，默认 10
}

export interface ResolveAssetsForTriggerOutput {
  items: Array<{
    id: string;
    title: string;
    reuseForm: ReuseForm;
    trigger: AssetTrigger;
    boundarySummary: {
      appliesWhen: string[];
      failsWhen: string[];
    };
    lastUsedAt: string | null;
    useCount: number;
  }>;
  total: number;
}
```

规则：

- 只返回 `active` 资产。
- 只匹配 `stage` 相同的资产；`on_demand` 资产不进入自动提示，除非显式传入。
- 排序：先按 `taskType` 匹配（即卡片 `tags` 中 `type:` 前缀项；输入未传 `taskType` 时跳过类型排序），再按 `lastUsedAt` 倒序，未使用过的排后面。
- 不返回正文，只返回判断所需的摘要。
- 该工具只提示，不执行资产，也不修改任何状态。
- 缺少 `trigger` 的资产不会出现在结果中。

错误：`VALIDATION_FAILED`、`RATE_LIMITED`、`STORAGE_UNAVAILABLE`。

---

## 4. 权限矩阵

| 工具                         | 读文件 | 写文件       | 改状态 | 需要人工确认     |
| ---------------------------- | ------ | ------------ | ------ | ---------------- |
| `search_notes`               | 是     | 否           | 否     | 否               |
| `resolve_assets_for_trigger` | 是     | 否           | 否     | 否               |
| `read_note`                  | 是     | 否           | 否     | 否               |
| `create_draft`               | 是     | 仅新建草稿   | 否     | 否               |
| `propose_patch`              | 是     | 否           | 否     | 确认 proposal 时 |
| `request_confirm`            | 是     | 否           | 否     | 是               |
| `record_use`                 | 是     | 追加使用日志 | 否     | 否               |

补充：

- 所有工具只能访问 `libraryRoot`（资产库子目录）；主库其他目录不暴露。
- 所有工具不能执行 shell、不能访问任意 URL、不能读写库外文件。
- `create_draft` 只能写入 `inbox/`、`judgments/`、`assets/`，不能写入 `tasks/` 或其他目录。

---

## 5. 状态迁移权限

| 类型 | 起始状态    | 目标状态     | Agent 可发起 | 执行者 |
| ---- | ----------- | ------------ | ------------ | ------ |
| 任务 | `inbox`     | `active`     | 是           | 宿主   |
| 任务 | `active`    | `blocked`    | 是           | 宿主   |
| 任务 | `blocked`   | `active`     | 是           | 宿主   |
| 任务 | `active`    | `done`       | 是           | 宿主   |
| 任务 | 任意        | `archived`   | 是           | 宿主   |
| 判断 | `draft`     | `confirmed`  | 是           | 宿主   |
| 判断 | `confirmed` | `archived`   | 是           | 宿主   |
| 资产 | `draft`     | `active`     | 是           | 宿主   |
| 资产 | `active`    | `deprecated` | 是           | 宿主   |
| 资产 | 任意        | `archived`   | 是           | 宿主   |

"Agent 可发起"不等于"Agent 可执行"。宿主必须在用户确认后，用 `expectedRevision` 再校验一次，然后写入。

额外门槛：

- 资产从 `draft` 转 `active` 时，宿主校验 `boundary`、`trigger`、`reuseForm` 均非空；缺一项返回 `VALIDATION_FAILED`。
- 判断从 `draft` 转 `confirmed` 时，至少关联一个 `actualOutcome` 非空的任务。
- 任务从 `active` 转 `done` 时，必须已填写 `actualOutcome`，否则只能转 `blocked` 或保持进行中。

禁止：

- `draft` 直接转 `archived` 而不经过用户；
- `confirmed` 回到 `draft`（如需修改，创建新草稿）；
- 物理删除任何卡片或证据；
- 批量迁移。

---

## 6. 错误处理

| 错误码                | 含义                 | 是否需要重试     |
| --------------------- | -------------------- | ---------------- |
| `NOT_FOUND`           | 卡片或文件不存在     | 否               |
| `REVISION_CONFLICT`   | 版本已变化           | 否，必须重新读取 |
| `INVALID_STATE`       | 当前状态不允许该操作 | 否               |
| `PERMISSION_DENIED`   | 超出库范围或权限不足 | 否               |
| `VALIDATION_FAILED`   | 参数不合法           | 否               |
| `STORAGE_UNAVAILABLE` | 存储不可用或未授权   | 是，提示用户     |
| `RATE_LIMITED`        | 超过限流             | 是，退避后重试   |
| `NEEDS_CONFIRMATION`  | 操作需要人工确认     | 否，转为确认流程 |

Agent 收到 `REVISION_CONFLICT` 时，必须重新读取再决定，不能自动覆盖。

---

## 7. 审计

每次写入记录：

```ts
export interface AuditEntry {
  at: string;
  sessionId: string;
  requestId: string;
  tool: string;
  cardId: string;
  fromRevision?: number;
  toRevision?: number;
  result: "ok" | "rejected" | "conflict";
}
```

要求：

- 审计日志只追加。
- 与卡片历史分开存放。
- 不记录模型密钥、完整 prompt 和用户隐私文本。
- 审计日志损坏不影响卡片读取。

---

## 8. 阶段 1：插件实现映射

| 工具                         | 实现方式                                            | 风险                             |
| ---------------------------- | --------------------------------------------------- | -------------------------------- |
| `search_notes`               | 工作区元数据索引 + Front Matter                     | 索引可能滞后                     |
| `resolve_assets_for_trigger` | 索引 + `trigger.stage` 过滤                         | 触发字段可能缺失                 |
| `read_note`                  | 读取文件并解析                                      | 大文件需要截断                   |
| `create_draft`               | 通用文件写入到草稿目录                              | 可绕过目录约定                   |
| `propose_patch`              | 内存中生成 diff                                     | 无副作用                         |
| `request_confirm`            | `ui.confirm` 后调用 `files.process`（token 版本化） | 确认来自插件，不是宿主           |
| `record_use`                 | `files.process` 修改计数字段（token 版本化）        | 可能与编辑冲突（token 重试处理） |

关键说明：

**阶段 1 的规则是"约定"，不是"保证"。**插件持有通用写权限，理论上可以绕过这七个工具直接改文件。这一点必须在产品文案和内部文档中写明，不能对外宣称"AI 无法修改正式资产"。

---

## 9. 阶段 2：宿主实现映射

建议 Rust 命令（未冻结；D2 前定稿）：

```text
assets_create_draft
assets_propose_patch
assets_request_transition
assets_record_use
assets_resolve_for_trigger
assets_list_pending_confirms
assets_resolve_confirm
```

要求：

- 命令内部完成校验、历史保存、原子写入。
- 确认由宿主 UI 触发，生成一次性确认凭证。
- Agent 工具层只能调用这些命令，不能直接拿到文件写入接口。
- `assets_resolve_confirm` 不接受 Agent 调用，只接受宿主内部调用。

此时才可以在文档中写：**Agent 无法自行确认或激活资产。**

---

## 10. 验收用例

1. Agent 搜索不到卡片时，返回空列表而不是编造。
2. `read_note` 不存在的 ID 返回 `NOT_FOUND`。
3. `create_draft` 创建判断时缺少 `sourceIds` 返回 `VALIDATION_FAILED`。
4. `create_draft` 无法创建 `active` 资产。
5. `propose_patch` 不落盘，文件 mtime 不变。
6. `propose_patch` 使用过期 `expectedRevision` 返回 `REVISION_CONFLICT`。
7. `propose_patch` 试图修改 `status` 被拒绝。
8. `request_confirm` 只产生 pending，不改变状态。
9. 宿主确认时如果版本已变化，确认失败并提示重新审阅。
10. `record_use` 对 `draft` 资产返回 `INVALID_STATE`。
11. `record_use` 不改变 `verifiedCount`。
12. 相同 `requestId` 重复调用不重复计数。
13. 路径包含 `..` 时返回 `PERMISSION_DENIED`。
14. 超限调用返回 `RATE_LIMITED`。
15. 归档卡片不出现在默认搜索结果中。
16. `resolve_assets_for_trigger` 只返回 `active` 资产。
17. 缺少 `trigger` 的资产不出现在触发匹配结果中。
18. 缺少 `boundary` 或 `reuseForm` 的资产，`draft → active` 被拒绝。
19. `record_use` 更新 `lastUsedAt`，但 `verifiedCount` 不变。
20. `create_draft` 创建任务时允许只填 `expectedOutcome`。
21. `propose_patch` 修改 `boundary_*` 时按字段生成 diff，不整块覆盖。
22. 任务未填 `actualOutcome` 时不能转 `done`。

---

## 11. 明确不提供的能力

- 删除卡片或证据。
- 批量确认。
- 直接设置任意状态。
- 修改卡片 ID 或类型。
- 修改 `createdAt` / `createdBy`。
- 移动库根目录。
- 执行命令或脚本。
- 访问库外文件。
- 自动执行触发匹配到的资产。
- 自动把 `useCount` 或复用结果转成 `verifiedCount`。

这份清单和工具定义同等重要：**能力边界越清楚，Agent 才越敢被放开。**
