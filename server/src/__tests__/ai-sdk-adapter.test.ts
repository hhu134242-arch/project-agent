import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadInstructions } from "../../../packages/adapters/ai-sdk/src/server/instructions.js";
import * as instructionLoader from "../../../packages/adapters/ai-sdk/src/server/instructions.js";
import { tool } from "ai";
import { z } from "zod";
import { StreamRedactor } from "../../../packages/adapters/ai-sdk/src/server/stream-redactor.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdapterExecutionContext } from "@paperclipai/adapter-utils";
import { execute, sessionCodec, testEnvironment } from "../../../packages/adapters/ai-sdk/src/server/index.js";
import { parseAiSdkStdoutLine } from "../../../packages/adapters/ai-sdk/src/ui/index.js";
import { OPENROUTER_ATTRIBUTION_HEADERS } from "@paperclipai/shared/openrouter-attribution";
import type { AiSdkDependencies } from "../../../packages/adapters/ai-sdk/src/server/model.js";
import { createAiSdkEndpointFetch } from "../services/ai-sdk-fetch.js";

const KEY = "fixture-deepseek-private-key";
const TOKEN = "fixture-run-agent-jwt";
const MCP_TOKEN = "fixture-mcp-token";
let server: Server;
let origin: string;
let providerBodies: Record<string, unknown>[];
let providerRequests: Array<{ path: string; headers: IncomingMessage["headers"] }>;
let apiCalls: Array<{ method: string; path: string; body: unknown; auth: string | undefined; run: string | string[] | undefined }>;
let mcpCalls: string[];
let temporaryDirectories: string[];
let modelTurn: (body: Record<string, unknown>, response: ServerResponse) => void;
let mcpToolCall: (body: Record<string, unknown>, response: ServerResponse) => void;
const realFetch = globalThis.fetch;
const responseProtocols = new WeakMap<ServerResponse, "chat" | "responses" | "messages">();

function stream(response: ServerResponse, content: string | { toolName: string; input: unknown }, id = "fixture-provider-request") {
  const protocol = responseProtocols.get(response);
  if (protocol === "responses") return streamResponses(response, content, id);
  if (protocol === "messages") return streamMessages(response, content, id);
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  const delta = typeof content === "string" ? { content } : { tool_calls: [{ index: 0, id: `call-${providerBodies.length}`, type: "function", function: { name: content.toolName, arguments: JSON.stringify(content.input) } }] };
  const chunk = (extra: Record<string, unknown>) => `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: 1, model: "deepseek-flash", ...extra })}\n\n`;
  response.write(chunk({ choices: [{ index: 0, delta, finish_reason: null }] }));
  response.write(chunk({ choices: [{ index: 0, delta: {}, finish_reason: typeof content === "string" ? "stop" : "tool_calls" }], usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16, prompt_tokens_details: { cached_tokens: 2 }, prompt_cache_hit_tokens: 2, prompt_cache_miss_tokens: 10 } }));
  response.end("data: [DONE]\n\n");
}
function streamResponses(response: ServerResponse, content: string | { toolName: string; input: unknown }, id: string) {
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  const event = (type: string, fields: Record<string, unknown>) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`);
  const itemId = `item-${providerBodies.length}`;
  event("response.created", { response: { id, created_at: 1, model: "fixture-exact-model" } });
  if (typeof content === "string") {
    event("response.output_item.added", { output_index: 0, item: { type: "message", id: itemId } });
    event("response.output_text.delta", { item_id: itemId, output_index: 0, delta: content });
    event("response.output_item.done", { output_index: 0, item: { type: "message", id: itemId } });
  } else {
    const item = { type: "function_call", id: itemId, call_id: `call-${providerBodies.length}`, name: content.toolName };
    event("response.output_item.added", { output_index: 0, item: { ...item, arguments: "" } });
    event("response.function_call_arguments.delta", { item_id: itemId, output_index: 0, delta: JSON.stringify(content.input) });
    event("response.output_item.done", { output_index: 0, item: { ...item, arguments: JSON.stringify(content.input), status: "completed" } });
  }
  event("response.completed", { response: { usage: { input_tokens: 12, output_tokens: 4, input_tokens_details: { cached_tokens: 2 }, total_tokens: 16 } } });
  response.end();
}
function streamMessages(response: ServerResponse, content: string | { toolName: string; input: unknown }, id: string) {
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  const event = (type: string, fields: Record<string, unknown>) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`);
  event("message_start", { message: { id, model: "fixture-exact-model", role: "assistant", content: [], usage: { input_tokens: 10, cache_read_input_tokens: 2 } } });
  if (typeof content === "string") {
    event("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    event("content_block_delta", { index: 0, delta: { type: "text_delta", text: content } });
  } else {
    event("content_block_start", { index: 0, content_block: { type: "tool_use", id: `call-${providerBodies.length}`, name: content.toolName, input: {} } });
    event("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(content.input) } });
  }
  event("content_block_stop", { index: 0 });
  event("message_delta", { delta: { stop_reason: typeof content === "string" ? "end_turn" : "tool_use" }, usage: { output_tokens: 4 } });
  event("message_stop", {});
  response.end();
}
async function requestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}
function context(overrides: Partial<AdapterExecutionContext> = {}): AdapterExecutionContext {
  return {
    runId: "run-1", agent: { id: "agent-1", companyId: "company-1", name: "Research", adapterType: "ai_sdk", adapterConfig: {} },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: "issue-1" },
    config: { managedAiProvider: "openai", managedAiVendor: "deepseek", managedAiConnection: { sessionIdentity: "grant:owner:credential:1" }, managedAiRouting: { kind: "gateway", protocol: "chat", baseUrl: "https://api.deepseek.com", auth: "bearer", models: [] }, env: { PAPERCLIP_AI_PROVIDER_KEY: KEY }, model: "deepseek-flash" },
    context: { taskId: "issue-1", paperclipTaskMarkdown: "Summarize the task and post the result.", shouldNeverAppearInPrompt: "secret-context-sentinel" },
    authToken: TOKEN, onLog: vi.fn(async () => {}), onMeta: vi.fn(async () => {}), onUsage: vi.fn(async () => {}), onDispatch: vi.fn(), onCancellationReady: vi.fn(async () => {}),
    ...overrides,
  };
}

function platformContext(platform: "deepseek" | "openai" | "anthropic" | "openrouter" | "gateway", protocol: "chat" | "responses" | "messages" = "chat", auth: "bearer" | "api_key" | "none" = "bearer") {
  const ctx = context();
  if (platform !== "deepseek") {
    delete ctx.config.managedAiVendor;
    delete ctx.config.managedAiRouting;
    ctx.config.managedAiProvider = platform === "gateway" ? protocol === "messages" ? "anthropic" : "openai" : platform;
  }
  if (platform === "gateway") ctx.config.managedAiRouting = { kind: "gateway", protocol, baseUrl: "https://models.example.com/v1", auth, models: [] };
  ctx.config.model = "fixture-exact-model";
  return ctx;
}
/** Test-only HTTP redirection preserves real SDK serialization/streaming. */
const fixtureDependencies = (): AiSdkDependencies => ({ customEndpointFetch: (input, init) => realFetch(`${origin}${new URL(String(input)).pathname}`, init) });

beforeEach(async () => {
  providerBodies = []; providerRequests = []; apiCalls = []; mcpCalls = []; temporaryDirectories = [];
  modelTurn = (_body, response) => stream(response, "Task completed.");
  mcpToolCall = (body, response) => response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
    jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "The fixture fact is 42." }] },
  }));
  server = createServer(async (request, response) => {
    if (["/chat/completions", "/v1/chat/completions", "/api/v1/chat/completions", "/v1/responses", "/v1/messages"].includes(request.url ?? "")) {
      const body = await requestBody(request); providerBodies.push(body);
      providerRequests.push({ path: request.url!, headers: request.headers });
      const protocol = request.url?.endsWith("/responses") ? "responses" : request.url?.endsWith("/messages") ? "messages" : "chat";
      responseProtocols.set(response, protocol);
      if (body.stream !== true) {
        const payload = protocol === "responses"
          ? { id: "probe", object: "response", created_at: 1, model: body.model, status: "completed", output: [{ id: "msg-1", type: "message", role: "assistant", content: [{ type: "output_text", text: "OK", annotations: [] }] }], usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } }
          : protocol === "messages" ? { id: "probe", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: "OK" }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 2, output_tokens: 1 } }
          : { id: "probe", object: "chat.completion", created: 1, model: body.model, choices: [{ index: 0, message: { role: "assistant", content: "OK" }, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } };
        response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(payload)); return;
      }
      modelTurn(body, response); return;
    }
    if (request.url === "/mcp") {
      expect(request.headers.authorization).toBe(`Bearer ${MCP_TOKEN}`);
      if (request.method !== "POST") { response.writeHead(405).end(); return; }
      const body = await requestBody(request); mcpCalls.push(body.method);
      if (body.id === undefined) { response.writeHead(202).end(); return; }
      let result: unknown;
      if (body.method === "server/discover") { response.writeHead(404).end(); return; }
      if (body.method === "initialize") result = { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1" } };
      else if (body.method === "tools/list") result = { tools: [{ name: "lookup", description: "Look up fixture fact", inputSchema: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] } }] };
      else if (body.method === "tools/call") { mcpToolCall(body, response); return; }
      else result = {};
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result })); return;
    }
    apiCalls.push({ method: request.method!, path: request.url!, body: await requestBody(request), auth: request.headers.authorization, run: request.headers["x-paperclip-run-id"] });
    const result = request.url?.includes("comments") ? { id: "comment-1", body: "Saved" } : { id: "issue-1", companyId: "company-1", title: "Research", status: request.method === "PATCH" ? "done" : "in_progress" };
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  vi.stubEnv("PAPERCLIP_API_URL", origin);
  // Redirect only the official provider transport into a real HTTP fixture. Production URLs remain validated.
  vi.stubGlobal("fetch", (url: RequestInfo | URL, init?: RequestInit) => {
    const input = String(url);
    const providerUrl = new URL(input);
    return realFetch(["api.deepseek.com", "api.openai.com", "api.anthropic.com", "openrouter.ai"].includes(providerUrl.hostname) ? `${origin}${providerUrl.pathname}` : url, init);
  });
});
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true }))); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); });

describe("AI SDK API platform adapter", () => {
  it.each([
    ["deepseek", "chat", "/chat/completions"],
    ["openai", "responses", "/v1/responses"],
    ["anthropic", "messages", "/v1/messages"],
    ["openrouter", "chat", "/api/v1/chat/completions"],
    ["gateway", "chat", "/v1/chat/completions"],
    ["gateway", "responses", "/v1/responses"],
    ["gateway", "messages", "/v1/messages"],
  ] as const)("runs the real %s/%s SDK tool loop at %s", async (platform, protocol, apiPath) => {
    modelTurn = (_body, response) => providerBodies.length === 1
      ? stream(response, { toolName: "paperclip_get_task", input: {} })
      : stream(response, "The selected platform completed the task.");
    const ctx = platformContext(platform, protocol);
    const result = await execute(ctx, fixtureDependencies());
    expect(result).toMatchObject({ exitCode: 0, provider: platform, biller: platform, model: "fixture-exact-model", costUsd: null, costStatus: "unpriced", usage: { inputTokens: 20, outputTokens: 8, cachedInputTokens: 4 }, resultJson: { platform, protocol, steps: 2 } });
    expect(providerRequests.map((request) => request.path)).toEqual([apiPath, apiPath]);
    expect(providerBodies.every((body) => body.model === "fixture-exact-model")).toBe(true);
    expect(JSON.stringify(providerBodies[1])).toContain("Research");
    expect(ctx.onUsage).toHaveBeenLastCalledWith(expect.objectContaining({ provider: platform, biller: platform, model: "fixture-exact-model", complete: true, costUsd: null, costStatus: "unpriced" }));
    if (platform === "openrouter") for (const [name, value] of Object.entries(OPENROUTER_ATTRIBUTION_HEADERS)) expect(providerRequests[0].headers[name.toLowerCase()]).toBe(value);
  });

  it.each([
    ["chat", "bearer"], ["chat", "none"], ["responses", "bearer"], ["responses", "none"],
    ["messages", "bearer"], ["messages", "api_key"], ["messages", "none"],
  ] as const)("uses only selected %s/%s credentials despite host environment credentials", async (protocol, auth) => {
    for (const name of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENROUTER_API_KEY", "DEEPSEEK_API_KEY"]) vi.stubEnv(name, "host-secret-must-not-be-used");
    for (const name of ["OPENAI_BASE_URL", "ANTHROPIC_BASE_URL"]) vi.stubEnv(name, "https://wrong-host.example.com/v1");
    const ctx = platformContext("gateway", protocol, auth);
    if (auth === "none") ctx.config.env = {};
    const result = await execute(ctx, fixtureDependencies());
    expect(result.exitCode).toBe(0);
    expect(providerRequests[0].headers.authorization).toBe(auth === "bearer" ? `Bearer ${KEY}` : undefined);
    expect(providerRequests[0].headers["x-api-key"]).toBe(auth === "api_key" ? KEY : undefined);
    expect(JSON.stringify(providerRequests)).not.toContain("host-secret-must-not-be-used");
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it.each(["openai", "anthropic", "openrouter"] as const)("requires an injected key for native %s, even with host secrets", async (platform) => {
    const ctx = platformContext(platform); ctx.config.env = {};
    vi.stubEnv("OPENAI_API_KEY", KEY); vi.stubEnv("ANTHROPIC_API_KEY", KEY); vi.stubEnv("OPENROUTER_API_KEY", KEY);
    expect((await execute(ctx)).errorCode).toBe("ai_sdk_configuration");
    expect(providerBodies).toHaveLength(0);
  });

  it.each(["chat", "responses", "messages"] as const)("probes the exact custom %s model with the real SDK", async (protocol) => {
    const ctx = platformContext("gateway", protocol);
    expect((await testEnvironment({ companyId: "company-1", adapterType: "ai_sdk", config: ctx.config }, fixtureDependencies())).status).toBe("pass");
    expect(providerBodies[0].model).toBe("fixture-exact-model");
    expect(providerBodies[0].max_tokens ?? providerBodies[0].max_output_tokens).toBe(16);
  });

  it.each(["chat", "responses", "messages"] as const)("stops in-flight custom %s streaming before acknowledging cancellation", async (protocol) => {
    const started = Promise.withResolvers<void>();
    let closed = false;
    modelTurn = (_body, response) => {
      response.on("close", () => { closed = true; });
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(": waiting\n\n");
      started.resolve();
    };
    const ctx = platformContext("gateway", protocol);
    const controller = new AbortController(); ctx.signal = controller.signal;
    const running = execute(ctx, fixtureDependencies());
    await started.promise; controller.abort();
    expect(await running).toMatchObject({ errorCode: "cancelled", clearSession: true, resultJson: { status: "cancelled", executionCancellation: { state: "acknowledged" } } });
    expect(providerBodies).toHaveLength(1);
    await vi.waitFor(() => expect(closed).toBe(true));
  });

  it("fails custom endpoints closed when the host did not supply its protected transport", async () => {
    const ctx = platformContext("gateway");
    const result = await execute(ctx);
    expect(result).toMatchObject({ exitCode: 1, errorFamily: "configuration", executionRecovery: { providerWorkStarted: false } });
    expect(ctx.onDispatch).not.toHaveBeenCalled();
    expect(providerBodies).toHaveLength(0);
  });

  it.each(["http://models.example.com/v1", "https://localhost/v1", "https://127.0.0.1/v1", "https://10.0.0.2/v1", "https://169.254.169.254/v1", "https://[::1]/v1", "https://models.internal/v1", "https://user:secret@models.example.com/v1", "https://models.example.com/v1?key=secret"])("rejects unsafe API base URL before dispatch: %s", async (baseUrl) => {
    const ctx = platformContext("gateway");
    (ctx.config.managedAiRouting as Record<string, unknown>).baseUrl = baseUrl;
    expect((await execute(ctx, { customEndpointFetch: createAiSdkEndpointFetch() })).errorCode).toBe("ai_sdk_configuration");
    expect(ctx.onDispatch).not.toHaveBeenCalled();
    expect(providerBodies).toHaveLength(0);
  });

  it("rejects redirects instead of forwarding the model API key to their target", async () => {
    const ctx = platformContext("gateway");
    const customEndpointFetch = vi.fn(async () => new Response(null, { status: 307, headers: { location: "https://other.example.com/v1/chat/completions" } }));
    expect((await execute(ctx, { customEndpointFetch })).exitCode).toBe(1);
    expect(customEndpointFetch).toHaveBeenCalledOnce();
    expect(providerBodies).toHaveLength(0);
  });

  it.each(["platform", "protocol", "endpoint", "model", "credential"] as const)("starts a fresh session after the selected %s changes", async (change) => {
    const ctx = platformContext("gateway");
    const first = await execute(ctx, fixtureDependencies());
    ctx.runtime.sessionParams = first.sessionParams!;
    if (change === "platform") { ctx.config.managedAiProvider = "openrouter"; delete ctx.config.managedAiRouting; }
    if (change === "protocol") (ctx.config.managedAiRouting as Record<string, unknown>).protocol = "responses";
    if (change === "endpoint") (ctx.config.managedAiRouting as Record<string, unknown>).baseUrl = "https://other.example.com/v1";
    if (change === "model") ctx.config.model = "fixture-other-model";
    if (change === "credential") ctx.config.env = { PAPERCLIP_AI_PROVIDER_KEY: "rotated-fixture-key" };
    const next = await execute(ctx, fixtureDependencies());
    expect(next.exitCode).toBe(0);
    expect(next.resultJson?.resumed).toBe(false);
    expect(next.sessionDisplayId).not.toBe(first.sessionDisplayId);
  });

  it("lets an authorized agent create follow-up tasks through the existing company API", async () => {
    modelTurn = (_body, response) => providerBodies.length === 1
      ? stream(response, { toolName: "paperclip_api_request", input: { method: "POST", path: "/api/companies/company-1/issues", body: { title: "Follow-up", parentId: "issue-1" } } })
      : stream(response, "Follow-up requested through the company API.");
    const result = await execute(context());
    expect(result.exitCode).toBe(0);
    expect(apiCalls).toMatchObject([{ method: "POST", path: "/api/companies/company-1/issues", auth: `Bearer ${TOKEN}`, run: "run-1", body: { title: "Follow-up", parentId: "issue-1" } }]);
    expect(JSON.stringify(providerBodies)).not.toContain(TOKEN);
  });

  it.each(["https://other.invalid/api/issues/issue-1", "/api/companies/other-company/issues", "/api/companies/company-1/../../admin", "/api/instance-settings", "/api/companies/company-1/secrets", "/api/agents/00000000-0000-4000-8000-000000000001/identity/private-key"])("denies unscoped API destinations before transport: %s", async (apiPath) => {
    modelTurn = (_body, response) => providerBodies.length === 1
      ? stream(response, { toolName: "paperclip_api_request", input: { method: "GET", path: apiPath } })
      : stream(response, "The operation was denied.");
    await execute(context());
    expect(apiCalls).toHaveLength(0);
  });

  it("uses the real SDK tool loop with an exact model, run-scoped task mutation and cumulative unpriced receipts", async () => {
    modelTurn = (_body, response) => {
      if (providerBodies.length === 1) stream(response, { toolName: "paperclip_get_task", input: {} });
      else if (providerBodies.length === 2) stream(response, { toolName: "paperclip_update_task", input: { status: "done", comment: "Summary delivered." } });
      else stream(response, "Summary delivered.");
    };
    const ctx = context(); ctx.config.model = "deepseek-exact-custom-id";
    const result = await execute(ctx);
    expect(result).toMatchObject({ exitCode: 0, model: "deepseek-exact-custom-id", costUsd: null, costStatus: "unpriced", usage: { inputTokens: 30, cachedInputTokens: 6, outputTokens: 12 }, resultJson: { status: "completed", steps: 3 } });
    expect(providerBodies).toHaveLength(3);
    expect(providerBodies.every((body) => body.model === "deepseek-exact-custom-id")).toBe(true);
    expect(JSON.stringify(providerBodies)).not.toContain("secret-context-sentinel");
    expect(apiCalls).toMatchObject([{ method: "GET", path: "/api/issues/issue-1", auth: `Bearer ${TOKEN}`, run: "run-1" }, { method: "PATCH", path: "/api/issues/issue-1", body: { status: "done", comment: "Summary delivered." } }]);
    expect(ctx.onUsage).toHaveBeenLastCalledWith(expect.objectContaining({ complete: true, costStatus: "unpriced", usage: result.usage }));
    const logs = vi.mocked(ctx.onLog).mock.calls.map((call) => call[1]).join("");
    expect(logs).not.toContain(KEY); expect(logs).not.toContain(TOKEN);
    expect(parseAiSdkStdoutLine(JSON.stringify({ type: "tool-call", toolName: "paperclip_get_task", toolCallId: "c", input: {} }), "now")).toMatchObject([{ kind: "tool_call", toolUseId: "c" }]);
  });

  it("connects only injected run-scoped MCP tools and returns the tool result to DeepSeek", async () => {
    modelTurn = (_body, response) => providerBodies.length === 1 ? stream(response, { toolName: "mcp_0_lookup", input: { topic: "answer" } }) : stream(response, "42");
    const ctx = context({ runtimeMcp: { getServers: () => [{ name: "fixture", connectionId: "connection-1", url: `${origin}/mcp`, token: MCP_TOKEN }] } });
    const result = await execute(ctx);
    expect(result.exitCode).toBe(0);
    expect(mcpCalls).toContain("tools/call");
    expect(JSON.stringify(providerBodies[1])).toContain("The fixture fact is 42.");
    expect(JSON.stringify(providerBodies)).not.toContain(MCP_TOKEN);
    expect(JSON.stringify(result)).not.toContain(MCP_TOKEN);
  });

  it.each(["mcp rejection", "synchronous tool throw"])("does not send credentials from a %s to the next model request", async (failure) => {
    const message = `Authorization: Bearer ${MCP_TOKEN}; provider=${KEY}; agent=${TOKEN}`;
    const ctx = context({ runtimeMcp: { getServers: () => [{ name: "fixture", connectionId: "connection-1", url: `${origin}/mcp`, token: MCP_TOKEN }] } });
    let toolName = "mcp_0_lookup";
    let toolInput: Record<string, unknown> = { topic: "answer" };
    if (failure === "mcp rejection") {
      mcpToolCall = (body, response) => response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
        jsonrpc: "2.0", id: body.id, error: { code: -32603, message, data: { credential: MCP_TOKEN } },
      }));
    } else {
      toolName = "sync_fixture"; toolInput = {};
      vi.spyOn(instructionLoader, "loadInstructions").mockResolvedValue({ prompt: "", tools: {
        sync_fixture: tool({ description: "Synchronous failure fixture", inputSchema: z.object({}), execute: () => { throw new Error(message, { cause: { credential: MCP_TOKEN } }); } }),
      } });
    }
    modelTurn = (_body, response) => providerBodies.length === 1
      ? stream(response, { toolName, input: toolInput }) : stream(response, "The tool failed; no action was completed.");
    const result = await execute(ctx);
    expect(result.exitCode).toBe(0);
    expect(providerBodies).toHaveLength(2);
    expect(JSON.stringify(providerBodies[1])).toContain("Tool operation failed. Check the task permission or connection.");
    for (const secret of [MCP_TOKEN, KEY, TOKEN]) {
      expect(JSON.stringify(providerBodies)).not.toContain(secret);
      expect(JSON.stringify(result)).not.toContain(secret);
      expect(JSON.stringify(vi.mocked(ctx.onLog).mock.calls)).not.toContain(secret);
    }
    if (failure === "mcp rejection") expect(mcpCalls.filter(method => method === "tools/call")).toHaveLength(1);
  });

  it("settles a cancelled MCP request without continuing the model loop", async () => {
    const started = Promise.withResolvers<void>();
    let closed = false;
    mcpToolCall = (_body, response) => {
      response.on("close", () => { closed = true; });
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(": waiting for tool result\n\n");
      started.resolve();
    };
    modelTurn = (_body, response) => stream(response, { toolName: "mcp_0_lookup", input: { topic: "answer" } });
    const controller = new AbortController();
    const ctx = context({ signal: controller.signal, runtimeMcp: { getServers: () => [{ name: "fixture", connectionId: "connection-1", url: `${origin}/mcp`, token: MCP_TOKEN }] } });
    const running = execute(ctx);
    await started.promise;
    controller.abort(new Error("Operator stopped the run."));
    const result = await running;
    expect(result).toMatchObject({ errorCode: "cancelled", clearSession: true, resultJson: { executionCancellation: { state: "acknowledged" } } });
    expect(providerBodies).toHaveLength(1);
    expect(mcpCalls.filter(method => method === "tools/call")).toHaveLength(1);
    await vi.waitFor(() => expect(closed).toBe(true));
  });

  it("resumes bounded messages only for the same connection, model, task and workspace", async () => {
    const first = await execute(context());
    expect(sessionCodec.serialize(first.sessionParams ?? null)).not.toBeNull();
    const next = context({ runtime: { sessionId: null, sessionDisplayId: null, sessionParams: first.sessionParams!, taskKey: "issue-1" }, getFreshSessionHandoff: vi.fn(async () => "New-session handoff") });
    const resumed = await execute(next);
    expect(resumed.resultJson?.resumed).toBe(true);
    expect((providerBodies[1].messages as unknown[]).length).toBeGreaterThan((providerBodies[0].messages as unknown[]).length);
    expect(next.getFreshSessionHandoff).not.toHaveBeenCalled();
    next.config = { ...next.config, managedAiConnection: { sessionIdentity: "grant:other-owner:credential:1" } };
    const changed = await execute(next);
    expect(changed.resultJson?.resumed).toBe(false);
    expect(next.getFreshSessionHandoff).toHaveBeenCalledOnce();
    expect(JSON.stringify(providerBodies[2])).toContain("New-session handoff");
  });

  it("acknowledges cancellation only after the streaming HTTP operation settles", async () => {
    const started = Promise.withResolvers<void>();
    let closed = false;
    modelTurn = (_body, response) => { response.on("close", () => { closed = true; }); response.writeHead(200, { "Content-Type": "text/event-stream" }); response.write(": waiting\n\n"); started.resolve(); };
    const controller = new AbortController();
    const ctx = context({ signal: controller.signal });
    const running = execute(ctx);
    await started.promise; controller.abort();
    const result = await running;
    expect(ctx.onCancellationReady).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ errorCode: "cancelled", clearSession: true, resultJson: { status: "cancelled", executionCancellation: { state: "acknowledged" } } });
    expect(result.executionRecovery).toBeUndefined();
    await vi.waitFor(() => expect(closed).toBe(true));
  });

  it("does not dispatch an already cancelled run", async () => {
    const controller = new AbortController(); controller.abort();
    const ctx = context({ signal: controller.signal });
    const result = await execute(ctx);
    expect(ctx.onDispatch).not.toHaveBeenCalled();
    expect(providerBodies).toHaveLength(0);
    expect(result.executionRecovery).toMatchObject({ providerWorkStarted: false });
  });

  it("fails provider errors without automatic replay or leaking provider request details", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    modelTurn = (_body, response) => response.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: { message: `rejected ${KEY}`, type: "auth" } }));
    const ctx = context(); const result = await execute(ctx);
    expect(result.exitCode).toBe(1); expect(providerBodies).toHaveLength(1);
    expect(result.executionRecovery).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(KEY);
    expect(JSON.stringify(vi.mocked(ctx.onLog).mock.calls)).not.toContain(KEY);
  });


  it("redacts credentials split across streaming chunks and in saved conversation state", async () => {
    modelTurn = (_body, response) => {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const content of ["Example: ", KEY.slice(0, 13), KEY.slice(13), " hidden."]) {
        response.write(`data: ${JSON.stringify({ id: "split", object: "chat.completion.chunk", created: 1, model: "deepseek-flash", choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`);
      }
      response.end(`data: ${JSON.stringify({ id: "split", object: "chat.completion.chunk", created: 1, model: "deepseek-flash", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } })}\n\ndata: [DONE]\n\n`);
    };
    const ctx = context(); const result = await execute(ctx);
    expect(result.exitCode).toBe(0);
    const text = vi.mocked(ctx.onLog).mock.calls.map((call) => JSON.parse(call[1])).filter((event) => event.type === "text-delta").map((event) => event.text).join("");
    expect(text).toBe("Example: [REDACTED] hidden.");
    expect(JSON.stringify(result)).not.toContain(KEY);
    const overlapping = new StreamRedactor(["aba"]);
    expect(overlapping.push("a") + overlapping.push("ba") + overlapping.finish()).toBe("[REDACTED]");
  });

  it("loads server-prepared instructions and reads only assigned skill resources", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "paperclip-ai-sdk-")); temporaryDirectories.push(directory);
    const skill = path.join(directory, "skill"); await mkdir(skill);
    await writeFile(path.join(directory, "AGENTS.md"), "Always write concise summaries.");
    await writeFile(path.join(skill, "SKILL.md"), "---\nname: research\ndescription: Research procedure\n---\nRead reference.txt.");
    await writeFile(path.join(skill, "reference.txt"), "Authorized reference material.");
    await writeFile(path.join(directory, "outside.txt"), "Secret outside skill.");
    await symlink(path.join(directory, "outside.txt"), path.join(skill, "escape.txt"));
    const ctx = context(); ctx.config.instructionsFilePath = path.join(directory, "AGENTS.md");
    ctx.config.paperclipRuntimeSkills = [{ key: "company/research", runtimeName: "research", source: skill }];
    modelTurn = (_body, response) => providerBodies.length === 1 ? stream(response, { toolName: "paperclip_read_skill", input: { skill: "company/research", resource: "reference.txt" } }) : stream(response, "Read the assigned reference.");
    expect((await execute(ctx)).exitCode).toBe(0);
    expect(JSON.stringify(providerBodies[0])).toContain("Always write concise summaries.");
    expect(JSON.stringify(providerBodies[1])).toContain("Authorized reference material.");
    const loaded = await loadInstructions(ctx.config, new AbortController().signal, []);
    const read = loaded.tools.paperclip_read_skill.execute!;
    for (const resource of ["../outside.txt", path.join(directory, "outside.txt"), "escape.txt"]) {
      await expect(read({ skill: "company/research", resource }, { toolCallId: "test", messages: [], context: undefined } as never)).rejects.toThrow();
    }
  });

  it("times out stalled HTTP without blocking unrelated event-loop work and does not claim resumable execution", async () => {
    modelTurn = (_body, response) => { response.writeHead(200, { "Content-Type": "text/event-stream" }); response.write(": waiting\n\n"); };
    const ctx = context(); ctx.config.timeoutSec = 1;
    let timerRan = false;
    const otherWork = new Promise<void>((resolve) => setTimeout(() => { timerRan = true; resolve(); }, 10));
    const [result] = await Promise.all([execute(ctx), otherWork]);
    expect(timerRan).toBe(true);
    expect(result).toMatchObject({ timedOut: true, errorCode: "ai_sdk_timeout", clearSession: true });
    expect(result.executionRecovery).toBeUndefined();
  });

  it("reports a reached tool-loop limit as incomplete instead of success", async () => {
    modelTurn = (_body, response) => stream(response, { toolName: "paperclip_get_task", input: {} });
    const ctx = context(); ctx.config.maxSteps = 1;
    expect(await execute(ctx)).toMatchObject({ exitCode: 1, errorCode: "ai_sdk_step_limit", resultJson: { steps: 1, status: "failed" } });
    expect(apiCalls).toHaveLength(1);
  });

  it("tests the exact configured model with a small bounded real SDK request", async () => {
    const ctx = context();
    const result = await testEnvironment({ companyId: "company-1", adapterType: "ai_sdk", config: ctx.config });
    expect(result.status).toBe("pass");
    expect(providerBodies[0]).toMatchObject({ model: "deepseek-flash", max_tokens: 16 });
  });

  it.each(["remote", "key", "endpoint", "protocol", "unmanaged", "isolation"])("rejects unsupported %s configuration in both test and execute", async (kind) => {
    const ctx = context();
    if (kind === "remote") ctx.executionTarget = { kind: "remote", transport: "ssh", remoteCwd: "/tmp", spec: {} } as AdapterExecutionContext["executionTarget"];
    if (kind === "key") { ctx.config.env = {}; vi.stubEnv("DEEPSEEK_API_KEY", KEY); }
    if (kind === "endpoint") (ctx.config.managedAiRouting as Record<string, unknown>).baseUrl = origin;
    if (kind === "protocol") (ctx.config.managedAiRouting as Record<string, unknown>).protocol = "responses";
    if (kind === "unmanaged") delete ctx.config.managedAiConnection;
    if (kind === "isolation") ctx.config.managedSandboxOnly = true;
    expect((await execute(ctx)).errorCode).toBe("ai_sdk_configuration");
    expect((await testEnvironment({ companyId: "company-1", adapterType: "ai_sdk", config: ctx.config, executionTarget: ctx.executionTarget })).status).toBe("fail");
    expect(providerBodies).toHaveLength(0);
  });
});
