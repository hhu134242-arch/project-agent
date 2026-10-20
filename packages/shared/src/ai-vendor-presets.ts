import type { AiProviderRouting } from "./ai-provider-routing.js";

export type AiVendorPresetId =
  | "deepseek"
  | "qwen"
  | "moonshot"
  | "zhipu"
  | "doubao"
  | "siliconflow"
  | "minimax"
  | "baichuan"
  | "stepfun"
  | "lingyiwanwu"
  | "hunyuan"
  | "qianfan"
  | "spark";

export type AiVendorPresetModel = { id: string; label: string };

export type AiVendorPresetDefinition = {
  id: AiVendorPresetId;
  /** English catalog / connection display name */
  name: string;
  description: string;
  baseUrl: string;
  urlPattern: string;
  docsUrl: string;
  keysUrl: string;
  models: readonly AiVendorPresetModel[];
  apiKeyPlaceholder: string;
  guidanceMd: string;
};

export const AI_VENDOR_PRESET_IDS = [
  "deepseek",
  "qwen",
  "moonshot",
  "zhipu",
  "doubao",
  "siliconflow",
  "minimax",
  "baichuan",
  "stepfun",
  "lingyiwanwu",
  "hunyuan",
  "qianfan",
  "spark",
] as const satisfies readonly AiVendorPresetId[];

/** Presets exposed in the AI SDK platform picker (gateway + static model table). */
export const AI_SDK_VENDOR_PRESET_IDS = AI_VENDOR_PRESET_IDS;

export const AI_VENDOR_PRESETS: Record<AiVendorPresetId, AiVendorPresetDefinition> = {
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    description: "Use DeepSeek models with an API key through Vercel AI SDK.",
    baseUrl: "https://api.deepseek.com",
    urlPattern: "https://api.deepseek.com/*",
    docsUrl: "https://api-docs.deepseek.com/",
    keysUrl: "https://platform.deepseek.com/api_keys",
    models: [
      { id: "deepseek-flash", label: "DeepSeek Flash" },
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
    ],
    apiKeyPlaceholder: "Enter DeepSeek API key",
    guidanceMd:
      "Create an API key in the DeepSeek console. Choose a model and run the agent test to verify access. Keys are stored in the encrypted credential vault.",
  },
  qwen: {
    id: "qwen",
    name: "Qwen (DashScope)",
    description: "Alibaba Cloud DashScope OpenAI-compatible API for Qwen models.",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    urlPattern: "https://dashscope.aliyuncs.com/*",
    docsUrl: "https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope",
    keysUrl: "https://bailian.console.aliyun.com/?apiKey=1",
    models: [
      { id: "qwen-max", label: "Qwen Max" },
      { id: "qwen-plus", label: "Qwen Plus" },
      { id: "qwen-turbo", label: "Qwen Turbo" },
      { id: "qwen-long", label: "Qwen Long" },
    ],
    apiKeyPlaceholder: "Enter DashScope API key",
    guidanceMd:
      "Create a DashScope API key in the Alibaba Cloud Model Studio console. Use the compatible-mode endpoint and pick a Qwen model ID from the official model list.",
  },
  moonshot: {
    id: "moonshot",
    name: "Moonshot (Kimi)",
    description: "Moonshot AI Kimi models via the OpenAI-compatible API.",
    baseUrl: "https://api.moonshot.cn/v1",
    urlPattern: "https://api.moonshot.cn/*",
    docsUrl: "https://platform.moonshot.cn/docs/api/chat",
    keysUrl: "https://platform.moonshot.cn/console/api-keys",
    models: [
      { id: "kimi-k2.5", label: "Kimi K2.5" },
      { id: "kimi-k3", label: "Kimi K3" },
    ],
    apiKeyPlaceholder: "Enter Moonshot API key",
    guidanceMd:
      "Create an API key in the Moonshot console. Model names must match the official Kimi model list.",
  },
  zhipu: {
    id: "zhipu",
    name: "Zhipu GLM",
    description: "Zhipu GLM models through the OpenAI-compatible BigModel API.",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    urlPattern: "https://open.bigmodel.cn/*",
    docsUrl: "https://docs.bigmodel.cn/cn/guide/develop/openai/introduction",
    keysUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    models: [
      { id: "glm-5.3", label: "GLM-5.3" },
      { id: "glm-5.2", label: "GLM-5.2" },
      { id: "glm-4.7", label: "GLM-4.7" },
    ],
    apiKeyPlaceholder: "Enter Zhipu API key",
    guidanceMd:
      "Create an API key on the Zhipu open platform. Use the documented OpenAI-compatible base URL and GLM model IDs.",
  },
  doubao: {
    id: "doubao",
    name: "Doubao (Volcengine Ark)",
    description: "ByteDance Volcengine Ark OpenAI-compatible chat API.",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    urlPattern: "https://ark.cn-beijing.volces.com/*",
    docsUrl: "https://www.volcengine.com/docs/82379/1330310",
    keysUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
    models: [
      { id: "doubao-seed-2-1-pro-260915", label: "Doubao Seed 2.1 Pro" },
      { id: "doubao-seed-2-0-lite-260428", label: "Doubao Seed 2.0 Lite" },
    ],
    apiKeyPlaceholder: "Enter Ark API key",
    guidanceMd:
      "Enable model access in Volcengine Ark and create an API key. Use the Model ID from the Ark console with the v3 OpenAI-compatible endpoint.",
  },
  siliconflow: {
    id: "siliconflow",
    name: "SiliconFlow",
    description: "SiliconFlow hosted models via the OpenAI-compatible API.",
    baseUrl: "https://api.siliconflow.cn/v1",
    urlPattern: "https://api.siliconflow.cn/*",
    docsUrl: "https://docs.siliconflow.cn/cn/userguide/quickstart",
    keysUrl: "https://cloud.siliconflow.cn/account/ak",
    models: [
      { id: "deepseek-ai/DeepSeek-V3.2", label: "DeepSeek V3.2" },
      { id: "Qwen/Qwen3.5-122B-A10B", label: "Qwen3.5 122B A10B" },
      { id: "moonshotai/Kimi-K2-Instruct", label: "Kimi K2 Instruct" },
    ],
    apiKeyPlaceholder: "Enter SiliconFlow API key",
    guidanceMd:
      "Create an API key on SiliconFlow. Copy the full model name from the model marketplace (provider/model format).",
  },
  minimax: {
    id: "minimax",
    name: "MiniMax",
    description: "MiniMax language models via the OpenAI-compatible API.",
    baseUrl: "https://api.minimax.cn/v1",
    urlPattern: "https://api.minimax.cn/*",
    docsUrl: "https://platform.minimaxi.com/docs/guides/quickstart-preparation",
    keysUrl: "https://platform.minimaxi.com/user-center/basic-information/interface-key",
    models: [
      { id: "MiniMax-M3.1-Flash", label: "MiniMax M3.1 Flash" },
      { id: "MiniMax-M3", label: "MiniMax M3" },
    ],
    apiKeyPlaceholder: "Enter MiniMax API key",
    guidanceMd:
      "Create an API key in the MiniMax console. Use the China-region OpenAI-compatible endpoint and supported model names from the docs.",
  },
  baichuan: {
    id: "baichuan",
    name: "Baichuan",
    description: "Baichuan models via the OpenAI-compatible chat API.",
    baseUrl: "https://api.baichuan-ai.com/v1",
    urlPattern: "https://api.baichuan-ai.com/*",
    docsUrl: "https://platform.baichuan-ai.com/docs-v2/api",
    keysUrl: "https://platform.baichuan-ai.com/console/apikey",
    models: [
      { id: "Baichuan4-Turbo", label: "Baichuan4 Turbo" },
      { id: "Baichuan4-Air", label: "Baichuan4 Air" },
      { id: "Baichuan4", label: "Baichuan4" },
    ],
    apiKeyPlaceholder: "Enter Baichuan API key",
    guidanceMd:
      "Register on the Baichuan platform, create an API key, and use the documented chat completions model names.",
  },
  stepfun: {
    id: "stepfun",
    name: "StepFun",
    description: "StepFun (阶跃星辰) models via the OpenAI-compatible API.",
    baseUrl: "https://api.stepfun.com/v1",
    urlPattern: "https://api.stepfun.com/*",
    docsUrl: "https://platform.stepfun.com/docs/zh/guides/developer/openai",
    keysUrl: "https://platform.stepfun.com/",
    models: [
      { id: "step-5-preview", label: "Step 5 Preview" },
      { id: "step-3.7-flash", label: "Step 3.7 Flash" },
      { id: "step-3.5-flash", label: "Step 3.5 Flash" },
    ],
    apiKeyPlaceholder: "Enter StepFun API key",
    guidanceMd:
      "Create an API key on the StepFun platform. Use the official Step model IDs with the OpenAI-compatible endpoint.",
  },
  lingyiwanwu: {
    id: "lingyiwanwu",
    name: "01.AI (Yi)",
    description: "01.AI Yi models via the Lingyiwanwu OpenAI-compatible API.",
    baseUrl: "https://api.lingyiwanwu.com/v1",
    urlPattern: "https://api.lingyiwanwu.com/*",
    docsUrl: "https://platform.lingyiwanwu.com/docs",
    keysUrl: "https://platform.lingyiwanwu.com/",
    models: [
      { id: "yi-lightning", label: "Yi Lightning" },
      { id: "yi-large", label: "Yi Large" },
      { id: "yi-medium", label: "Yi Medium" },
    ],
    apiKeyPlaceholder: "Enter 01.AI API key",
    guidanceMd:
      "Apply for API access on the Lingyiwanwu platform and use the documented Yi model IDs.",
  },
  hunyuan: {
    id: "hunyuan",
    name: "Tencent Hunyuan",
    description: "Tencent Hunyuan models via the OpenAI-compatible API.",
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    urlPattern: "https://api.hunyuan.cloud.tencent.com/*",
    docsUrl: "https://cloud.tencent.com/document/product/1729/111007",
    keysUrl: "https://console.cloud.tencent.com/hunyuan/api-key",
    models: [
      { id: "hunyuan-turbos-latest", label: "Hunyuan TurboS Latest" },
      { id: "hunyuan-turbo", label: "Hunyuan Turbo" },
      { id: "hunyuan-pro", label: "Hunyuan Pro" },
    ],
    apiKeyPlaceholder: "Enter Hunyuan API key",
    guidanceMd:
      "Create a Hunyuan API key in the Tencent Cloud console. Use the OpenAI-compatible base URL and Hunyuan model names from the product docs.",
  },
  qianfan: {
    id: "qianfan",
    name: "Baidu Qianfan",
    description: "Baidu Qianfan ERNIE models via the OpenAI-compatible v2 API.",
    baseUrl: "https://qianfan.baidubce.com/v2",
    urlPattern: "https://qianfan.baidubce.com/*",
    docsUrl: "https://cloud.baidu.com/doc/qianfan/s/Hmh4suq26",
    keysUrl: "https://console.bce.baidu.com/iam/#/iam/apikey/list",
    models: [
      { id: "ernie-4.0-turbo-8k", label: "ERNIE 4.0 Turbo 8K" },
      { id: "ernie-4.0-8k", label: "ERNIE 4.0 8K" },
      { id: "ernie-3.5-8k", label: "ERNIE 3.5 8K" },
    ],
    apiKeyPlaceholder: "Enter Qianfan API key",
    guidanceMd:
      "Create a Qianfan API key (Bearer bce-v3/… token). Optional appid headers are not required for basic chat calls.",
  },
  spark: {
    id: "spark",
    name: "iFlytek Spark",
    description: "iFlytek Spark cognitive models via the OpenAI-compatible HTTP API.",
    baseUrl: "https://spark-api-open.xf-yun.com/v1",
    urlPattern: "https://spark-api-open.xf-yun.com/*",
    docsUrl: "https://www.xfyun.cn/doc/spark/HTTP%E8%B0%83%E7%94%A8%E6%96%87%E6%A1%A3.html",
    keysUrl: "https://console.xfyun.cn/services/cbm",
    models: [
      { id: "4.0Ultra", label: "Spark 4.0 Ultra" },
      { id: "generalv3.5", label: "Spark Max (generalv3.5)" },
      { id: "max-32k", label: "Spark Max 32K" },
      { id: "lite", label: "Spark Lite" },
    ],
    apiKeyPlaceholder: "Enter Spark APIPassword",
    guidanceMd:
      "Create an HTTP APIPassword for your Spark version in the iFlytek console. Use Bearer authentication with the OpenAI-compatible endpoint.",
  },
};

export const DEEPSEEK_BASE_URL = AI_VENDOR_PRESETS.deepseek.baseUrl;
export const DEEPSEEK_MODELS = AI_VENDOR_PRESETS.deepseek.models;

function normalizeGatewayBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

export function isAiVendorPresetId(value: string): value is AiVendorPresetId {
  return (AI_VENDOR_PRESET_IDS as readonly string[]).includes(value);
}

export function getAiVendorPreset(id: AiVendorPresetId): AiVendorPresetDefinition {
  return AI_VENDOR_PRESETS[id];
}

export function vendorPresetModels(id: AiVendorPresetId): readonly AiVendorPresetModel[] {
  return AI_VENDOR_PRESETS[id].models;
}

export function isVendorPresetRouting(
  presetId: AiVendorPresetId,
  route: Pick<AiProviderRouting, "kind" | "protocol"> & Partial<AiProviderRouting>,
): boolean {
  const preset = AI_VENDOR_PRESETS[presetId];
  return route.kind === "gateway"
    && route.protocol === "chat"
    && route.auth === "bearer"
    && normalizeGatewayBaseUrl(route.baseUrl ?? "") === normalizeGatewayBaseUrl(preset.baseUrl);
}

export function vendorPresetRouting(presetId: AiVendorPresetId): AiProviderRouting {
  const preset = AI_VENDOR_PRESETS[presetId];
  return {
    kind: "gateway",
    protocol: "chat",
    auth: "bearer",
    baseUrl: preset.baseUrl,
    models: preset.models.map(model => ({ ...model })),
  };
}

export function isDeepSeekRouting(
  route: Pick<AiProviderRouting, "kind" | "protocol"> & Partial<AiProviderRouting>,
): boolean {
  return isVendorPresetRouting("deepseek", route);
}

export function deepSeekRouting(): AiProviderRouting {
  return vendorPresetRouting("deepseek");
}

export function resolveVendorPresetFromRouting(
  route: Pick<AiProviderRouting, "kind" | "protocol"> & Partial<AiProviderRouting>,
  vendorPresetId?: AiVendorPresetId,
): AiVendorPresetId | undefined {
  if (vendorPresetId && isVendorPresetRouting(vendorPresetId, route)) return vendorPresetId;
  for (const id of AI_VENDOR_PRESET_IDS) {
    if (isVendorPresetRouting(id, route)) return id;
  }
  return undefined;
}
