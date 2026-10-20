import {
  AI_SDK_VENDOR_PRESET_IDS,
  AI_VENDOR_PRESETS,
  isAiVendorPresetId,
  vendorPresetModels,
  type AiManagedConnectionSummary,
  type AiVendorPresetId,
} from "@paperclipai/shared";

export const AI_SDK_PLATFORM_IDS = [
  ...AI_SDK_VENDOR_PRESET_IDS,
  "openai",
  "anthropic",
  "openrouter",
  "gateway",
] as const;

export type AiSdkPlatformId = (typeof AI_SDK_PLATFORM_IDS)[number];

export function isAiSdkGatewayVendor(id: string): id is AiVendorPresetId {
  return isAiVendorPresetId(id);
}

export function aiSdkPlatform(connection: AiManagedConnectionSummary): AiSdkPlatformId {
  if (connection.vendorPresetId && isAiVendorPresetId(connection.vendorPresetId)) {
    return connection.vendorPresetId;
  }
  if (connection.routing?.kind === "gateway") return "gateway";
  if (connection.routing?.kind === "openrouter" || connection.provider === "openrouter") return "openrouter";
  return connection.provider === "anthropic" ? "anthropic" : "openai";
}

export function modelsForAiSdkConnection(connection: AiManagedConnectionSummary) {
  if (connection.routing?.models.length) return connection.routing.models;
  if (connection.vendorPresetId && isAiVendorPresetId(connection.vendorPresetId)) {
    return vendorPresetModels(connection.vendorPresetId);
  }
  return [];
}

export function vendorPresetConsoleKeysUrl(id: AiVendorPresetId): string {
  return AI_VENDOR_PRESETS[id].keysUrl;
}
