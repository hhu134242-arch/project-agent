import { createHash } from "node:crypto";
import type { AdapterExecutionContext, AdapterSessionCodec } from "@paperclipai/adapter-utils";
import type { ModelMessage } from "ai";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import type { ResolvedConfig } from "./config.js";

const MAX_MESSAGES = 80;
const MAX_SESSION_BYTES = 256_000;
export function sessionIdentity(ctx: AdapterExecutionContext, config: ResolvedConfig): string {
  const workspace = parseObject(ctx.context.paperclipWorkspace);
  return createHash("sha256").update(JSON.stringify([
    ctx.agent.companyId, ctx.agent.id, ctx.runtime.taskKey, ctx.context.taskId ?? ctx.context.issueId,
    config.connectionIdentity, config.platform, config.protocol, config.auth, config.model, config.baseURL,
    createHash("sha256").update(config.apiKey).digest("hex"),
    ctx.config.cwd ?? null, workspace.cwd ?? null, workspace.id ?? null,
    ctx.context.executionWorkspaceId ?? null, ctx.context.projectWorkspaceId ?? null,
  ])).digest("hex");
}
export function boundedMessages(messages: ModelMessage[]): ModelMessage[] | null {
  let result = [...messages];
  // Drop entire older user turns so tool results never lose their tool-call partners.
  while (result.length > MAX_MESSAGES || JSON.stringify(result).length > MAX_SESSION_BYTES) {
    const nextUser = result.findIndex((message, i) => i > 0 && message.role === "user");
    if (nextUser < 0) return null;
    result = result.slice(nextUser);
  }
  return result;
}
function decode(raw: unknown): Record<string, unknown> | null {
  const value = parseObject(raw);
  if (value.version !== 1 || !/^[a-f0-9]{64}$/.test(asString(value.identity, "")) || !asString(value.sessionId, "") || !Array.isArray(value.messages)) return null;
  if (value.messages.length > MAX_MESSAGES || JSON.stringify(value).length > MAX_SESSION_BYTES + 1_000) return null;
  if (!value.messages.every((message) => {
    const item = parseObject(message);
    return ["user", "assistant", "tool"].includes(asString(item.role, "")) && (typeof item.content === "string" || Array.isArray(item.content));
  })) return null;
  return { version: 1, identity: value.identity, sessionId: value.sessionId, messages: value.messages };
}
export const sessionCodec: AdapterSessionCodec = {
  deserialize: decode,
  serialize: decode,
  getDisplayId: (value) => asString(value?.sessionId, "") || null,
};
