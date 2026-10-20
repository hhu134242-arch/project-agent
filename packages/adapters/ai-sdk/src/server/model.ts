import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { isOpenRouterUrl, OPENROUTER_ATTRIBUTION_HEADERS } from "@paperclipai/shared/openrouter-attribution";
import { AiSdkConfigurationError, type ResolvedConfig } from "./config.js";

/** Host-owned transport injection. This object must never come from adapter JSON. */
export interface AiSdkDependencies {
  /** Resolves public addresses, pins the socket and rejects redirects. No private-network override. */
  customEndpointFetch?: typeof fetch;
}

/**
 * Provider defaults can consult process.env. Supply every URL and credential
 * explicitly, and strip credentials for anonymous endpoints at the transport.
 */
export function createModel(config: ResolvedConfig, signal: AbortSignal, dependencies: AiSdkDependencies = {}): Extract<LanguageModel, { specificationVersion: "v4" }> {
  if (config.platform === "gateway" && !dependencies.customEndpointFetch) {
    throw new AiSdkConfigurationError("Custom API connections require the server's protected outbound transport.");
  }
  const endpoint = `${config.baseURL}/${config.protocol === "chat" ? "chat/completions" : config.protocol}`;
  const guardedFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.href !== endpoint) throw new AiSdkConfigurationError("The model requested a URL outside the selected API endpoint.");
    const headers = new Headers(init?.headers);
    if (config.auth === "none") {
      headers.delete("authorization");
      headers.delete("x-api-key");
    }
    if (isOpenRouterUrl(url.href)) {
      for (const [name, value] of Object.entries(OPENROUTER_ATTRIBUTION_HEADERS)) headers.set(name, value);
    }
    const transport = config.platform === "gateway" ? dependencies.customEndpointFetch! : globalThis.fetch;
    const response = await transport(input, { ...init, headers, signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal, redirect: "error" });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new AiSdkConfigurationError("API connection redirects are not supported. Configure the final HTTPS API address.");
    }
    return response;
  };
  // An explicit empty string prevents SDK fallback to host credentials; the
  // transport removes the resulting empty auth header when auth is "none".
  const credential = config.auth === "none" ? "" : config.apiKey;
  const common = { baseURL: config.baseURL, fetch: guardedFetch };
  if (config.platform === "deepseek") return createDeepSeek({ ...common, apiKey: credential })(config.model);
  if (config.platform === "openrouter" && config.protocol === "chat") {
    return createOpenRouter({ ...common, apiKey: credential, headers: OPENROUTER_ATTRIBUTION_HEADERS }).chat(config.model, { usage: { include: true } });
  }
  if (config.protocol === "messages") {
    return createAnthropic({
      ...common,
      ...(config.auth === "bearer" ? { authToken: credential } : { apiKey: credential }),
    })(config.model);
  }
  const provider = createOpenAI({ ...common, apiKey: credential });
  return config.protocol === "chat" ? provider.chat(config.model) : provider.responses(config.model);
}
