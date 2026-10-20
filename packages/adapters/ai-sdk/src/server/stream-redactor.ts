import { sanitizeOutput } from "./config.js";

/** Retain partial credential prefixes across provider deltas before writing any output. */
export class StreamRedactor {
  private pending = "";
  constructor(private readonly secrets: readonly string[]) {}
  push(text: string): string {
    this.pending = sanitizeOutput(this.pending + text, this.secrets);
    let retained = 0;
    for (const secret of this.secrets) {
      for (let length = Math.min(secret.length - 1, this.pending.length); length > retained; length -= 1) {
        if (this.pending.endsWith(secret.slice(0, length))) { retained = length; break; }
      }
    }
    const output = this.pending.slice(0, this.pending.length - retained);
    this.pending = retained ? this.pending.slice(-retained) : "";
    return sanitizeOutput(output, this.secrets);
  }
  finish(): string {
    // A provider ending midway through a credential must not reveal that prefix.
    const output = this.pending ? "[REDACTED]" : "";
    this.pending = "";
    return output;
  }
}
