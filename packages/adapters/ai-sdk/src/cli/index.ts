import pc from "picocolors";
import { parseAiSdkStdoutLine } from "../ui/index.js";

export function formatAiSdkStdoutEvent(line: string, debug: boolean): void {
  for (const event of parseAiSdkStdoutLine(line, "")) {
    if (event.kind === "assistant") process.stdout.write(event.text);
    else if (event.kind === "stderr") console.error(pc.red(event.text));
    else if (event.kind === "tool_call") console.log(pc.cyan(`\n${event.name}`), debug ? JSON.stringify(event.input) : "");
    else if (event.kind === "tool_result" && debug) console.log(event.content);
    else if (event.kind === "system") console.log(pc.dim(event.text));
  }
}
