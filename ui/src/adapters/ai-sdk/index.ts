import type { UIAdapterModule } from "../types";
import { buildAiSdkConfig, parseAiSdkStdoutLine } from "@paperclipai/adapter-ai-sdk/ui";
import { AiSdkConfigFields } from "./config-fields";

export const aiSdkUIAdapter: UIAdapterModule = {
  type: "ai_sdk",
  label: "API model",
  parseStdoutLine: parseAiSdkStdoutLine,
  ConfigFields: AiSdkConfigFields,
  buildAdapterConfig: buildAiSdkConfig,
};
