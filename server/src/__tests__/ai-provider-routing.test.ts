import { describe, it, expect } from "vitest";
import {
  aiProviderRoutingSchema,
  createAiConnectionSchema,
  isAiConnectionCompatible,
  aiConnectionMetadataSchema,
  aiConnectionCatalogSlug,
  deepSeekRouting,
} from "@paperclipai/shared";
import { managedProviderRouting } from "../services/ai-provider-routing.js";

describe("provider routing", () => {
  it("binds the DeepSeek product identity to its official endpoint and keeps SDK selection explicit", () => {
    const routing = deepSeekRouting();
    const metadata = { provider: "openai", method: "api_key", vendorPresetId: "deepseek", routing } as const;
    expect(aiConnectionMetadataSchema.safeParse(metadata).success).toBe(true);
    expect(isAiConnectionCompatible(metadata, "ai_sdk", "custom-deepseek-model")).toBe(true);
    expect(isAiConnectionCompatible({ ...metadata, vendorPresetId: undefined }, "ai_sdk")).toBe(true);
    expect(isAiConnectionCompatible({ provider: "openai", method: "api_key", mode: "responsible_user" }, "ai_sdk")).toBe(false);
    expect(aiConnectionCatalogSlug("openai", routing, "deepseek")).toBe("deepseek");
    const projected = managedProviderRouting(routing, "ai_sdk", "selected-fixture-secret", "custom-deepseek-model");
    expect(projected).toMatchObject({ env: { PAPERCLIP_AI_PROVIDER_KEY: "selected-fixture-secret" } });
    for (const replacement of ["https://api.deepseek.com.evil.example", "https://api.deepseek.com/other", "https://gateway.example"]) {
      const changed = { ...metadata, routing: { ...routing, baseUrl: replacement } };
      expect(aiConnectionMetadataSchema.safeParse(changed).success).toBe(false);
      expect(createAiConnectionSchema.safeParse({ ...changed, name: "DeepSeek", ownership: "personal", apiKey: "fixture" }).success).toBe(false);
      expect(isAiConnectionCompatible(changed, "ai_sdk")).toBe(false);
      expect(aiConnectionCatalogSlug("openai", changed.routing, "deepseek")).not.toBe("deepseek");
    }
  });
  it("supports explicit API platform accounts and remote compatible protocols only", () => {
    for (const provider of ["openai", "anthropic", "openrouter"] as const) {
      expect(isAiConnectionCompatible({ provider, method: "api_key" }, "ai_sdk")).toBe(true);
      expect(isAiConnectionCompatible({ provider, method: "subscription" }, "ai_sdk")).toBe(false);
    }
    for (const protocol of ["chat", "responses", "messages"] as const) {
      const provider = protocol === "messages" ? "anthropic" : "openai";
      const routing = aiProviderRoutingSchema.parse({ kind: "gateway", protocol, baseUrl: "https://gateway.example/v1" });
      expect(isAiConnectionCompatible({ provider, method: "api_key", routing }, "ai_sdk")).toBe(true);
      for (const baseUrl of ["http://localhost:11434/v1", "https://127.0.0.1/v1", "https://internal.local/v1", "https://[::1]/v1"]) {
        expect(isAiConnectionCompatible({ provider, method: "api_key", routing: { ...routing, baseUrl } }, "ai_sdk")).toBe(false);
      }
      expect(isAiConnectionCompatible({ provider, method: "api_key", routing: { ...routing, kind: "local" } }, "ai_sdk")).toBe(false);
    }
  });
  it.each([
    "https://user:secret@gateway.example/v1",
    "https://gateway.example/v1?key=secret",
    "http://169.254.169.254/",
    "file:///tmp/secret",
    "https://gateway.example/#secret",
  ])("rejects unsafe or credential-bearing endpoint %s", (baseUrl) => {
    expect(
      aiProviderRoutingSchema.safeParse({
        kind: "gateway",
        protocol: "responses",
        baseUrl,
      }).success,
    ).toBe(false);
  });
  it("requires exactly the selected credential and disallows routed subscriptions", () => {
    const input = {
      provider: "openai",
      method: "api_key",
      name: "Local",
      ownership: "personal",
      routing: {
        kind: "local",
        protocol: "responses",
        auth: "none",
        baseUrl: "http://localhost:11434/v1",
      },
    };
    expect(createAiConnectionSchema.safeParse(input).success).toBe(true);
    expect(
      createAiConnectionSchema.safeParse({ ...input, apiKey: "unwanted" })
        .success,
    ).toBe(false);
    expect(
      createAiConnectionSchema.safeParse({
        ...input,
        method: "subscription",
        loginSessionId: "session",
      }).success,
    ).toBe(false);
  });
  it("rejects unsupported protocols and excluded remote adapters", () => {
    const routing = aiProviderRoutingSchema.parse({
      kind: "gateway",
      protocol: "chat",
      baseUrl: "https://gateway.example/v1",
    });
    for (const adapter of [
      "codex_local",
      "claude_local",
      "http",
      "process",
      "openclaw_gateway",
      "hermes_gateway",
      "acpx_local",
    ])
      expect(
        isAiConnectionCompatible(
          { provider: "openai", method: "api_key", routing },
          adapter,
        ),
      ).toBe(false);
    expect(
      isAiConnectionCompatible(
        { provider: "openai", method: "api_key", routing },
        "opencode_local",
      ),
    ).toBe(true);
    expect(
      isAiConnectionCompatible(
        { provider: "openai", method: "api_key", routing },
        "paperclip_runner",
        "model",
        "aws_agentcore",
      ),
    ).toBe(false);
  });
  it.each(["gateway", "openrouter"] as const)("uses a terminal-filtered secret variable for Hermes %s authentication", kind => {
    const route = aiProviderRoutingSchema.parse({ kind, protocol: "chat", auth: "bearer", ...(kind === "gateway" ? { baseUrl: "https://gateway.example/v1" } : {}) });
    const projected = managedProviderRouting(route, "hermes_local", "selected-key", "fixture-model");
    expect(projected.env.OPENAI_API_KEY).toBe("selected-key");
    expect(projected.env.PAPERCLIP_AI_PROVIDER_KEY).toBeUndefined();
    expect(projected.hermesConfig).toContain('api_key: "${OPENAI_API_KEY}"');
    expect(projected.hermesConfig).not.toContain("selected-key");
    expect(Object.entries(projected.env).filter(([, value]) => value === "selected-key").map(([name]) => name)).toEqual(kind === "openrouter" ? ["OPENAI_API_KEY", "OPENROUTER_API_KEY"] : ["OPENAI_API_KEY"]);
  });
  it("routes OpenRouter through each harness's protocol without putting secrets in Codex config", () => {
    const routing = aiProviderRoutingSchema.parse({
      kind: "openrouter",
      protocol: "responses",
    });
    const codex = managedProviderRouting(
      routing,
      "codex_local",
      "fixture-secret",
      "openai/gpt-5.4",
    );
    expect(codex.codexConfig).toContain('wire_api = "responses"');
    expect(codex.codexConfig).not.toContain("fixture-secret");
    const claude = managedProviderRouting(
      routing,
      "claude_local",
      "fixture-secret",
      "anthropic/claude-sonnet-4.6",
    );
    expect(claude.env.ANTHROPIC_BASE_URL).toBe("https://openrouter.ai/api");
    expect(claude.env.ANTHROPIC_AUTH_TOKEN).toBe("fixture-secret");
    expect(claude.env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe(
      "anthropic/claude-sonnet-4.6",
    );
    const opencode = managedProviderRouting(
      routing,
      "opencode_local",
      "fixture-secret",
      "anthropic/claude-sonnet-4.6",
    );
    expect(opencode.config.model).toBe(
      "openrouter/anthropic/claude-sonnet-4.6",
    );
  });
  it("projects only a Bedrock API key and rejects general AWS access keys", () => {
    const routing = aiProviderRoutingSchema.parse({
      kind: "bedrock",
      protocol: "bedrock",
      auth: "bearer",
      region: "us-east-1",
    });
    const projected = managedProviderRouting(
      routing,
      "claude_local",
      "fixture-bedrock-key",
      "bedrock-model",
    );
    expect(projected.env).toMatchObject({
      CLAUDE_CODE_USE_BEDROCK: "1",
      AWS_REGION: "us-east-1",
      AWS_BEARER_TOKEN_BEDROCK: "fixture-bedrock-key",
      AWS_EC2_METADATA_DISABLED: "true",
    });
    expect(aiProviderRoutingSchema.safeParse({ ...routing, auth: "aws_credentials" }).success).toBe(false);
    for (const key of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"]) expect(projected.env).not.toHaveProperty(key);
  });
});
