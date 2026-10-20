# API 平台选择与中英文切换：暂停交接

- 日期：2026-10-20
- 状态：**用户要求暂停开发并提交推送，属于阶段性快照，不是已完成验收的发布版本。**
- 分支：`codex/deepseek-i18n`
- 本轮开发起点：`238b23d41f73e269aa082a17f4fadc8f8d5b9c0e`
- 远端：`git@github.com:hhu134242-arch/project-agent.git`
- 下一位 AI 应先修复下述两个 P1，再继续验证。不要把已有测试通过等同于这些新发现已修复。

## 1. 用户已经确认的方向

1. 系统支持中英文切换。
2. 使用 **Vercel AI SDK** 接入模型，优先支持 DeepSeek。
3. 用户进一步要求采用 **DeepSeek Harness 那种选择 API 平台的交互**。因此产品入口调整为 **API 平台 → API 账户 → 模型**，AI SDK 留在底层，不要求用户理解执行器实现。
4. 当前入口提供 DeepSeek、OpenAI、Anthropic、OpenRouter、自定义兼容 API。
5. 用户明确表示 **API Key 稍后在界面填写**。本轮没有真实 DeepSeek 或其他平台的测试 Key，没有真实付费上游联调结果；不要要求在聊天里粘贴密钥。
6. 最新指令为暂停、写交接、把工作区代码全部 commit/push。没有要求创建 PR、合并或部署。
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

## 3. 暂停时仍未修复的两个 P1

### P1-A：无指定任务的唤醒没有业务工具

文件：`packages/adapters/ai-sdk/src/server/paperclip-tools.ts`，函数 `paperclipTools` 开头。

当前仍为：

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

当前只对成功返回值 `redactValue`，没有 catch 工具抛出的异常。MCP SDK 会原样保留 JSON-RPC `error.message`，AI SDK 会把工具错误文本放进下一轮模型请求。如果远端错误回显了 MCP token，最终日志/session 脱敏已经太晚。

接续修复：

- 捕获同步抛出和异步 reject。
- 普通工具异常改为安全消息，不保留含原始错误的 cause/data。
- 已取消时保留 signal 的取消语义；不得吞取消或提前结束未收尾的 owned tool promise。
- 补真实两轮 SDK/MCP HTTP 测试：MCP `error.message` 故意包含 run-scoped token，断言所有 provider request bodies、日志、持久会话均不含 token。

负责修复的子 Agent 在用户暂停时已中断。暂停后的源文件复查显示上述两处仍是原实现；没有把修复算作完成。继续时先检查实际 HEAD，避免重复或遗漏可能追加的快照内容。

## 4. 验证事实与边界

以下均为本轮实际执行结果；计数有重叠，不能直接相加为唯一测试数。

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

## 5. 接续顺序

1. 阅读根 `AGENTS.md`、核心文档及匹配的 `rules/*.mdc`；用户要求中文 commit。
2. 检查分支、HEAD、工作区。该快照按用户要求提交全部非忽略源文件，不是 merge-ready PR。
3. 安装依赖：`pnpm install --no-frozen-lockfile`。`pnpm-lock.yaml` 由仓库 CI 管理，本轮安装产生的 lock 修改已恢复，没有提交。新适配器依赖以各 package.json 为准。
4. 优先修复第 3 节两项 P1，补针对性实际 SDK/MCP 回归。
5. 重跑最小必要验证，然后完成完整检查；不要把中断的全量测试判为绿。

```sh
pnpm exec vitest run \
  server/src/__tests__/ai-sdk-adapter.test.ts \
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
