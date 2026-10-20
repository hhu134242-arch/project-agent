import type { AdapterExecutionContext, AdapterEnvironmentTestContext } from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { aiProviderRoutingSchema, isAiSdkRoutingCompatible } from "@paperclipai/shared/ai-provider-routing";
import { isDeepSeekRouting } from "@paperclipai/shared/ai-vendor-presets";

export class AiSdkConfigurationError extends Error {}
export type ApiPlatform = "deepseek" | "openai" | "anthropic" | "openrouter" | "gateway";
export type ApiProtocol = "chat" | "responses" | "messages";
export type ResolvedConfig = {
  platform: ApiPlatform;
  protocol: ApiProtocol;
  auth: "bearer" | "api_key" | "none";
  model: string;
  apiKey: string;
  baseURL: string;
  connectionIdentity: string;
  maxSteps: number;
  timeoutSec: number;
};

const NATIVE_PLATFORMS = {
  openai: { protocol: "responses", auth: "bearer", baseURL: "https://api.openai.com/v1" },
  anthropic: { protocol: "messages", auth: "api_key", baseURL: "https://api.anthropic.com/v1" },
  openrouter: { protocol: "chat", auth: "bearer", baseURL: "https://openrouter.ai/api/v1" },
} as const;

export function resolveConfig(ctx: Pick<AdapterExecutionContext, "config" | "executionTarget"> & Partial<Pick<AdapterExecutionContext, "executionTransport">>): ResolvedConfig {
  const config = ctx.config;
  const policy = parseObject(config.executionPolicy);
  if (ctx.executionTarget?.kind === "remote" || ctx.executionTransport?.remoteExecution || config.remoteExecution || config.ssh || config.sandbox || config.managedSandboxOnly === true || policy.managedSandboxOnly === true || config.executionMode === "kubernetes" || policy.executionMode === "kubernetes") {
    throw new AiSdkConfigurationError("AI SDK currently supports only local API/MCP execution; remote and isolated execution environments are unsupported.");
  }
  const managed = parseObject(config.managedAiConnection);
  const apiKey = asString(parseObject(config.env).PAPERCLIP_AI_PROVIDER_KEY, "").trim();
  const connectionIdentity = asString(managed.sessionIdentity, "").trim();
  if (!connectionIdentity) throw new AiSdkConfigurationError("Select an authorized managed API connection.");
  const routeResult = config.managedAiRouting === undefined ? null : aiProviderRoutingSchema.safeParse(config.managedAiRouting);
  if (routeResult && !routeResult.success) throw new AiSdkConfigurationError("The selected API connection routing is invalid.");
  const routing = routeResult?.success ? routeResult.data : undefined;
  if (routing && !isAiSdkRoutingCompatible(routing)) throw new AiSdkConfigurationError("Select a supported public HTTPS API connection.");
  let platform: ApiPlatform;
  let protocol: ApiProtocol;
  let auth: ResolvedConfig["auth"];
  let baseURL: string;
  if (config.managedAiVendor === "deepseek") {
    if (!routing || !isDeepSeekRouting(routing) || (config.managedAiProvider !== undefined && config.managedAiProvider !== "openai")) {
      throw new AiSdkConfigurationError("Select the official DeepSeek Chat Completions connection.");
    }
    platform = "deepseek"; protocol = "chat"; auth = "bearer"; baseURL = "https://api.deepseek.com";
  } else if (routing?.kind === "gateway") {
    if (!["chat", "responses", "messages"].includes(routing.protocol)) throw new AiSdkConfigurationError("Select a supported API protocol.");
    if (config.managedAiProvider !== (routing.protocol === "messages" ? "anthropic" : "openai")) throw new AiSdkConfigurationError("The API provider and protocol do not match.");
    platform = "gateway"; protocol = routing.protocol as ApiProtocol; auth = routing.auth; baseURL = routing.baseUrl ?? "";
  } else if (routing?.kind === "openrouter") {
    if (config.managedAiProvider !== "openrouter" || !["chat", "responses", "messages"].includes(routing.protocol)) throw new AiSdkConfigurationError("Select a supported OpenRouter API connection.");
    platform = "openrouter"; protocol = routing.protocol as ApiProtocol; auth = "bearer"; baseURL = NATIVE_PLATFORMS.openrouter.baseURL;
  } else if (!routing && Object.hasOwn(NATIVE_PLATFORMS, asString(config.managedAiProvider, ""))) {
    platform = config.managedAiProvider as keyof typeof NATIVE_PLATFORMS;
    ({ protocol, auth, baseURL } = NATIVE_PLATFORMS[platform]);
  } else {
    throw new AiSdkConfigurationError("Select a managed DeepSeek, OpenAI, Anthropic, OpenRouter or remote HTTPS API connection.");
  }
  if (auth !== "none" && !apiKey) throw new AiSdkConfigurationError("The selected API connection requires an API key.");
  let url: URL;
  try { url = new URL(baseURL); } catch { throw new AiSdkConfigurationError("The API connection URL is invalid."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new AiSdkConfigurationError("The API connection requires a public HTTPS endpoint without credentials, query parameters or a fragment.");
  }
  const model = asString(config.model, "");
  if (!model || model.length > 256 || /\s|[\u0000-\u001f]/u.test(model)) throw new AiSdkConfigurationError("An exact model ID is required.");
  const maxSteps = config.maxSteps ?? 20;
  const timeoutSec = config.timeoutSec ?? 300;
  if (typeof maxSteps !== "number" || !Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 50) throw new AiSdkConfigurationError("maxSteps must be an integer between 1 and 50.");
  if (typeof timeoutSec !== "number" || !Number.isInteger(timeoutSec) || timeoutSec < 1 || timeoutSec > 3600) throw new AiSdkConfigurationError("timeoutSec must be an integer between 1 and 3600.");
  return { platform, protocol, auth, model, apiKey, baseURL: url.toString().replace(/\/+$/, ""), connectionIdentity, maxSteps, timeoutSec };
}

export function sanitizeOutput(value: unknown, secrets: readonly string[]): string {
  let text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  for (const secret of secrets) if (secret) text = text.replaceAll(secret, "[REDACTED]");
  return text;
}

export function configurationCheck(ctx: AdapterEnvironmentTestContext): ResolvedConfig { return resolveConfig(ctx); }

export function redactValue(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === "string") return sanitizeOutput(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, secrets));
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item, secrets)]));
  return value;
}
