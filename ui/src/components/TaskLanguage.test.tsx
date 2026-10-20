// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { i18n } from "@/i18n";
import { IssueStatusBadge, AgentStatusBadge } from "./StatusBadge";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { RunActivityChart } from "./ActivityCharts";

it("updates actual status, priority and dashboard chart resources on a live language switch", async () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<>
      <IssueStatusBadge status="in_progress" /><AgentStatusBadge status="running" />
      <StatusIcon status="todo" onChange={() => {}} showLabel />
      <PriorityIcon priority="high" onChange={() => {}} showLabel />
      <RunActivityChart activity={[{ date: "2026-10-20", succeeded: 1, failed: 0, recovered: 0, other: 0, total: 1, failedByErrorCode: {} }]} />
    </>));
    expect(container.textContent).toContain("In progress");
    await act(async () => { await i18n.changeLanguage("zh-CN"); });
    expect(container.textContent).toContain("进行中");
    expect(container.textContent).toContain("运行中");
    expect(container.textContent).toContain("成功");
    expect(container.querySelector('button[aria-label="更改状态（当前：待办）"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="更改优先级（当前：高）"]')).not.toBeNull();
    expect(container.querySelector('[title*="1 次执行"]')).not.toBeNull();
  } finally {
    await act(async () => { root.unmount(); await i18n.changeLanguage("en"); });
  }
});
