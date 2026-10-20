// @vitest-environment jsdom
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { DEEPSEEK_MODELS, deepSeekRouting } from "@paperclipai/shared";
import { i18n } from "@/i18n";
import { api, envApi, settings, secrets, state, managedApi, container, settle, click, fill, render } from "./NewAgent.test-support";

const connection = {
  id: "00000000-0000-4000-8000-000000000021", grantId: "00000000-0000-4000-8000-000000000022", companyId: "company-1",
  vendorPresetId: "deepseek", provider: "openai", method: "api_key", name: "Team DeepSeek", ownership: "shared", status: "connected", routing: deepSeekRouting(),
};
async function selectDeepSeek() {
  const select = container.querySelector('select[aria-label="API account"]') as HTMLSelectElement;
  await act(async () => { select.value = `${connection.id}:${connection.grantId}`; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await settle();
}
function prepare() {
  state.adapters.push({ type: "ai_sdk", loaded: true, disabled: false });
  managedApi.list.mockResolvedValue({ currentUserId: "user-1", canManageConnections: true, connections: [connection] } as any);
}
afterEach(async () => { await act(async () => { await i18n.changeLanguage("en"); }); });

it("tests the exact DeepSeek model and managed grant before saving the agent without raw credentials", async () => {
  prepare(); await render("ai_sdk");
  const finish = [...container.querySelectorAll("button")].find(button => button.textContent?.trim() === "Finish setup")!;
  expect(finish.disabled).toBe(true);
  await selectDeepSeek();
  await fill("Model", "deepseek-custom-model");
  await click("Finish setup");
  expect(api.testEnvironment).toHaveBeenCalledWith("company-1", "ai_sdk", expect.objectContaining({
    adapterConfig: expect.objectContaining({ model: "deepseek-custom-model" }),
    aiConnection: expect.objectContaining({ mode: "shared", connectionId: connection.id, grantId: connection.grantId }),
  }));
  expect(api.hire).toHaveBeenCalledWith("company-1", expect.objectContaining({
    adapterType: "ai_sdk", adapterConfig: expect.objectContaining({ model: "deepseek-custom-model" }),
    runtimeConfig: expect.objectContaining({ aiConnection: expect.objectContaining({ connectionId: connection.id, grantId: connection.grantId }) }),
  }));
  expect(api.hire.mock.calls[0][1].adapterConfig).not.toHaveProperty("apiKey");
  expect(secrets.create).not.toHaveBeenCalled();
});

it("keeps the selected connection and custom model when switching the interface to Chinese", async () => {
  prepare(); await render("ai_sdk"); await selectDeepSeek(); await fill("Model", "deepseek-custom-model");
  await act(async () => { await i18n.changeLanguage("zh-CN"); });
  expect(container.textContent).toContain("配置你的 Agent");
  expect((container.querySelector('input[aria-label="模型"]') as HTMLInputElement).value).toBe("deepseek-custom-model");
  expect((container.querySelector('select[aria-label="API 账户"]') as HTMLSelectElement).value).toBe(`${connection.id}:${connection.grantId}`);
  await click("完成设置");
  expect(api.hire).toHaveBeenCalledWith("company-1", expect.objectContaining({ adapterConfig: expect.objectContaining({ model: "deepseek-custom-model" }) }));
});

it("blocks the sandbox default until the user explicitly selects a local environment", async () => {
  prepare();
  envApi.list.mockResolvedValue([
    { id: "sandbox-1", name: "Remote", status: "active", driver: "sandbox", config: { provider: "daytona" } },
    { id: "local-1", name: "Local", status: "active", driver: "local", config: {} },
  ]);
  settings.get.mockResolvedValue({ defaultEnvironmentId: "sandbox-1" });
  await render("ai_sdk"); await selectDeepSeek();
  expect(container.textContent).toContain("API models cannot run in the selected environment");
  await click("Finish setup"); expect(api.hire).not.toHaveBeenCalled(); expect(api.testEnvironment).not.toHaveBeenCalled();
  const select = container.querySelector('select[aria-label="Environment"]') as HTMLSelectElement;
  await act(async () => { select.value = "local-1"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await settle(); await click("Finish setup");
  expect(api.hire).toHaveBeenCalledWith("company-1", expect.objectContaining({ defaultEnvironmentId: "local-1", adapterConfig: expect.objectContaining({ model: DEEPSEEK_MODELS[0].id }) }));
});

it("keeps custom gateways separate from the DeepSeek platform", async () => {
  prepare();
  managedApi.list.mockResolvedValue({ currentUserId: "user-1", canManageConnections: true, connections: [{ ...connection, vendorPresetId: undefined, name: "Unmarked gateway" }] } as any);
  await render("ai_sdk");
  const select = container.querySelector('select[aria-label="API account"]') as HTMLSelectElement;
  expect(select.options.length).toBe(1);
  expect(container.textContent).toContain("Add your DeepSeek API key");
  expect(api.hire).not.toHaveBeenCalled();
});

async function choose(label: string, value: string) {
  const select = container.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
  await act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await settle();
}

it("clears the old account and model when changing API platform and submits only the new selection", async () => {
  prepare();
  const openai = { ...connection, id: "00000000-0000-4000-8000-000000000031", grantId: "00000000-0000-4000-8000-000000000032", vendorPresetId: undefined, routing: undefined, name: "OpenAI account" };
  managedApi.list.mockResolvedValue({ currentUserId: "user-1", canManageConnections: true, connections: [connection, openai] } as any);
  await render("ai_sdk"); await selectDeepSeek(); await fill("Model", "deepseek-custom");
  await choose("API platform", "openai");
  expect((container.querySelector('select[aria-label="API account"]') as HTMLSelectElement).value).toBe("");
  expect((container.querySelector('input[aria-label="Model"]') as HTMLInputElement).value).toBe("");
  await click("Finish setup"); expect(api.hire).not.toHaveBeenCalled(); expect(api.testEnvironment).not.toHaveBeenCalled();
  await choose("API account", `${openai.id}:${openai.grantId}`);
  expect(container.querySelectorAll("datalist option")).toHaveLength(0);
  await click("Finish setup"); expect(api.hire).not.toHaveBeenCalled();
  await fill("Model", "exact-upstream-model"); await click("Finish setup");
  expect(api.testEnvironment).toHaveBeenCalledWith("company-1", "ai_sdk", expect.objectContaining({
    adapterConfig: expect.objectContaining({ model: "exact-upstream-model" }),
    aiConnection: expect.objectContaining({ connectionId: openai.id, provider: "openai", method: "api_key" }),
  }));
  expect(api.hire).toHaveBeenCalledWith("company-1", expect.objectContaining({ runtimeConfig: expect.objectContaining({ aiConnection: expect.objectContaining({ connectionId: openai.id }) }) }));
});

it("uses the selected custom account's model directory and filters subscriptions, private and local endpoints", async () => {
  prepare();
  const gateway = { ...connection, vendorPresetId: undefined, name: "Gateway", routing: { kind: "gateway", protocol: "chat", auth: "bearer", baseUrl: "https://gateway.example.com/v1", models: [{ id: "gateway-model", label: "Gateway model" }] } };
  const other = [
    { ...gateway, id: "local", routing: { ...gateway.routing, kind: "local", baseUrl: "http://localhost:11434/v1" } },
    { ...gateway, id: "private", routing: { ...gateway.routing, baseUrl: "https://127.0.0.1/v1" } },
    { ...gateway, id: "subscription", method: "subscription" },
    { ...gateway, id: "revoked", status: "revoked" },
  ];
  managedApi.list.mockResolvedValue({ currentUserId: "user-1", canManageConnections: true, connections: [gateway, ...other] } as any);
  await render("ai_sdk"); await choose("API platform", "gateway");
  const accounts = container.querySelector('select[aria-label="API account"]') as HTMLSelectElement;
  expect([...accounts.options].map(option => option.value)).toEqual(["", `${gateway.id}:${gateway.grantId}`]);
  await choose("API account", `${gateway.id}:${gateway.grantId}`);
  expect((container.querySelector('input[aria-label="Model"]') as HTMLInputElement).value).toBe("gateway-model");
  expect([...container.querySelectorAll("datalist option")].map(option => option.getAttribute("value"))).toEqual(["gateway-model"]);
  await click("Finish setup");
  expect(api.hire).toHaveBeenCalledWith("company-1", expect.objectContaining({ adapterConfig: expect.objectContaining({ model: "gateway-model" }) }));
});
