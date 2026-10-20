# API 平台选择与中英文切换：接续交接

- 日期：2026-10-20
- 状态：**2026-10-20 接续完成：两个 P1 已修复，完整正式测试清单已通过分组/分片复验，类型检查、构建及结构检查通过。条件跳过未计为通过；真实平台联调等待用户在界面填写 Key。**
- 分支：`codex/deepseek-i18n`
- 本轮开发起点：`238b23d41f73e269aa082a17f4fadc8f8d5b9c0e`
- 远端：`git@github.com:hhu134242-arch/project-agent.git`
- 接续基线：`3aa6c156c9220604428e4acfb1a3400ce3089c2f`。第 3、4 节保留暂停时的问题与证据；最新修复和验证状态见第 7 节。

## 1. 用户已经确认的方向

1. 系统支持中英文切换。
2. 使用 **Vercel AI SDK** 接入模型，优先支持 DeepSeek。
3. 用户进一步要求采用 **DeepSeek Harness 那种选择 API 平台的交互**。因此产品入口调整为 **API 平台 → API 账户 → 模型**，AI SDK 留在底层，不要求用户理解执行器实现。
4. 当前入口提供 DeepSeek、OpenAI、Anthropic、OpenRouter、自定义兼容 API。
5. 用户明确表示 **API Key 稍后在界面填写**。本轮没有真实 DeepSeek 或其他平台的测试 Key，没有真实付费上游联调结果；不要要求在聊天里粘贴密钥。
6. 暂停时要求写交接并 commit/push；随后用户明确要求接续修复两个 P1、完成所有可独立执行的验证、更新文档并提交推送当前分支。不要合并或部署。
7. 所有 Git commit 信息使用中文。

设计背景见：

- [模型接入设计](2026-10-20-llm-api-gateway-switching.md)
- [国际化设计](2026-10-20-i18n-localization.md)
- [当前连接实现说明](../connections/AI-CONNECTIONS.md#api-platforms-through-vercel-ai-sdk)

## 2. 已实现内容

### API 平台与运行时

- 新包 `packages/adapters/ai-sdk/`，注册到 server、UI、CLI、Vitest 和发布包清单。
- 当前依赖：`ai@7.0.130`、`@ai-sdk/deepseek@3.0.68`、`@ai-sdk/openai@4.0.86`、`@ai-sdk/anthropic@4.0.78`、`@openrouter/ai-sdk-provider@3.1.0`、`@ai-sdk/mcp@2.0.79`。
- 官方 DeepSeek 使用原生 provider；OpenAI 使用 Responses，Anthropic 使用 Messages，OpenRouter 首期使用 Chat Completions。
- 自定义兼容 API 支持 Chat Completions、Responses、Messages。首期限定公网 HTTPS DNS 名，不支持 IP 字面量、本地/私网端点、Bedrock、Google、xAI 的 SDK 入口。
- 原有 CLI/Runner 接入方式保留，不自动迁移已有 Agent。
- `ToolLoopAgent` 提供流式输出、工具循环、逐步 token 用量、超时和 Stop。未知金额标为 `unpriced`，不假设免费或套用其他平台价格。
- 通过现有 vault/grant/connection 保存和授权密钥；绑定必须是显式 shared/delegated API-key 账户，不支持订阅、responsible-user 默认或连接池隐式选择。
- `prepareManagedAiRuntime` 从已授权连接覆盖 `managedAiProvider`、`managedAiVendor`、`managedAiRouting`；原生 API 密钥不写入 Codex/Claude CLI 凭据文件。
- 自定义请求由 server registry 以非 JSON 参数注入 `createAiSdkEndpointFetch`。复用现有 DNS pinning/socket peer 校验，禁私网和重定向，传递取消，解压后每响应上限 32 MiB；适配器缺少保护 transport 时拒绝执行。
- 只允许本机、standard trust 执行。不支持 SSH/远程沙箱、shell、任意项目文件编辑、进程退出后的工具循环无损恢复。
- 提供当前任务 API、受限的公司/资源 API 请求工具、服务端授权的指令/技能读取、run-scoped MCP 工具。
- 会话有大小上限；平台/协议/地址/模型/凭据/公司/Agent/任务/工作区变化会重建会话。
- 新增 DeepSeek 目录、品牌资源和来源记录。模型预设为当前核验的 `deepseek-flash`、`deepseek-v4-pro`，可手动填写准确 ID；其他平台不伪造模型目录。

### 平台选择 UI

- `AiSdkConnectionField` 统一首次引导、新建 Agent、编辑 Agent 的平台/账户/模型选择。
- 官方平台填写 API Key，自定义平台才显示地址和协议。
- 复用 `AiProviderSetup` 的凭据与权限流程，API-only 模式隐藏订阅。
- 切换平台清空旧账户和模型；无有效组合禁止测试/保存。账户或模型变化清除旧测试结果。
- 连接和模型作为同次 Agent 配置保存；取消编辑恢复原配置。
- 语言切换保留当前平台和输入状态。

### 国际化

- 发布 `en` / `zh-CN` 两个语言，支持 English、简体中文、跟随浏览器。
- 偏好保存在按 origin/userId 隔离的 localStorage，跨公司和同账号标签页同步。没有新增数据库偏好表，没有跨设备同步。
- `html.lang`、日期/相对时间/数字/货币显示随语言更新；不改变币种、金额单位、业务时区、UTC 月预算、用户内容或 Agent 回复语言。
- 已迁移核心流程：登录、导航、组织创建/选择、首页、任务创建/列表/详情/编辑器、个人设置、模型接入/首次引导的主要文案。
- **并非全站历史界面都已翻译**；审批、费用、技能等剩余专门页面按原设计 P2 继续迁移。
- 特性资源位于 `ui/src/i18n/features/*.en.json` / `*.zh-CN.json`，保留缺键、重复键、插值、复数及不安全内容检查。

## 3. 暂停快照：当时未修复的两个 P1（现已修复）

### P1-A：无指定任务的唤醒没有业务工具

文件：`packages/adapters/ai-sdk/src/server/paperclip-tools.ts`，函数 `paperclipTools` 开头。

交接提交时为：

```ts
if (!taskId || !ctx.authToken) return {};
```

手动/周期 heartbeat 可能没有 taskId，因此连 `paperclip_api_request` 都没有，不能通过 `/api/agents/me/inbox-lite` 获取待办。只读验证已确认无 task 时工具列表为空。现有 `heartbeat-ai-sdk.test.ts` 的无任务 fixture 只返回文本，没有覆盖这一流程。

接续修复：

- 只以 `authToken` 作为整个业务工具集的前提。
- 有认证但无 taskId 时仍提供受限的通用 `paperclip_api_request`。
- 仅四个固定当前任务工具要求 taskId。
- 补真实 SDK/受控 HTTP 两轮回归：无 task 的模型调用 inbox，收到结果后完成；不要仅测对象上存在某个 key。

### P1-B：MCP 工具异常未在发送给模型前脱敏

文件：`packages/adapters/ai-sdk/src/server/execute.ts`，工具 `execute` 包装处。

交接提交只对成功返回值 `redactValue`，没有 catch 工具抛出的异常。MCP SDK 会原样保留 JSON-RPC `error.message`，AI SDK 会把工具错误文本放进下一轮模型请求。如果远端错误回显了 MCP token，最终日志/session 脱敏已经太晚。

接续修复：

- 捕获同步抛出和异步 reject。
- 普通工具异常改为安全消息，不保留含原始错误的 cause/data。
- 已取消时保留 signal 的取消语义；不得吞取消或提前结束未收尾的 owned tool promise。
- 补真实两轮 SDK/MCP HTTP 测试：MCP `error.message` 故意包含 run-scoped token，断言所有 provider request bodies、日志、持久会话均不含 token。

负责修复的子 Agent 在用户暂停时已中断。暂停后的源文件复查显示上述两处仍是原实现；没有把修复算作完成。继续时先检查实际 HEAD，避免重复或遗漏可能追加的快照内容。

## 4. 暂停快照：验证事实与边界

以下是交接提交 `3aa6c156c` 时的历史结果，最新结果见第 7 节；计数有重叠，不能直接相加为唯一测试数。

| 验证 | 结果 |
| --- | --- |
| 全仓 `pnpm -r typecheck` | 最后一次通过；此前发现 managed runtime 返回类型推断问题，已修复后重跑通过 |
| 全仓 `pnpm build` | 通过，实际成功命令为 `NODE_USE_ENV_PROXY=1 pnpm build` |
| 受影响包 build（shared、ai-sdk、server、UI、CLI） | 通过 |
| SDK、managed connection、heartbeat、i18n、Agent/引导 UI 组合 | 15 文件，527 项通过 |
| 补充出站防护、语言与接入组件回归 | 7 文件，118 项通过 |
| SDK 专项 | 63 项实际 SDK/受控 HTTP 测试及 2 项流式脱敏测试通过，已包含在组合覆盖中 |
| 现有出站 guard 专项 | 3 文件，57 项通过，包含在补充覆盖中 |
| Token gates / maps / brand assets / release package map / diff check | 通过 |
| 浏览器实际页面 | 已验证平台选择、官方 API Key 表单、自定义协议表单、中英文切换保留平台；未填写真实 Key |
| 全量 `pnpm test:run` | **未完成**。此前验证环境重启中断过；最近一轮在用户要求暂停时主动停止，没有最终汇总，不得记为通过 |
| 真实付费平台调用 | **未执行**，用户决定稍后在界面填写 Key |
| 两个最终 P1 | **未修复、未补回归**；既有绿测不覆盖它们 |

已处理的验证问题：

- 新增原生平台账户测试最初复用了 alice，污染其他用例的默认账户；已改为独立 owner，managed connection 套件 118 项重跑通过。
- Agent 编辑测试 fixture 的类型字段最初不齐，已修正；UI typecheck 通过。
- 无参数的普通 Node 网络请求未使用环境中小写代理变量，全仓构建卡在无关技能目录的 GitHub 下载；使用 `NODE_USE_ENV_PROXY=1` 后构建通过。没有为此修改生产代码。
- JSDOM `scrollTo`、未知 fixture 模型的 AI SDK 兼容提示、既有 bundle size/Rust unused 警告仍存在，未当作产品成功或失败证据。

本机日志/截图保存在被 Git 忽略的 `tmp-platform-verification/`：

- `typecheck-final.log`、`build-final.log`、`affected-build.log`
- `targeted.log`、`final-small-regression.log`、`full-tests.log`
- `token-gates-final.log`
- `preview-proof/doctor.json`、`preview-proof/cleanup.json`
- `preview-proof/platform-en.png`、`platform-zh.png`、`platform-final.png`

这些是本机证据，不随 Git push。远端接续依赖本交接的结论并重新执行验证，不能把本机路径当作远端可下载附件。没有 Paperclip issue/API 凭据上下文，所以没有伪称上传 work product。

## 5. 后续接续顺序

1. 阅读根 `AGENTS.md`、核心文档及匹配的 `rules/*.mdc`；用户要求中文 commit。
2. 检查分支、HEAD、工作区并保留已有改动。第 3 节是历史问题说明，两项 P1 已由本次接续修复，先读第 7 节，不要重复修复。
3. 如需安装依赖，使用 `pnpm install --no-frozen-lockfile`。`pnpm-lock.yaml` 由仓库 CI 管理，前轮安装产生的 lock 修改已恢复，本次接续也未修改它。新适配器依赖以各 package.json 为准。
4. 用户在界面填写 Key 后完成真实平台联调；如继续修改，保留新增的实际 SDK/HTTP/MCP 回归。剩余专门页面翻译继续按原设计 P2 处理。
5. 根据后续改动重跑必要验证；本次结果和条件跳过项见第 7 节，不要把旧的中断/失败执行判为绿。

```sh
pnpm exec vitest run \
  server/src/__tests__/ai-sdk-adapter.test.ts \
  server/src/__tests__/ai-sdk-inbox.test.ts \
  server/src/__tests__/heartbeat-ai-sdk.test.ts \
  server/src/__tests__/ai-connections.test.ts \
  server/src/__tests__/ai-provider-routing.test.ts \
  server/src/services/ai-sdk-configuration.test.ts \
  packages/adapters/ai-sdk/src/server

pnpm exec vitest run \
  ui/src/i18n \
  ui/src/pages/NewAgent.ai-sdk.test.tsx \
  ui/src/components/AgentConfigForm.render.test.tsx \
  ui/src/components/OnboardingWizard.test.tsx \
  ui/src/components/ai-connections/AiProviderSetup.test.tsx

pnpm -r typecheck
pnpm test:run
NODE_USE_ENV_PROXY=1 pnpm build
pnpm check:token-gates
node scripts/check-maps.mjs
node scripts/check-app-brand-assets.mjs
node scripts/release-package-map.mjs check
```

6. 需要页面验证时，使用 `verify-paperclip` 的隔离启动方式，重新用空数据/证据目录启动。当前验证服务和嵌入式数据库已按用户暂停要求停止；原始业务数据没有改动。保留的测试组织叫“模型平台验证”，未创建真实付费模型 Agent。
7. 用户在界面填写 Key 后，验证连接、模型请求、含工具的真实任务、后续上下文和 Stop；在此之前只声明受控上游验证。
8. 若后续需要 PR，读取完整 PR 模板，并按仓库要求拆分评审范围。当前改动文件较多，不能未经核对直接宣称 PR-ready；本次不创建 PR、不合并、不部署。

## 6. 关键文件索引

- 运行时：`packages/adapters/ai-sdk/src/server/{config,model,execute,session,paperclip-tools,instructions,test}.ts`
- 安全 transport：`server/src/services/ai-sdk-fetch.ts`；复用 `remote-http-fetch.ts` / `remote-http-endpoint-guard.ts`
- 权威账户投影：`server/src/services/{ai-connections,ai-connection-runtime,ai-provider-routing,ai-sdk-configuration}.ts`
- 生命周期准入：`server/src/services/heartbeat/execution-configuration.ts`；`server/src/routes/agents.ts`
- 契约：`packages/shared/src/{ai-connections,ai-provider-routing,ai-vendor-presets}.ts`
- 平台 UI：`ui/src/components/ai-connections/{AiSdkConnectionField,AiProviderSetup,AiConnectionField}.tsx`
- 入口：`NewAgentSetup.tsx`、`AgentConfigForm.tsx`、`OnboardingWizard.tsx`
- 国际化：`ui/src/i18n/`、`ui/src/context/LanguagePreferenceContext.tsx`、`LanguageSelect.tsx`
- API 平台文档：`doc/connections/AI-CONNECTIONS.md`

参考官方交互：[DeepSeek Harness providers](https://deepseek-harness.github.io/deepseek-harness/guide/providers)。Harness 仅为交互参考，运行依赖仍是 Vercel AI SDK。


## 7. 接续记录（2026-10-20）

### 两项 P1 已修复

- **P1-A**：只有缺少运行认证才禁用整个业务工具集。无 taskId 的手动/周期唤醒仍有受限 `paperclip_api_request`，固定四个任务工具仅在有 taskId 时提供。新增 `ai-sdk-inbox.test.ts` 的真实 SDK/本机 HTTP 两轮回归共 **11 项通过**，检查实际 inbox 请求、Bearer/run ID、第二轮模型请求中的结果、越权路径和凭据隔离。
- **P1-B**：工具调用先转入被跟踪的 Promise，统一捕获同步 throw 和异步 reject。普通异常只向 SDK 返回固定安全消息，不保留原始 cause/data；已取消时抛回 signal 原因，等 owned 工具请求收尾。新增真实 MCP JSON-RPC 错误、同步工具异常和 MCP 请求取消回归共 **3 项通过**，检查 provider HTTP 请求、运行日志和保存会话。两条泄漏回归在修复前实际发现第二轮 HTTP 请求包含 fixture token，修复后通过；取消用例修复前后均通过。
- 保留原有公司/资源授权、路径限制、API 账户/模型选择和中英文交互，没有重新设计方案。

### 本次最终验证

完整测试使用仓库已有的 `pnpm test:run -- --mode/--group/--shard-index/--shard-count` 分组和分片执行，并对失败组完成同范围复验。**这是完整正式清单的分组执行，不是一次无参数 `pnpm test:run` 成功的声明。** 原始失败和中断记录保留，只有最终完整成功的命令进入资格汇总。

最终 11 个命令全部退出 0，覆盖并集核对通过：**2,384 个测试文件中 2,376 个通过、8 个条件跳过；40,083 条测试通过、154 条条件跳过，最终无失败。** 跳过项与未执行的平台联调见下文，均不计为通过。

| 检查 | 本次结果 |
| --- | --- |
| `pnpm -r typecheck` | 通过；最后的 CLI 测试收尾微调后另跑 `pnpm --filter paperclipai typecheck`，也通过 |
| `NODE_USE_ENV_PROXY=1 pnpm build` | 通过，包含本次生产代码修复；之后仅修改测试 fixture 和文档 |
| `pnpm check:token-gates` | 通过 |
| `node scripts/check-maps.mjs` | 通过，34 areas / 175 capability IDs；仅证明结构一致 |
| `node scripts/check-app-brand-assets.mjs` | 通过，105 brand identities |
| `node scripts/release-package-map.mjs check` | 通过，31 enabled / 4 disabled pending bootstrap |
| `git diff --check` | 通过 |
| 真实平台联调 | **未执行**；用户稍后在界面填写真实 Key |

每行测试命令均以 `pnpm test:run --` 开头。`shard 0/2` 表示 `--shard-index 0 --shard-count 2`；表内数字为通过/条件跳过的测试项数，重试不重复累计。

| mode / group / shard | 最终记录 | 通过 / 条件跳过 | 退出码 |
| --- | --- | --- | --- |
| general / general-server-without-chat-or-native-runner / 0/2 | `server-0-retry` | 10,367 / 40 | 0 |
| general / general-server-without-chat-or-native-runner / 1/2 | `server-1-retry-2` | 10,443 / 77 | 0 |
| general / general-chat / 0/2 | `chat-0` | 629 / 0 | 0 |
| general / general-chat / 1/2 | `chat-1` | 733 / 0 | 0 |
| serialized / 0/2 | `serialized-0` | 1,856 / 0 | 0 |
| serialized / 1/2 | `serialized-1` | 1,514 / 0 | 0 |
| general / general-server-native-runner | `native-retry` | 77 / 9 | 0 |
| general / general-workspaces-a / 0/2 | `workspaces-a-final-0` | 4,199 / 0 | 0 |
| general / general-workspaces-a / 1/2 | `workspaces-a-final-1` | 5,010 / 0 | 0 |
| general / general-workspaces-b | `workspaces-b` | 5,055 / 28 | 0 |
| general / general-workspaces-c | `workspaces-c` | 200 / 0 | 0 |

正式清单包含 **1,026 个 general server 文件、161 个 serialized 文件、21 个 workspace 项目**。两组 server 和 serialized 的实际 profile 文件集合已逐项比对清单，互不重叠且完整；chat 的四个实际测试身份集合互斥，合计覆盖全部 1,362 项，按分区被过滤的用例不误算为条件跳过。最终 workspace A 两片全部通过，实际文件并集覆盖 763 UI + 65 CLI 文件，合计 9,209 项测试通过。native 复验未开启 profile，证据为正式固定三文件组、完整成功命令和终端三文件通过汇总，不能宣称它有逐文件 profile。

### 全量测试暴露并修复的 fixture 问题

以下变更都限定在测试，没有放宽生产权限、脱敏、网络防护或测试断言：

- `heartbeat-ai-sdk.test.ts` 旧 fixture 把 `PAPERCLIP_API_URL` 明确设为空字符串。P1-A 开放无任务工具后会验证该非法 URL；改为未设置覆盖值，保留正常派生地址。首轮组合为 212 通过/2 失败，修复后该文件 2/2 通过，完整矩阵也覆盖。
- 招募、连接路由、heartbeat 配置/恢复、旧凭据兼容 fixture 的默认 cwd 会读取开发机上层 CLI 认证配置。先复现认证冲突，再使用既有隔离 home 或该 Agent 的测试工作目录；显式 cwd 场景不变。定向结果分别为 70/70、30/30、22/22、6/6、8/8，随后对应完整组通过，恢复文件整体 407/407 通过。
- `server/src/adapters/registry.test.ts` 预期清单遗漏 `ai_sdk → native_mcp`，只补静态清单，52/52 通过。
- `workspace-preparation.test.ts` 的示例 HTTPS origin 实际触发公网 fetch。Git trace 证明单次等待 15.157 秒并触发 15 秒测试期限；仅在此 fixture 的源仓库和克隆仓库配置 `protocol.https.allow=never`，继续验证 origin 身份和真实本地 Git 隔离。9 参数及全文件 43/43 通过；绿 trace 六次 fetch 最慢 2.266 毫秒，无 HTTPS helper，生产代码和 timeout 未改。
- `OnboardingWizard.step.test.tsx` 旧 helper 按位置点击首个来源，新增 API 模型入口后不再走已配置的 Claude 路径。改为按 Claude 语义选择，13/13 通过；产品 UI 未改。
- CLI 导入/导出 E2E 的 537 条 CLI 功能断言通过后，收尾仍报 `ENOTEMPTY`，因此当次完整 A 命令仍记失败。直接根因是 native bundle 目录权限 `0555`；先补进程树/stdio/API/数据库端口关闭断言仍失败，确认并非已证明的活跃写入竞争。最终仅对确认 inode/dev 身份的本 fixture 临时树，以不跟随符号链接的目录句柄恢复写权限，再单次删除并断言目录稳定消失；没有使用删除重试隐藏失败。独立真实 CLI E2E 1/1 和全部收尾断言通过。Windows 软停止失败会进入有界强停止回退，但该平台分支未在 macOS 上运行。

### 失败和中断的证据边界

- 最初沙箱内 HTTP 监听和 tsx IPC 因 `EPERM` 无法运行；本机权限可用后重跑，原记录不算通过。
- 初始高并发矩阵因临时 PostgreSQL 数据写入 `ENOSPC` 失败并停止。只清理核对归属且已停止的测试数据，保留原日志；降低并发后重跑完整正式组。中止的 server-1 旧尝试同样没有进入最终通过统计。
- native 首轮 75 通过/2 失败/9 跳过，原因是验证器环境值被安全诊断登记为秘密：短 profile job 值 `native` 改写错误码，`CARGO_BUILD_JOBS=2` / `NODE_USE_ENV_PROXY=1` 改写数字。实际函数合成环境证明和去除这些编排值后的定向 2/2 均留档；生产安全逻辑未改，完整 native 组隔离复验为 77 通过/9 条件跳过。
- 使用代理的构建和其他需要网络的命令设置 `NODE_USE_ENV_PROXY=1`；native 复验不需要该网络覆盖，避免验证元数据干扰脱敏断言。

### 未执行项与后续限制

既有 **154 条条件跳过项**没有计为通过，其中以下八个文件整体跳过：

| 文件 | 本机未执行的条件 |
| --- | --- |
| `server/src/__tests__/run-failure-sentry-real-sdk.test.ts` | 未安装可选 `@sentry/node` peer |
| `server/src/__tests__/workspace-runtime-https-live-exercise.test.ts` | 需显式 live broker 开关和真实 Tailscale broker socket |
| `server/src/services/native-runtime/native-workspace-export-resume.live.test.ts` | 需 live 开关、Daytona 凭据和固定 sandbox image |
| `server/src/services/native-runtime/paperclip-runner-real-server.integration.test.ts` | 收集时缺少所需的 debug fake-codex-app-server fixture binary |
| `server/src/services/native-runtime/native-warm-transition-restart.integration.test.ts` | 需捕获的私有 Runner transition fixture 和显式迁移后的独立数据库 |
| `server/src/__tests__/customer-success-cloud.test.ts` | 需外部 Cloud inspection distribution |
| `packages/adapters/claude-local/src/server/setup-token-characterization.test.ts` | 未启用 Claude setup-token characterization 开关 |
| `packages/plugins/sandbox-providers/daytona/src/duplex-command-stream.live.test.ts` | 缺少真实 Daytona API Key |

其余为套件内条件跳过，例如远程容器/运行环境场景；正式命令成功不等于这些路径已执行。真实 DeepSeek/其他平台连通、付费模型任务和实际账户权限仍未验证；用户在界面填写 Key 后，应完成连接测试、含工具真实任务、上下文续接和 Stop。专门页面的剩余中英文翻译仍按原设计 P2，不属于两个 P1 的修复范围。本轮没有重新启动浏览器验收，沿用第 4 节的历史页面证据，本次新增证据为 SDK/HTTP、完整本地测试和实际 CLI E2E。

### 本机证据

`tmp-platform-resume-verification/` 被 Git 忽略，不随 push；没有真实凭据，也没有伪称已上传附件。主要证据：

- `p1b-red-local-http.log` / `p1b-green.log`、`targeted-runtime.log` / `heartbeat-fixture-rerun.log`。
- `typecheck-final.log` / `cli-typecheck-final.log` / `build.log` / `token-gates-final.log`。
- `cli-company-teardown-baseline.log`、中间失败的 `cli-company-teardown-green.log` 和最终通过的 `cli-company-teardown-final.log`；文件名含 green 不代表那次执行成功。
- `full-matrix/` 保留磁盘耗尽中断；`full-matrix-serial/` 保留每组 `result.json`、`output.log`、可用的 `profile/*.ndjson` 和原始非全绿 `results.json`。
- 最终完整并集和被选用的成功复验单独保存在 `final-qualification.json`，不会覆盖原始失败结果。远端接续时需自行重跑，不能把本机路径当作可下载附件。
