# Agent 基座与竞品调研

> 版本：v0.2
> 日期：2026-11-15（v0.2 补记 2026-11-16）
> 关联：《Textus-改造方案》v1.2 /《Textus-Agent工具契约》v0.3 /《笔记资产理论》v0.2
> 回答两个问题：① **Textus 基座能不能做成一个成熟的 Agent？** ② happy-friday-lite / ima / WorkBuddy 三个参照各借什么、怎么借。
> 调研方法：happy-friday-lite 为**源码级**调研（clone 于 `C:\Project\ref\happy-friday-lite`）；Textus 侧为 v1.4.2 逐文件核对结论（见《改造方案》附录 B）；ima / WorkBuddy 为公开资料调研。

---

## 一、happy-friday-lite 源码级调研

### 1.1 产品与功能

对标腾讯 ima 的桌面端个人知识智能助手（Electron 42 + Vue 3 + 纯 JavaScript）。五大模块：**Friday 智能助手**（Agent 对话）、**Office**（AI 文档/表格/演示/PDF）、**知识库**（RAG）、**笔记**（TipTap 富文本 + FIM 补全 + 版本 diff）、**绘图**（思维导图/流程图/UML）+ 日程日历。数据全本地。

### 1.2 架构决策清单（源码级，每条注明出处）

| #   | 决策                                                                                                                                                                                | 实现（文件）                    | 理由（原文摘录）                                                                                                                    | 对我们的启示                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **FilesystemBackend 统一沙箱**：Agent 的一切文件走虚拟绝对路径，rootDir 锁定 `{userData}/knowledge/agent/`                                                                          | `src-electron/agent/backend.js` | 虚拟路径沙箱化，SkillsMiddleware 才能正确解析 `/SKILL/`                                                                             | 契约 §2.2「只允许操作库根目录」的同类实现——沙箱边界要在后端强制                                                                                         |
| D2  | **filesystem-backed memory**：记忆 = 磁盘文件（`SOUL.md` / `USER.md` / `MEMORY.md` / `Agent.md`），启动时载入系统提示词，Agent 可 `edit_file` 自主更新                              | `backend.js` 头注               | 「相比早期 InMemoryStore + SQLite 双向同步方案，磁盘文件对单用户本地应用更直观、可调试、可在记忆界面直接编辑，且无易失性/时序问题」 | **教科书级决策记录**（决策+取舍+被否方案都写了）。我们的「文件是唯一真相」主张与它同向；四文件分工可借                                                  |
| D3  | **HITL：interrupt → IPC → 渲染层弹窗 → Command(resume)**                                                                                                                            | `humanInTheLoop.js`             | LLM 调危险工具 → DeepAgent interrupt 暂停 → 用户 approve/reject/edit → Agent 恢复                                                   | 与契约 `request_confirm` 的「只发起、宿主执行」同构；**危险命令白名单（只读放行）+ 黑名单（rm -rf 等硬禁）+ 其余默认审批**的三层口径值得直接抄进契约 §3 |
| D4  | **SKILL 目录系统**：`SkillsMiddleware` 扫描 `/SKILL/` 的 .md；`_index.json` 供前端展示；**内置技能自动同步覆盖、用户自建不受影响**；兼容 YAML front matter 与简单 Markdown 两种格式 | `skills.js`（491 行）           | 内置技能「始终覆盖更新（确保版本一致）」                                                                                            | 与 Textus 既有 skills 目录同构；内置同步覆盖 + 用户件保护的口径可借                                                                                     |
| D5  | **子代理编排**：预置 `researcher` 通用调研子代理，用户在配置数组追加、不改核心；DeepAgent 内置 `task` 工具派发                                                                      | `subagents.js`（37 行）         | 「用户可追加自定义子 Agent，无需改动核心代码」                                                                                      | 成熟 Agent 的子代理需求它也只做了**一个**通用 researcher——说明子代理不是第一天刚需                                                                      |
| D6  | **RAG 父子分块（Small-to-Big）**：子块 400/50 做向量检索，命中后用父块 2000/200 喂 LLM；笔记走结构感知分块（按标题层级，800/100）                                                   | `rag/chunkers.js`               | 「用小块精准命中，召回后用大块保证上下文完整」                                                                                      | 若资产工作台将来做知识库检索，分块参数与「子查父喂」策略直接照抄                                                                                        |
| D7  | **三类知识库**（个人/本地/Agent）+ Zvec 向量库统一存储按 `kb_type` 区分 + 文件监听增量索引                                                                                          | `rag/` 全目录                   | —                                                                                                                                   | 知识库分层思路可参照；向量库选型与我们「不做向量库」的理论边界冲突，**不借**                                                                            |
| D8  | **权限路径级审批**：`interruptOn` + when 回调按路径触发                                                                                                                             | `permissions.js`                | —                                                                                                                                   | 契约权限矩阵的补充粒度参考                                                                                                                              |
| D9  | **选型**：DeepAgents + LangChain（不自研循环）；Electron + Vue 3；**纯 JavaScript 无 TypeScript**；内置便携 Python 供 python_repl 工具                                              | `package.json` / `AGENTS.md`    | —                                                                                                                                   | 自研循环 vs 框架：它选框架换来了快速成型；Textus 已有自研循环（aicompat/agent），**不需要换**                                                           |

### 1.3 许可红线

**PolyForm Noncommercial 1.0.0**：个人使用、学习研究、修改与源码分发可以；**任何商业用途禁止**；须保留署名。

⇒ 边界：**可以 clone、读码、抄产品决策与设计思路**（本调研即是）；**代码一行不进 MIT 的 Textus fork**（许可冲突 + Vue/Electron 栈不通，双重排除）。

---

## 二、核心问题：Textus 基座能不能做成一个成熟的 Agent

**结论先行：能。** 成熟 Agent 需要的九项能力，Textus v1.4.2 **原生已有七项**，且两项核心（HITL 粒度、预算观测）**强于** happy-friday-lite；真正的缺口只有「子代理编排」「向量 RAG」「跨会话用户记忆」三项——全部是**增量模块**（按改造方案路线图排期即可），不是基座重写。

### 2.1 九项能力对照（成熟 Agent 清单 × 两家实现）

| 能力               | 成熟 Agent 需要     | happy-friday-lite                       | Textus v1.4.2（实测）                                                                 | 判定                                                                  |
| ------------------ | ------------------- | --------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1. 多步 agent loop | 规划→执行→观察→继续 | DeepAgents/LangGraph                    | `src-tauri/src/ai/agent/`（chapters/context/history/flat）+ `aicompat/agent`          | ✅ 原生                                                               |
| 2. 工具系统        | 注册/调用/权限      | 12+ 内置 + registry                     | `ai/tools/` 内置族 + **插件 aiTools 贡献**（manifest 声明、权限表管控）+ 每请求预算器 | ✅ 插件可扩展性更强                                                   |
| 3. HITL            | 危险操作必须人批    | interrupt → IPC 弹窗 → resume（操作级） | `propose_edit` + margin **diff 级审阅** + kept_proposals（产出级）                    | ✅ 粒度更细；缺「操作级」一档（见 2.3）                               |
| 4. 技能系统        | 目录化技能、可扩展  | `/SKILL/` 扫描 + 内置同步               | `ai/skills/` 目录 + 全局配置                                                          | ✅ 同构                                                               |
| 5. 记忆            | 跨会话、可自改      | 四文件落盘（SOUL/USER/MEMORY/Agent）    | `.textus/library` 项目记忆 + workspace                                                | ⚠️ 部分缺口：跨会话**用户记忆**层薄（happy 的 D2 四文件分工值得借）   |
| 6. 沙箱            | 边界强制            | FilesystemBackend 锁 rootDir            | `ToolContext.root` 沙箱边界 + 后端再查                                                | ✅ 原生                                                               |
| 7. 知识库/RAG      | 检索增强            | Zvec + 父子分块 + 增量索引              | workspace 元数据索引（frontmatter/tags/tasks/backlinks），**无向量 RAG**              | ⚠️ 缺口：按笔记资产理论，关键词级检索起步够用；向量 RAG 列入待审      |
| 8. 子代理/编排     | 并行派发            | researcher + `task` 派发                | 无                                                                                    | ⚠️ 缺口：阶段 2 深度功能，非基座问题（happy 也只做了 1 个通用子代理） |
| 9. 观测与预算      | 限流/审计/审阅      | 每请求预算器                            | `CHECK_BUDGETS` + live_eval + margin + 审计日志（契约 §7）                            | ✅ Textus 强                                                          |

### 2.2 两家 HITL 机制合并看（正好覆盖契约需求）

- happy = **操作级**：跑危险命令前弹窗批一下（approve/reject/edit）；
- Textus = **产出级**：改文档出 diff，margin 里逐条审。

资产工作台两者都要：`propose_patch` / 产出 diff 走 Textus 产出级；`request_confirm` / 危险工具调用走 happy 式操作级。**契约 v0.3 的两档设计不需要改**，实现时各取各的。

### 2.3 判定依据说明

「Textus 原生」各条均为 v1.4.2 逐文件核对结论（`C:\Project\ref\textus-analysis`，核对记录见《改造方案》附录 B），非官方宣传。

---

## 三、ima / WorkBuddy 参照要点

### 3.1 ima（腾讯，ima.qq.com）

「搜读写一体」的 AI 知识工作台（混元 + RAG，4.2 亿份文件沉淀）。

借什么：

1. **知识库分层**：个人知识库 / 共享知识库 / 知识库广场 / 知识号——个人→共享→公开的分级正好映射资产工作台「个人资产 → 可分享资产」的演化路径；
2. **「搜读写一体」叙事**：与《笔记资产理论》「瓶颈从记录转移到验证与调用」互相印证，宣传口径可直接化用。

不借：微信生态绑定、共享协作（方案 §10 明确不做多人协作）。

### 3.2 WorkBuddy（腾讯云，workbuddy.cn）

「AI Agent 办公新范式」：自主规划、本地文件操作（授权目录内）、多模态交付、**自动化与定时任务**、代码执行、浏览器自动化；侧边栏信息架构 = 新建任务 / 助理 / **专家·技能·连接器** / 自动化。

借什么：

1. **「专家·技能·连接器」三件套侧边栏**：与契约「工具 / 技能 / MCP 连接器」天然对应，Agent 面板的信息架构可照此组织；
2. **自动化与定时任务**：契约目前没有自动化面——**先进改造方案待审**（触发点：用户出现「定期让 Agent 跑资产盘点」的真实需求），不立即做。

不借：闭源产品只借形态；「7×24 AI 员工」的过度承诺口径（与理论 §8 失败标准「自己不愿意回看」冲突）。

---

## 四、结论与建议

1. **Textus 基座判定：支持做成成熟 Agent。** 九项能力七项原生、两项强于参照；三项缺口（子代理 / 向量 RAG / 用户记忆）全部是增量模块，按改造方案路线图与四道门排期，不动基座。happy-friday-lite 用 DeepAgents+LangChain 拼出来的那套骨架，Textus **原生就有对应物**。
2. **借 happy-friday-lite（登记为决策参照，代码不抄）**：D2 四文件记忆分工、D3 危险命令白/黑名单三层口径、D4 内置技能同步覆盖、D6 父子分块参数——四条建议写进改造方案阶段 1/2 的实现细则。
3. **ima / WorkBuddy**：产品形态参照；WorkBuddy「自动化/定时」进待审。
4. **许可红线**：happy-friday-lite 为 PolyForm Noncommercial——学习研究可以，**代码一行不进 MIT fork**；ima / WorkBuddy 为闭源产品，只借形态。

## 修订记录

| 版本 | 日期       | 变化                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v0.1 | 2026-11-15 | 首版：happy-friday-lite 源码级调研（9 条架构决策）+ Textus 基座九项能力对照 + ima/WorkBuddy 参照要点                                                                                                                                                                                                                                                                                            |
| v0.2 | 2026-11-16 | 补 **DeepSeek Harness（DSH）专项**（§五，实时核证）：官方 agent 运行时平台（MIT，281k★，TypeScript/Cordis 插件架构，developer preview 有破坏性变更）；happy-friday-lite 已把 DSH 作为嵌入模块（iframe + 服务进程）；底座判定不变，DSH 两用法（嵌入 agent 模块 / 资产工具做成 DSH 插件）进待审，触发点 = DSH 稳定版。另：用户指出首轮对比漏 DSH 属实——DSH 爆发发生在笔者训练截止之后，已当日补查 |

---

## 五、DeepSeek Harness（DSH）专项补充（2026-11-16 实时核证）

> 触发：用户指出对比遗漏了 DeepSeek 官方的 Harness——真实的信息滞后（DSH 的爆发发生在笔者训练截止之后），本节为 11-16 补查结论。

### 5.1 DSH 是什么

- `deepseek-ai/deepseek-harness`，**MIT**，TypeScript，281k★，本周仍在提交（deepseek.com/harness）。
- 定位：**通用 Agent 运行时**，"Everything is a Plugin"，基于 Cordis 插件框架（时空可组合编程范式论文）。
- 形态：`npx @deepseek-ai/dsh web` 起 Web UI（127.0.0.1:3080）；社区桌面端 **dsh-desktop**（MIT，36k★，"桌面本身也是插件"）；插件精选列表 24k★；cc-switch 等工具已支持。
- ⚠️ **官方明示 developer preview，将持续破坏性变更**（README 红字）。

### 5.2 happy-friday-lite 的集成形态（源码实锤）

- 它把 DSH 作为**一个模块**嵌进笔记壳：Electron 主进程拉起 DSH 服务（状态机 idle / starting / ready / config-required / failed），Vue 端 `<iframe :src="status.url">` 把 DSH Web UI 嵌成一个标签页（`views/harness/DeepSeekHarness.vue`），剪贴板权限照给。
- 能这么便宜的原因：**Electron 天然自带 Node**——拉起 `npx dsh web` 几乎零成本。

### 5.3 对「底座选择」的影响

| 维度                 | Textus 底座（Tauri/Rust）              | DSH 底座（Node/插件平台）                |
| -------------------- | -------------------------------------- | ---------------------------------------- |
| Agent 运行时         | 自研循环（九项七原生）                 | ✅ 官方平台 + 生态分发                   |
| 笔记编辑器           | ✅ Milkdown 字节保真（最难的件已解决） | ✗ **自建**（大头仍在这）                 |
| 移动端               | ✅ iOS/Android 原生                    | ✗ 桌面 / 移动浏览器                      |
| 稳定性               | v1.4.2 发布线                          | ⚠️ developer preview，官方承诺破坏性变更 |
| 嵌 DSH 作 agent 模块 | 需 Node sidecar（成本中）              | ✅ iframe 即可（Electron 自带 Node）     |

**结论补记：底座判定不变（Textus）。** DSH 的正确用法有两条，都进待审、共用同一触发点（**DSH 出稳定版 / 插件 API 冻结**）：

1. **嵌入 agent 模块**：像 happy-friday-lite 那样把 DSH 作为 Agent 面板的引擎之一嵌入（Textus 侧需解决 Node sidecar 的打包与升级）；
2. **资产能力开放通道**：把契约七工具做成 **DSH 插件**，向 DSH 生态分发资产能力（Astryx 同款 agent-ready 思路，MIT 与 DSH 的 MIT 同族无冲突）。

### 5.4 信息时效披露

- 首轮对比（11-15）漏掉 DSH：其爆发发生在笔者训练截止之后——真实滞后，用户 11-16 指出后当日补查。
- 本节全部结论来自 2026-11-16 实时核证：DSH 仓库与 README（GitHub API 当日读取）、happy-friday-lite 仓内 Harness 模块源码、npm registry 实时版本。
