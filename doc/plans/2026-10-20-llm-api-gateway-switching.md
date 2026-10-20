# 设计提案：多服务商模型接入与选择

- 日期:2026-10-20
- 状态:首期 AI SDK / API 平台选择实现与验证中；真实上游验证等待用户在界面填写 Key
- 范围:`packages/shared`、`packages/db`、`server/`、`ui/`(AI 连接/路由相关)
- 权威现状文档:`doc/connections/AI-CONNECTIONS.md`(尤其 573-708 行 "Advanced provider routing")、`doc/connections/AI-CONNECTION-ROUTERS.md`
- 用户澄清（2026-10-20）：希望在系统内直接选择接入 DeepSeek 等自选模型。首要交付是“选择服务商 → 配置 API Key → 选择模型 → 用于 Agent”，公司网关默认和容灾均降为后续能力。
- 已选技术：Vercel AI SDK，新增 `ai_sdk` direct adapter，通过各平台原生 provider 与 ToolLoopAgent 执行本机 API/MCP 任务。复用现有任务生命周期、加密凭据、授权和运行记录；首期无 shell/任意项目文件操作、远程沙箱或进程中断后的工具循环无损恢复。已有编码执行器继续按原契约运行。

- 交互调整（2026-10-20）：按用户指定的 DeepSeek Harness 平台模式实现。自定义 API 首期限定公网 HTTPS DNS 名；服务端注入 DNS pinning 运输层，拒绝重定向和私网，模型变更重置会话；API SDK 不对接订阅凭证。

## 1. 需求背景与目标

当前系统已有 Anthropic / OpenAI / OpenRouter / xAI / Google 的连接能力，也已有自定义网关创建界面及部分运行环境投影。目标是把技术协议配置包装成可直接选择的模型服务商与模型，让用户能给不同 Agent 使用 DeepSeek 等服务。是否支持某个供应商，取决于实际协议、鉴权、模型和运行环境测试，不承诺“任意网关”通用。

首期以 DeepSeek 为明确接入验收目标，同时保留既有服务商和“自定义兼容 API”入口。通义千问、Kimi 等列为后续预设候选，逐家核验后发布。系统内置 AI 功能单列后续范围；对外提供统一推理 API 不属于本提案。

目标(按优先级):

1. 用户选择 DeepSeek 等服务商，填入 API Key 后可选择模型，无需先理解 Responses/Messages/Chat 协议。
2. 每个 Agent 可独立选择服务商账户和模型；显式切换时将连接与模型一起验证、保存，运行记录显示真实服务商和模型。
3. 高级用户可自定义 API 地址、协议和模型 ID。
4. 后续再增加公司默认模型方案和可选主备策略。

非目标(本期不做):

- 修改 provider 封闭枚举(网关走"provider + routing"形态,不新增 provider)。
- 为 hermes-gateway / openclaw-gateway 等外部 agent 适配托管路由(现有文档已将其排除)。
- 对外提供代理服务、按请求转发所有模型流量、跨供应商通用协议转换、网关侧统一计费。
- 首期自动容灾、自动跨模型重试和不兼容执行器迁移。用户主动选择兼容模型属于首期；费用未知时保留 unknown/unpriced，不能套用官方价格或假定免费。

## 2. 现状摸底(2026-10-20 调查结论)

本节记录实施前基线；当前新增的 DeepSeek preset、模型配置和 AI SDK 执行能力见 [AI Connections](../connections/AI-CONNECTIONS.md#api-platforms-through-vercel-ai-sdk)。控制接口测试使用真实 SDK 与受控 HTTP 上游，不能替代用户 Key 下的真实 DeepSeek 接通证据。

### 已有基建(复用为主)

- **AI 连接底座**:连接存 `tool_connections` 表(`connectionPurpose: 'ai'` + `transport: 'runtime_auth'`,DB CHECK 约束强制),AI 元数据在 `config.ai = { provider, method, routing? }`,凭证只存 vault 引用(`packages/db/src/schema/tool_access.ts`)。
- **高级网关路由(已存在)**:`config.ai.routing`(`packages/shared/src/ai-provider-routing.ts`),`kind ∈ openrouter|bedrock|gateway|local`、`protocol ∈ responses|messages|chat|bedrock`、`baseUrl`、`auth ∈ bearer|api_key|none`、`region`、可选 `models[]`。URL 安全校验已就位:禁 userinfo/query/fragment,远端强制 HTTPS,loopback 可 HTTP。
- **创建 UI 已存在**:`AiProviderSetup.tsx` 已提供 Custom gateway / Local endpoint 的协议、URL、鉴权、模型 ID 和权限设置；Connectors 目录已有相应协议入口，Agent Runtime 已有兼容连接选择器。
- **个人默认已存在**:`ai_provider_defaults` 按 company/user/provider 唯一；`ai_connection_defaults` 为旧版按 method 的兼容层。当前 `setDefault` 明确拒绝 routed connection，因此不能把现有个人默认接口称作公司全局网关切换。
- **运行时投影**(`server/src/services/ai-provider-routing.ts`):按 harness 写配置——
  - `codex_local` → `config.toml` 的 `model_providers.paperclip`(base_url + `wire_api="responses"`)
  - `claude_local` → `ANTHROPIC_BASE_URL` + token 一组
  - `opencode_local` → `OPENCODE_CONFIG_CONTENT`(openai-compatible provider)
  - `hermes_local` → 隔离 `config.yaml`,key 用环境引用防泄漏
  - bedrock → `CLAUDE_CODE_USE_BEDROCK` + bearer token + region
- **目录形态**:已有 Responses/Messages/Chat-Completions/Bedrock/OpenRouter 等 AppDefinition(`packages/shared/src/app-definitions/*.json`)。
- **运行时接入**:`prepareManagedAiRuntime`(`server/src/services/ai-connection-runtime.ts:213`)在运行准备阶段解析 binding → vault 读凭证 → 一次性私有 home → 清空继承的 AI 环境变量 → 应用路由投影。
- **测试能力(分层)**:(a) 官方固定端点 key 校验;(b) usage probe;(c) harness 环境实测(Run test)。
- **连接池骨架(实验性,默认关闭)**:`ai_connection_pools` 表 + 插件能力 `ai.connections.route` + 实例 flag `enableAiConnectionRouters`。策略由插件提供；现有任务 pin/恢复复用具体分配，不允许任意换账号或 harness。这不等于已有安全故障切换。该开关不要与普通自定义网关连接混淆。

### 差距

| 项目 | 现状 |
|---|---|
| 服务商与模型入口 | 已有协议向导和显式选择；缺 DeepSeek 等品牌预设、易懂的模型列表和连接/模型联动体验 |
| harness 兼容提示 | 矩阵分散(protocol↔provider↔harness 配对强约束),用户不知道自己的 agent 能用哪种网关 |
| 公司默认切换 | 个人 provider 默认不能接纳 routing；缺独立公司默认策略和显式继承模式 |
| 自动切换 | pools 骨架在，但默认关闭，本仓库未内置选择策略；自托管可安装兼容插件，安全 failover 仍需另行定义 |
| gemini_local / grok_local | **完全没有自定义路由投影**,接网关是新工作 |

### 约束与红线(必须遵守)

- provider 枚举 `AI_PROVIDERS` 封闭,`ai_connection_defaults` 表有 CHECK 约束——不改枚举,网关走现有 5 provider + routing.kind。
- 兼容矩阵硬门槛(`isAiRoutingCompatible`):messages↔anthropic、responses↔codex_local、chat↔opencode/hermes、bedrock↔claude_local。
- **配置冲突红线**:托管 AI 连接模式下,agent config env 出现 `ANTHROPIC_BASE_URL/OPENAI_BASE_URL` 等 20+ 个 key 会直接 422 拒绝(`ai-connection-runtime.ts:231-246`),运行时统一清空。切换网关必须走连接/路由路径,不得注入环境变量。
- **凭证安全规范**:凭证继续使用现有 vault 引用；routing、日志和审计不存明文密钥。网关保存路径不主动请求自定义地址，Agent 验证沿用选定执行环境中的 Run test。系统 Fast Response 当前可由服务器直接调用自定义端点，不能泛称“控制面从不访问自定义 URL”。
- **路由身份**:已有 reconnect 要求路由目标不变。改变目标地址/协议应新建连接，再切换引用；轮换密钥使用既有 reconnect，保留授权和审计。

### 必须区分的调用路径

| 路径 | 当前能力 | 本提案范围 |
|---|---|---|
| Agent CLI / Runner | 按执行器投影兼容网关配置 | 首期覆盖 |
| 系统 Fast Response | SDK 已支持 routing/baseURL，有独立设置和预算 | 后续明确采用默认策略，不随 Agent 默认偷偷切换 |
| 系统 Decision Models | 专用 OpenAI/OpenRouter decision/evaluation 接口 | 单独评估能力，不能用通用 Chat/Responses 兼容替代 |
| 外部 HTTP/Process/OpenClaw 等 | 模型配置由外部执行器管理 | 保持现有边界 |

## 3. 设计方案

复用现有 AI Connections、grant、vault、路由投影和执行检查。增加服务商预设与模型选择层，现有运行层负责调用。首期不依赖新的公司默认表或路由插件。

### P0 服务商目录与模型身份

- 产品入口统一叫“模型服务”。第一批在 API 模型入口提供 DeepSeek、OpenAI、Anthropic、OpenRouter、自定义兼容 API；先选平台，再选账户和模型。
- 服务商 preset 包含稳定品牌 ID、名称、文档链接、已核验端点/协议选项、鉴权类型和模型目录来源。DeepSeek 可能提供多个兼容入口，应按运行环境选取已验证的预设，不把品牌硬编码为单一协议。
- 服务商身份与现有 `AiProvider` 技术枚举分离。建议在 typed AI metadata 中新增可选 `vendorPresetId`，保存如 `deepseek` 的产品身份；runtime provider 仍按既有协议契约投影。具体 schema 字段需 shared/server/UI 同步，不能让严格校验静默丢弃。
- preset 身份由服务端校验与实际端点、协议的匹配关系，目录 slug 与 UI 再使用已校验身份。若用户改为自定义地址，显示为自定义服务或经过核验的第三方接入，不继续冒充 DeepSeek 官方直连。既有未带 preset 的连接保持原身份，不能仅凭相同模型名推断供应商。
- 模型身份使用“连接 + 上游 model ID”，显示品牌、模型名及经过验证的能力。温度、思考模式等参数只在所选模型支持且运行时可投影时开放；未知能力不伪装成支持。
- 模型列表优先使用已核验的官方目录接口或随版本维护的目录，并记录来源/更新时间；支持手动模型 ID。目录加载失败不清空已保存选择，显示缓存/失败状态。首期不让服务器任意抓取自定义地址；自定义发现继续在受控执行环境中验证。
- 不把模型列表可见当成可执行证明。标准任务执行必须验证流式、工具调用、权限和结果持久化；缺工具能力的模型不能冒充可执行完整 Agent 任务。

### 用户主流程

1. 首次引导 / 新建 Agent / Agent 编辑 → API 模型 → 选择 API 平台；也可在连接目录先创建账户。
2. 输入 API Key，服务地址与协议由预设提供；高级配置允许显式调整，权限沿用现有个人/共享机制。
3. 保存 API Key 账户，再选择连接目录模型或输入精确 ID；DeepSeek 有维护的建议列表，其他平台不伪造列表。Run test 为独立小额计费请求，保存账户不证明模型可用。
4. Agent 配置选择“DeepSeek · 我的账户”，再选模型。显示最终配置摘要，保存连接和模型这一整体。
5. 新建 Agent 时推荐兼容且可用的执行方式；现有 Agent 发现不兼容时说明原因和可用选择，不后台悄悄换执行器。必要的执行器修改经用户明确选择后与模型一起保存。
6. 下一次新执行使用所选模型；正在运行的任务保持原配置。界面语言不会改变模型选择或凭证。

### P1 模型接入与选择体验

- 在现有连接页面增加清晰的“模型连接”入口/筛选，复用现有向导。卡片显示名称、服务地址、协议、可用范围、最近测试结果和使用中的 Agent；密钥仅提供替换操作。
- 预设表单顺序：服务商 → API Key → 模型 → 使用权限；协议和服务地址放在高级选项。自定义入口保留名称、协议、URL、鉴权和模型 ID。保存连接复用 `POST /api/companies/:id/ai-connections`。
- 根据 `isAiRoutingCompatible` 筛选，明确 Codex 需要 Responses，Claude 需要 Messages/Bedrock，OpenCode/Hermes 对应受支持的 Chat Completions 配对。“OpenAI 兼容”不是完整能力证明。
- Agent 编辑器从所选连接的模型目录渲染搜索下拉，同时支持已配置或手动 ID。连接变化时清晰提示重新选择兼容模型，不保留看似有效的旧模型；取消编辑保留原配置。
- 连接绑定与模型配置必须在 Agent 保存事务中作为整体校验和提交，使用配置版本检查避免覆盖并发修改；必要且用户明确选择的执行器修改一并提交。任何校验失败都不改变旧配置。创建连接成功但 Agent 保存失败时，保留连接供重试，显示明确结果。
- Run test 沿用 `withManagedAiProbe`，在选定执行环境验证鉴权和普通模型请求；真实流式/工具任务另验，区分“已保存 / 未测试 / 最近测试通过 / 测试失败”。测试通过记录时间、执行环境与配置版本，不代表永久健康。
- 明示 localhost 的调用位置：Agent 测试指 Agent 所在执行环境；后续系统 SDK 功能指服务器环境。
- 特殊供应商鉴权必须同步评估 shared 校验、运行时投影、Runner allowlist 与保密边界，不以“加一个 auth 枚举”作为完整方案。

产出：用户可直接接入 DeepSeek、选择模型并让 Agent 执行真实任务；无需理解底层协议即可走完常见流程。

### P2 公司默认与显式继承（可选后续，不阻塞首期）

- 公司设置增加“模型默认连接”：按执行器/provider 显示默认连接；Agent 配置增加“跟随公司默认”，并保留“负责人个人账户”和“固定连接”的现有语义。
- 不自动迁移已有 Agent。只有明确采用公司默认的 Agent 随策略变化；个人默认失效时不偷偷改用公司密钥。
- 公司默认只能引用当前公司内授权共享的 connection/grant；每次执行重新验证负责人 audience、Agent 使用权限、连接状态、预算和暂停/Stop。
- 初版只切连接，不自动改 Agent 的模型。切换前展示影响预览：将跟随的 Agent、固定不变的 Agent、模型/协议不兼容的 Agent。存在已知不兼容时先解决再保存，运行时仍重新校验；模型名称相同也不等于上下文与工具能力相同。
- 保存后默认影响下一次新的执行准入。运行中的调用不更换目标；挂起恢复仍按既有执行契约验证，不能借恢复重新路由。旧连接失效时显示修复动作。
- 新执行的连接身份改变时创建新的 provider session，以任务历史交接上下文；不向另一个网关转交旧供应商的不透明 session ID，不承诺原生会话无损续接。
- 保存策略记录活动日志与版本；允许选择旧连接恢复默认，但不重放已完成工作。配置版本冲突返回 409。

#### 建议契约（新增设计，不是现有 API）

- 新增 `company_ai_runtime_defaults`：`companyId`、`effectiveHarness`、`provider`、`connectionId`、`grantId`、`revision`、`updatedBy`、`updatedAt`；唯一键 `(companyId, effectiveHarness, provider)`，关联强制公司一致。effectiveHarness 复用 `aiRoutingHarness(adapterType, config.provider, config.acpxAgent)` 解析，不直接用 paperclip_runner 这个外层 adapterType，避免混淆 Codex 与 OpenCode 等执行器。协议由连接拥有，不另存一份可漂移的协议。
- 扩展 Agent 的 typed binding 为 `company_default`；旧 responsible_user/shared/delegated 兼容保留，不能用缺省字段触发继承。
- 拟新增公司域 API：`GET/PUT /api/companies/:companyId/ai-runtime-defaults`，以及 `POST .../ai-runtime-defaults/preview`。沿用连接管理权限，普通 Agent 不能修改公司默认。
- preview 只做范围、权限、协议和已知模型配置检查，不泄露无权访问的 Agent 或 grant，也不发付费推理请求；保存与实际执行均复核，不能把 preview 结果当授权凭据。
- 执行记录复用现有持久化机制，补充安全的选择来源和默认 revision；保存实际连接/grant、模型与路由身份，排除明文密钥。不要再造第二套运行日志。
- 同步 db/shared/server/ui、API 文档和受影响的功能/访问地图；数据库迁移按仓库既有流程生成。

### P3 自动切换/容灾（独立后续设计）

- 评估并复用连接池授权、并发游标与 pin 机制；开关本身不提供策略，本地内置主备策略需独立实现和验证。
- 初版候选规则仅在能证明 provider work 尚未开始时重选；已经输出、执行工具或结果不确定时，不自动重放整个任务。网络超时本身不证明未执行。
- 401/403、429、额度耗尽、5xx 分别处理；重试有上限、冷却和持久化记录；每次准入复核权限、预算、Stop，累计每次尝试的已知费用，未知价格明确标识。
- 不自动跨执行器、跨协议或换模型。定义与现有任务 pin、恢复策略的关系后才能开发，不能简单开启 flag 宣称容灾完成。

### P4 覆盖面扩展(按需)

- 给 `gemini_local` / `grok_local` 补 routing 投影——先验证 harness 本身是否支持自定义端点,不支持则文档说明限制。
- 将系统 Fast Response 纳入显式策略，并单独评估服务器出站地址限制、重定向、预算、计价与实际流式行为。Decision Models 保持专用能力检查。

## 4. 验收标准

1. DeepSeek 官方接入可从服务商目录完成 API Key 配置、模型选择和 Run test，并完成至少一条含工具调用及后续上下文交接的真实 Agent 任务；仅测试普通对话不算完整验收。
2. Agent 显示的服务商/模型与实际请求的端点/model ID 一致；同公司两个 Agent 可各用不同服务商和模型。
3. 用户主动切换兼容的连接和模型可在下一次新执行生效；保存失败原配置完整保留，旧运行不被改写；恢复、密钥轮换和撤销有回归覆盖。
4. 凭证不出现在 DB 明文、日志、UI 响应中(沿用 run-secret-redaction)。
5. 跨公司、越权负责人、无 Agent 授权、预算耗尽、暂停/Stop、不兼容协议/模型、未测试和测试失败均有可解释行为；网关未知成本不显示成零费用。
6. 实现按最小验证逐步推进；PR-ready 前完成 `pnpm -r typecheck`、`pnpm test:run`、`pnpm build`，UI 修改另跑 token gates；同步 AI-CONNECTIONS.md 与相关地图，设计阶段不以检查代码代替实际验收。
7. 后续公司默认另验继承、固定绑定、并发版本冲突和影响预览；不将其作为首期 DeepSeek 接入的前置条件。

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| 第三方网关协议偏差(非严格 OpenAI 兼容)导致 harness 实测失败 | 保存不校验、Run test 实测的既有模式;向导中明示兼容性矩阵 |
| 原生订阅连接 token 刷新的并发问题 | 继续复用现有 freshness/epoch 守卫与 mutation lock；当前自定义 routing 不提供订阅登录，带凭据网关沿用 API key |
| P3 失败归因不足导致任务重复执行 | 要求执行前失败的正面证据；不确定结果交给既有恢复机制，不自动换网关重放 |
| gemini/grok harness 不支持自定义端点 | P4 先调研后动手,不支持则文档化限制 |
| 个人默认与公司默认混用 | 独立策略与显式继承，保留现有个人默认，按标准流程生成迁移 |
| 同一模型 ID 在网关的能力/价格不同 | 以实际协议与工具验收为准，费用保留来源，不能直接套官方价格 |

## 6. 参考文件

- `packages/shared/src/ai-connections.ts`(provider 枚举、能力表、binding)
- `packages/shared/src/ai-provider-routing.ts`(routing schema、兼容矩阵)
- `packages/db/src/schema/tool_access.ts`、`ai_provider_defaults.ts`、`ai_connection_defaults.ts`、`ai_connection_routing.ts`
- `server/src/services/ai-connection-runtime.ts`、`ai-provider-routing.ts`、`ai-api-key-test.ts`
- `server/src/routes/ai-connections.ts`
- `ui/src/components/ai-connections/`(约 20 个现有组件)
- `doc/connections/AI-CONNECTIONS.md`、`AI-CONNECTION-ROUTERS.md`
- `server/src/services/fast-response-provider.ts`、`decision-model-provider.ts`（系统内置 AI 的不同调用路径）
- `server/src/services/heartbeat/execution-configuration.ts`、`session-preparation.ts`（恢复和会话边界）
- [DeepSeek 官方接入文档](https://api-docs.deepseek.com/)：2026-10-20 查阅，提供 OpenAI/Anthropic 兼容入口；模型目录与能力在实现时再次核验。
- [OpenCode 服务商配置](https://opencode.ai/docs/providers/)：候选执行器的原生服务商/自定义端点能力，不能代替本仓库托管运行的实际验收。

- [DeepSeek Harness 平台配置](https://deepseek-harness.github.io/deepseek-harness/guide/providers)：交互参考；不引入 Harness 作为运行依赖。
