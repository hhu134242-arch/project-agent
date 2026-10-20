import { generateText } from "ai";
import type { AdapterEnvironmentTestContext, AdapterEnvironmentTestResult } from "@paperclipai/adapter-utils";
import { configurationCheck, AiSdkConfigurationError } from "./config.js";
import { createModel, type AiSdkDependencies } from "./model.js";

export async function testEnvironment(ctx: AdapterEnvironmentTestContext, dependencies: AiSdkDependencies = {}): Promise<AdapterEnvironmentTestResult> {
  const result: AdapterEnvironmentTestResult = { adapterType: "ai_sdk", status: "fail", checks: [], testedAt: new Date().toISOString() };
  try {
    const config = configurationCheck(ctx);
    const signal = AbortSignal.timeout(15_000);
    await generateText({ model: createModel(config, signal, dependencies), prompt: "Reply with OK.", maxOutputTokens: 16, maxRetries: 0, abortSignal: signal });
    result.status = "pass";
    result.checks.push({ code: "ai_sdk_model_ready", level: "info", message: "The selected API model responded successfully. This test uses a small billable API request." });
    result.checks.push({ code: "ai_sdk_tools_scope", level: "info", message: "This adapter supports Paperclip task and authorized MCP tools. Shell, local file editing and remote execution are unavailable." });
  } catch (error) {
    result.checks.push({ code: error instanceof AiSdkConfigurationError ? "ai_sdk_configuration" : "ai_sdk_model_probe_failed", level: "error", message: error instanceof AiSdkConfigurationError ? error.message : "The selected API model could not be reached. Check the API key, model access, balance and network." });
  }
  return result;
}
