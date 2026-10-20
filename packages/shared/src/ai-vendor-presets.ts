import type { AiProviderRouting } from "./ai-provider-routing.js";

/** Product identity is independent of the legacy wire-format provider enum. */
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_MODELS = [
  { id: "deepseek-flash", label: "DeepSeek Flash" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
] as const;

export type AiVendorPresetId = "deepseek";

export function isDeepSeekRouting(route: Pick<AiProviderRouting, "kind" | "protocol"> & Partial<AiProviderRouting>): boolean {
  return route.kind === "gateway" && route.protocol === "chat" && route.auth === "bearer"
    && (route.baseUrl === DEEPSEEK_BASE_URL || route.baseUrl === `${DEEPSEEK_BASE_URL}/`);
}

export function deepSeekRouting(): AiProviderRouting {
  return {
    kind: "gateway", protocol: "chat", auth: "bearer", baseUrl: DEEPSEEK_BASE_URL,
    models: DEEPSEEK_MODELS.map(model => ({ ...model })),
  };
}
