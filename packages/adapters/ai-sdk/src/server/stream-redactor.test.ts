import { describe, expect, it } from "vitest";
import { StreamRedactor } from "./stream-redactor.js";

describe("stream credential redaction", () => {
  it("handles every split boundary, repeated secrets and self-overlapping prefixes", () => {
    for (const secret of ["fixture-key", "aba", "aaaa", "x"]) {
      for (let split = 0; split <= secret.length; split += 1) {
        const redactor = new StreamRedactor([secret]);
        const output = redactor.push(`before ${secret.slice(0, split)}`) + redactor.push(`${secret.slice(split)} ${secret} after`) + redactor.finish();
        expect(output).toBe("before [REDACTED] [REDACTED] after");
      }
    }
  });
  it("does not leak an unfinished credential prefix at end of stream", () => {
    const redactor = new StreamRedactor(["fixture-private-key"]);
    expect(redactor.push("value fixture-pri") + redactor.finish()).toBe("value [REDACTED]");
  });
});
