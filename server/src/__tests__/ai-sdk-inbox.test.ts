import { once } from "node:events";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AdapterExecutionContext } from "@paperclipai/adapter-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execute } from "../../../packages/adapters/ai-sdk/src/server/index.js";

const API_KEY = "fixture-inbox-provider-key";
const AGENT_TOKEN = "fixture-inbox-agent-token";
const RUN_ID = "fixture-inbox-run";
const INBOX_PATH = "/api/agents/me/inbox-lite";
const INBOX = { issues: [{ id: "issue-inbox-1", identifier: "WORK-1", title: "Review the pending proposal", status: "todo" }] };
const TASK_TOOLS = ["paperclip_get_task", "paperclip_get_comments", "paperclip_add_comment", "paperclip_update_task"];
const realFetch = globalThis.fetch;

let server: Server;
let origin: string;
let providerBodies: Array<Record<string, unknown>>;
let apiCalls: Array<{ method: string; path: string; auth: string | undefined; runId: string | string[] | undefined }>;
let unexpectedDestinations: string[];
let requestedPath: string;
let requestedTool: string;
let discoverWork: boolean;

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function stream(response: ServerResponse, content: string | { tool: string; input: unknown }) {
  response.writeHead(200, { "Content-Type": "text/event-stream" });
  const delta = typeof content === "string"
    ? { content }
    : { tool_calls: [{ index: 0, id: "call-inbox", type: "function", function: { name: content.tool, arguments: JSON.stringify(content.input) } }] };
  const chunk = (fields: Record<string, unknown>) => `data: ${JSON.stringify({ id: "inbox-response", object: "chat.completion.chunk", created: 1, model: "deepseek-flash", ...fields })}\n\n`;
  response.write(chunk({ choices: [{ index: 0, delta, finish_reason: null }] }));
  response.write(chunk({ choices: [{ index: 0, delta: {}, finish_reason: typeof content === "string" ? "stop" : "tool_calls" }], usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } }));
  response.end("data: [DONE]\n\n");
}

function context(wakeReason = "manual"): AdapterExecutionContext {
  return {
    runId: RUN_ID,
    agent: { id: "agent-inbox", companyId: "company-inbox", name: "Inbox Agent", adapterType: "ai_sdk", adapterConfig: {} },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    config: {
      managedAiProvider: "openai", managedAiVendor: "deepseek",
      managedAiConnection: { sessionIdentity: "inbox:grant:credential:1" },
      managedAiRouting: { kind: "gateway", protocol: "chat", baseUrl: "https://api.deepseek.com", auth: "bearer", models: [] },
      env: { PAPERCLIP_AI_PROVIDER_KEY: API_KEY }, model: "deepseek-flash",
    },
    context: { wakeReason },
    authToken: AGENT_TOKEN,
    onLog: vi.fn(async () => {}), onMeta: vi.fn(async () => {}), onDispatch: vi.fn(),
    onCancellationReady: vi.fn(async () => {}),
  };
}

function advertisedTools(body: Record<string, unknown>): string[] {
  return ((body.tools ?? []) as Array<{ function: { name: string } }>).map((entry) => entry.function.name);
}

beforeEach(async () => {
  providerBodies = [];
  apiCalls = [];
  unexpectedDestinations = [];
  requestedPath = INBOX_PATH;
  requestedTool = "paperclip_api_request";
  discoverWork = true;
  server = createServer(async (request, response) => {
    if (request.url === "/chat/completions") {
      const body = await readBody(request);
      providerBodies.push(body);
      if (providerBodies.length === 1 && discoverWork) {
        stream(response, { tool: requestedTool, input: requestedTool === "paperclip_api_request" ? { method: "GET", path: requestedPath } : {} });
      } else {
        const inboxReturned = JSON.stringify(body.messages).includes(INBOX.issues[0].title);
        stream(response, inboxReturned ? `Found ${INBOX.issues[0].identifier}: ${INBOX.issues[0].title}.` : "No authorized inbox result was returned.");
      }
      return;
    }
    apiCalls.push({ method: request.method!, path: request.url!, auth: request.headers.authorization, runId: request.headers["x-paperclip-run-id"] });
    response.writeHead(request.url === INBOX_PATH ? 200 : 404, { "Content-Type": "application/json" }).end(JSON.stringify(request.url === INBOX_PATH ? INBOX : { error: "Unexpected API path" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  vi.stubEnv("PAPERCLIP_API_URL", origin);
  // Keep SDK serialization, HTTP streaming and tool execution real; forbid all external traffic.
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin === "https://api.deepseek.com") return realFetch(`${origin}${url.pathname}`, init);
    if (url.origin === origin) return realFetch(input, init);
    unexpectedDestinations.push(url.origin);
    throw new Error("Unexpected network destination in the inbox regression.");
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("AI SDK taskless inbox discovery", () => {
  it.each(["manual", "heartbeat_timer"])("discovers assigned work during a %s wake through a real two-turn SDK loop", async (wakeReason) => {
    const ctx = context(wakeReason);
    const result = await execute(ctx);
    expect(result).toMatchObject({ exitCode: 0, resultJson: { status: "completed", steps: 2 }, summary: `Found ${INBOX.issues[0].identifier}: ${INBOX.issues[0].title}.` });
    expect(apiCalls).toEqual([{ method: "GET", path: INBOX_PATH, auth: `Bearer ${AGENT_TOKEN}`, runId: RUN_ID }]);
    expect(providerBodies).toHaveLength(2);
    expect(unexpectedDestinations).toEqual([]);
    expect(advertisedTools(providerBodies[0])).toContain("paperclip_api_request");
    for (const taskTool of TASK_TOOLS) expect(advertisedTools(providerBodies[0])).not.toContain(taskTool);
    const toolMessages = (providerBodies[1].messages as Array<{ role: string; content: string }>).filter((message) => message.role === "tool");
    expect(toolMessages).toHaveLength(1);
    expect(JSON.parse(toolMessages[0].content)).toEqual(INBOX);
    for (const secret of [API_KEY, AGENT_TOKEN]) {
      expect(JSON.stringify(providerBodies)).not.toContain(secret);
      expect(JSON.stringify(vi.mocked(ctx.onLog).mock.calls)).not.toContain(secret);
      expect(JSON.stringify(result.sessionParams)).not.toContain(secret);
    }
  });

  it.each([
    "/api/companies/another-company/issues",
    "/api/companies/company-inbox/secrets",
    "/api/agents/me/api-keys",
    "/api/admin/settings",
    "https://external.example/api/agents/me/inbox-lite",
  ])("rejects an unauthorized path before any business API request: %s", async (apiPath) => {
    requestedPath = apiPath;
    const result = await execute(context());
    expect(result).toMatchObject({ exitCode: 0, resultJson: { steps: 2 } });
    expect(apiCalls).toEqual([]);
    expect(unexpectedDestinations).toEqual([]);
    expect(providerBodies).toHaveLength(2);
    expect((providerBodies[1].messages as Array<{ role: string }>).some((message) => message.role === "tool")).toBe(true);
    expect(JSON.stringify(providerBodies)).not.toContain(AGENT_TOKEN);
    expect(JSON.stringify(providerBodies)).not.toContain(API_KEY);
  });

  it("withholds fixed-task tools without a task even when the model attempts one", async () => {
    requestedTool = "paperclip_get_task";
    expect((await execute(context())).exitCode).toBe(0);
    expect(providerBodies).toHaveLength(2);
    expect(apiCalls).toEqual([]);
  });

  it("advertises all four fixed-task tools when a task and authentication are present", async () => {
    discoverWork = false;
    const ctx = context();
    ctx.context.taskId = "task-inbox";
    expect((await execute(ctx)).exitCode).toBe(0);
    expect(advertisedTools(providerBodies[0])).toEqual(expect.arrayContaining(["paperclip_api_request", ...TASK_TOOLS]));
  });

  it.each([undefined, "task-inbox"])("withholds all Paperclip tools without authentication (task=%s)", async (taskId) => {
    discoverWork = false;
    const ctx = context();
    ctx.authToken = undefined;
    ctx.context.taskId = taskId;
    expect((await execute(ctx)).exitCode).toBe(0);
    expect(providerBodies).toHaveLength(1);
    expect(advertisedTools(providerBodies[0]).filter((name) => name.startsWith("paperclip_"))).toEqual([]);
    expect(apiCalls).toEqual([]);
  });
});
