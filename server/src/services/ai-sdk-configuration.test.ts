import { describe, expect, it } from "vitest";
import { assertAiSdkConfiguration } from "./ai-sdk-configuration.js";

const binding = { mode: "shared", provider: "openai", method: "api_key", connectionId: "connection", grantId: "grant" } as const;
describe("AI SDK configuration admission", () => {
  it("requires an explicit account and exact nonempty model while preserving existing adapters", () => {
    expect(() => assertAiSdkConfiguration("ai_sdk", { model: "deepseek-flash" }, undefined)).toThrow("Select an API platform account");
    expect(() => assertAiSdkConfiguration("ai_sdk", { model: "deepseek-flash" }, { mode: "responsible_user", provider: "openai", method: "api_key" })).toThrow();
    for (const model of ["", " ", "model ", undefined]) expect(() => assertAiSdkConfiguration("ai_sdk", { model }, binding)).toThrow("model ID");
    expect(() => assertAiSdkConfiguration("ai_sdk", { model: "future-deepseek-model" }, binding)).not.toThrow();
    for (const provider of ["openai", "anthropic", "openrouter"] as const) expect(() => assertAiSdkConfiguration("ai_sdk", { model: "exact-model" }, { ...binding, provider })).not.toThrow();
    for (const provider of ["google", "xai"] as const) expect(() => assertAiSdkConfiguration("ai_sdk", { model: "exact-model" }, { ...binding, provider })).toThrow();
    expect(() => assertAiSdkConfiguration("codex_local", {}, undefined)).not.toThrow();
  });
  it("bounds execution step and time settings before any provider requests", () => {
    for (const value of [0, -1, 101, 1.5, "10"]) expect(() => assertAiSdkConfiguration("ai_sdk", { model: "deepseek-flash", maxSteps: value }, binding)).toThrow();
    for (const value of [0, -1, 3601, "30"]) expect(() => assertAiSdkConfiguration("ai_sdk", { model: "deepseek-flash", timeoutSec: value }, binding)).toThrow();
    expect(() => assertAiSdkConfiguration("ai_sdk", { model: "deepseek-flash", maxSteps: 20, timeoutSec: 120 }, binding)).not.toThrow();
  });
});
