export const type = "ai_sdk";
export const label = "API Agent";
// The selected API connection owns its model catalog. A global provider-specific
// fallback would offer the wrong IDs after switching platforms.
export const models: Array<{ id: string; label: string }> = [];
export const agentConfigurationDoc = `# ai_sdk agent configuration

Adapter: ai_sdk. Vercel AI SDK executes an API-backed tool loop using a managed API platform connection.

Use when:
- The task can be completed through authorized Paperclip company/resource APIs, current-task tools and the run's assigned MCP connections.
- You want to select DeepSeek, OpenAI, Anthropic, OpenRouter or a compatible remote HTTPS API model without installing a coding CLI.

Do not use when:
- The task requires shell commands, local file editing, or arbitrary filesystem access.
- The selected execution environment is SSH, a sandbox, or requires process isolation. This adapter executes on the Paperclip server.

Configuration:
- runtimeConfig.aiConnection: select an authorized managed API connection in Paperclip using its connectionId/grantId; do not store API keys in adapter config.
- model: exact model ID for the selected platform, required. The adapter never rewrites the ID or substitutes another model.
- instructionsFilePath: server-resolved absolute instructions file; loaded with bounded reads. Assigned skills can be read on demand through paperclip_read_skill, limited to their authorized source directories.
- promptTemplate: optional instructions; supports agent.id, agent.name, companyId, runId and context.taskId. Secrets and arbitrary runtime context are not template inputs.
- maxSteps: integer 1–50, default 20. Stops the tool loop after this many model calls.
- timeoutSec: integer 1–3600, default 300. Cancels model and tool requests when reached.

Connection routing is injected by the server. Native platforms use official HTTPS endpoints; custom remote HTTPS connections support Chat Completions, Responses and Anthropic Messages. Custom connections require the server's DNS-pinned outbound transport, which rejects private and reserved destinations and redirects. Local endpoints, SSH, sandboxes and low-trust execution are unsupported.
Switching platform, protocol, endpoint, model, credential, task, company, agent or workspace starts a fresh bounded conversation. Interrupted requests are not automatically replayed.
Token usage is recorded per model step. Monetary cost is unpriced unless independently supplied by the server's pricing system.
`;
