import type { CreateConfigValues, TranscriptEntry } from "@paperclipai/adapter-utils";

export function buildAiSdkConfig(values: CreateConfigValues): Record<string, unknown> {
  return { model: values.model, ...(values.promptTemplate ? { promptTemplate: values.promptTemplate } : {}), maxSteps: 20, timeoutSec: 300 };
}
export function parseAiSdkStdoutLine(line: string, ts: string): TranscriptEntry[] {
  let event: Record<string, unknown>;
  try { event = JSON.parse(line); } catch { return []; }
  if (!event || typeof event !== "object") return [];
  if (event.type === "init" && typeof event.model === "string" && typeof event.sessionId === "string") return [{ kind: "init", ts, model: event.model, sessionId: event.sessionId }];
  if (event.type === "text-delta" && typeof event.text === "string") return [{ kind: "assistant", ts, text: event.text, delta: true }];
  if (event.type === "tool-call" && typeof event.toolName === "string" && typeof event.toolCallId === "string") return [{ kind: "tool_call", ts, name: event.toolName, input: event.input, toolUseId: event.toolCallId }];
  if ((event.type === "tool-result" || event.type === "tool-error") && typeof event.toolCallId === "string") return [{ kind: "tool_result", ts, toolUseId: event.toolCallId, content: typeof event.output === "string" ? event.output : JSON.stringify(event.output) ?? "", isError: event.type === "tool-error" }];
  if (event.type === "error" && typeof event.message === "string") return [{ kind: "stderr", ts, text: event.message }];
  if (event.type === "status" && typeof event.message === "string") return [{ kind: "system", ts, text: event.message }];
  return [];
}
