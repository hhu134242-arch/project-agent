import type { AiRuntimeConnectionBinding } from "@paperclipai/shared";
import { unprocessable } from "../errors.js";

/** Admission checks apply before secrets or provider work, including unsaved tests. */
export function assertAiSdkConfiguration(adapterType: string, config: Record<string, unknown>, binding: AiRuntimeConnectionBinding | undefined) {
  if (adapterType !== "ai_sdk") return;
  if (!binding || binding.mode === "router" || binding.mode === "responsible_user" || !["openai", "anthropic", "openrouter"].includes(binding.provider) || binding.method !== "api_key") {
    throw unprocessable("Select an API platform account for this agent", { code: "ai_sdk_connection_required" });
  }
  if (typeof config.model !== "string" || !config.model || config.model.length > 256 || /\s|[\u0000-\u001f]/u.test(config.model)) {
    throw unprocessable("Enter a model ID from the selected API platform", { code: "ai_sdk_model_required" });
  }
  for (const [key, minimum, maximum] of [["maxSteps", 1, 50], ["timeoutSec", 1, 3600]] as const) {
    const value = config[key];
    if (value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum)) {
      throw unprocessable(`Invalid AI SDK ${key}`, { code: "ai_sdk_invalid_configuration", field: key });
    }
  }
}
