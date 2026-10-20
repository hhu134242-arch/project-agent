import { randomUUID } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { agents, companies, companyMemberships, createDb, heartbeatRuns } from "@paperclipai/db";
import { deepSeekRouting } from "@paperclipai/shared";
import { startEmbeddedPostgresTestDatabase } from "./helpers/embedded-postgres.js";
import { drainHeartbeatRunsToQuiescence } from "./helpers/drain-heartbeat-runs.js";
import { aiConnectionService } from "../services/ai-connections.js";
import { heartbeatService } from "../services/heartbeat.js";

describe("AI SDK managed heartbeat integration", () => {
  const realFetch = globalThis.fetch;
  const providerBodies: Array<Record<string, unknown>> = [];
  let holdResponse = false;
  let requestStarted = Promise.withResolvers<void>();
  let database: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>>;
  let db: ReturnType<typeof createDb>;
  let heartbeat: ReturnType<typeof heartbeatService>;
  let home: string;
  const server = createServer(async (request, response) => {
    const buffers: Buffer[] = [];
    for await (const chunk of request) buffers.push(Buffer.from(chunk));
    providerBodies.push(JSON.parse(Buffer.concat(buffers).toString()));
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    requestStarted.resolve();
    if (holdResponse) { response.write(": pending\n\n"); return; }
    sendResponse(response);
  });
  function sendResponse(response: ServerResponse) {
    const base = { id: "heartbeat-sdk-fixture", object: "chat.completion.chunk", created: 1, model: "deepseek-exact-fixture" };
    response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { content: "Verified SDK heartbeat result." }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`);
    response.end("data: [DONE]\n\n");
  }
  beforeAll(async () => {
    home = await mkdtemp(path.join(os.tmpdir(), "paperclip-ai-sdk-heartbeat-"));
    vi.stubEnv("PAPERCLIP_HOME", home);
    vi.stubEnv("PAPERCLIP_INSTANCE_ID", "sdk-heartbeat-test");
    vi.stubEnv("PAPERCLIP_AGENT_JWT_SECRET", "sdk-heartbeat-test-signing-secret");
    // This service fixture does not boot the board HTTP server. Leave the
    // override absent so managed MCP stays unavailable and API tools can use
    // the normal derived URL; an explicit empty override is an invalid URL.
    vi.stubEnv("PAPERCLIP_API_URL", undefined);
    database = await startEmbeddedPostgresTestDatabase("paperclip-ai-sdk-heartbeat-db-");
    db = createDb(database.connectionString);
    heartbeat = heartbeatService(db);
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    vi.stubGlobal("fetch", (url: RequestInfo | URL, init?: RequestInit) => {
      const target = String(url);
      if (!target.startsWith("https://api.deepseek.com/")) throw new Error("Unexpected network request in SDK heartbeat fixture");
      return realFetch(target.replace("https://api.deepseek.com", origin), init);
    });
  }, 90_000);
  afterAll(async () => {
    if (db && heartbeat) {
      for (const run of await db.select().from(heartbeatRuns)) {
        if (["queued", "running"].includes(run.status)) await heartbeat.cancelRun(run.id, "SDK fixture cleanup");
      }
      await drainHeartbeatRunsToQuiescence(db, heartbeat);
    }
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await database?.cleanup();
    vi.unstubAllGlobals(); vi.unstubAllEnvs();
    if (home) await rm(home, { recursive: true, force: true });
  });
  async function agentFixture() {
    const companyId = randomUUID(), agentId = randomUUID(), owner = randomUUID();
    await db.insert(companies).values({ id: companyId, name: "SDK heartbeat fixture", issuePrefix: `S${companyId.replaceAll("-", "").slice(0, 5).toUpperCase()}`, requireBoardApprovalForNewAgents: false, defaultResponsibleUserId: owner });
    await db.insert(companyMemberships).values({ companyId, principalId: owner, principalType: "user", status: "active", membershipRole: "owner" });
    await db.insert(agents).values({ id: agentId, companyId, name: "DeepSeek fixture agent", role: "engineer", status: "idle", adapterType: "ai_sdk", createdByUserId: owner, adapterConfig: { model: "deepseek-exact-fixture", timeoutSec: 20 } });
    const connection = await aiConnectionService(db).save(companyId, owner, { provider: "openai", method: "api_key", vendorPresetId: "deepseek", routing: deepSeekRouting(), ownership: "personal", name: "Fixture DeepSeek", apiKey: "heartbeat-deepseek-fixture-key", agentIds: [], allAgents: true }, "heartbeat-deepseek-fixture-key");
    await db.update(agents).set({ runtimeConfig: { aiConnection: { provider: "openai", method: "api_key", mode: "delegated", ...connection } } }).where(eq(agents.id, agentId));
    return { companyId, agentId, owner };
  }
  async function finished(runId: string) {
    await heartbeat.waitForRunExecutionDrain(runId, { timeoutMs: 20_000 });
    await vi.waitFor(async () => expect((await heartbeat.getRun(runId))?.status).not.toMatch(/^(queued|running)$/), { timeout: 20_000 });
    return heartbeat.getRun(runId);
  }
  it("prepares vaulted credentials and persists the real SDK result through the heartbeat lifecycle", async () => {
    const fixture = await agentFixture();
    const queued = await heartbeat.invoke(fixture.agentId, "on_demand", {}, "manual", { actorType: "user", actorId: fixture.owner });
    expect(queued).not.toBeNull();
    const result = await finished(queued!.id);
    expect(result).toMatchObject({ status: "succeeded", runtimeMode: "legacy", exitCode: 0, resultJson: { status: "completed", steps: 1 } });
    expect(providerBodies).toHaveLength(1);
    expect(providerBodies[0].model).toBe("deepseek-exact-fixture");
    expect(JSON.stringify(providerBodies)).not.toContain("heartbeat-deepseek-fixture-key");
    expect(JSON.stringify(result)).not.toContain("heartbeat-deepseek-fixture-key");
  }, 40_000);
  it("settles operator Stop for an in-process SDK request without a child process", async () => {
    const fixture = await agentFixture();
    holdResponse = true; requestStarted = Promise.withResolvers<void>();
    const queued = await heartbeat.invoke(fixture.agentId, "on_demand", {}, "manual", { actorType: "user", actorId: fixture.owner });
    expect(queued).not.toBeNull();
    const startTimeout = setTimeout(() => requestStarted.reject(new Error("SDK provider did not start")), 15_000);
    try { await requestStarted.promise; } finally { clearTimeout(startTimeout); }
    await heartbeat.cancelRun(queued!.id, "Operator Stop fixture");
    const result = await finished(queued!.id);
    expect(result?.status).toBe("cancelled");
    expect(result?.resultJson).toMatchObject({ executionCancellation: { state: "acknowledged" } });
  }, 40_000);
});
