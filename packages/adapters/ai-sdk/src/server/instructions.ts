import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import path from "node:path";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import { AiSdkConfigurationError, sanitizeOutput } from "./config.js";

const MAX_FILE_BYTES = 128_000;
async function readBoundedFile(filePath: string): Promise<string> {
  const file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error("Instruction file must be a regular file no larger than 128 KB.");
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_FILE_BYTES) throw new Error("Instruction file is too large.");
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally { await file.close(); }
}

/** The server resolves this inventory; the model selects a skill key and a contained resource, never a host path. */
export async function loadInstructions(config: Record<string, unknown>, signal: AbortSignal, secrets: readonly string[]): Promise<{ prompt: string; tools: ToolSet }> {
  const instructionPath = asString(config.instructionsFilePath, "").trim();
  let instructions = "";
  if (instructionPath) {
    if (!path.isAbsolute(instructionPath)) throw new AiSdkConfigurationError("The server must resolve an absolute agent instructions path.");
    try { signal.throwIfAborted(); instructions = await readBoundedFile(await realpath(instructionPath)); }
    catch { signal.throwIfAborted(); throw new AiSdkConfigurationError("The configured agent instructions could not be read safely."); }
  }
  const entries = Array.isArray(config.paperclipRuntimeSkills) ? config.paperclipRuntimeSkills : [];
  const inventory = new Map<string, { name: string; root: string; description: string }>();
  for (const raw of entries) {
    signal.throwIfAborted();
    const entry = parseObject(raw);
    const key = asString(entry.key, ""); const source = asString(entry.source, "");
    if (!key || !path.isAbsolute(source)) throw new AiSdkConfigurationError("An assigned skill is missing a valid server-resolved source.");
    try {
      const root = await realpath(source);
      const file = await realpath(path.join(root, "SKILL.md"));
      if (!file.startsWith(root + path.sep)) throw new Error("Skill entry escapes its source directory.");
      const markdown = await readBoundedFile(file);
      const description = markdown.match(/^description:\s*(.+)$/m)?.[1]?.slice(0, 400) ?? "Assigned task procedure";
      inventory.set(key, { name: asString(entry.runtimeName, key), root, description });
    } catch { throw new AiSdkConfigurationError("An assigned skill could not be loaded safely. Restore the skill or remove its assignment."); }
  }
  const prompt = sanitizeOutput([
    instructions ? `## Agent instructions\n\n${instructions}` : "",
    inventory.size ? `## Assigned skills\nUse paperclip_read_skill to load a relevant skill and its contained text resources before following that procedure. Shell commands and filesystem writes described by a skill are unavailable; use only the provided API/MCP tools.\n${[...inventory].map(([key, value]) => `- ${key}: ${value.description}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n"), secrets);
  const tools: ToolSet = inventory.size ? {
    paperclip_read_skill: tool({
      description: "Read an assigned skill procedure or a text reference contained in that skill directory. This cannot access project files or arbitrary host paths.",
      inputSchema: z.object({ skill: z.enum([...inventory.keys()] as [string, ...string[]]), resource: z.string().max(500).default("SKILL.md") }),
      execute: async ({ skill, resource }) => {
        signal.throwIfAborted();
        const entry = inventory.get(skill)!;
        if (path.isAbsolute(resource) || resource.split(/[\\/]/).some((part) => part === "..") || resource.includes("\0")) throw new Error("Skill resource must remain inside its assigned directory.");
        try {
          const target = await realpath(path.resolve(entry.root, resource));
          if (!target.startsWith(entry.root + path.sep)) throw new Error("Skill resource escapes its assigned directory.");
          const text = await readBoundedFile(target);
          signal.throwIfAborted();
          if (text.includes("\0")) throw new Error("Skill resource is not text.");
          return { skill, resource, text: sanitizeOutput(text, secrets) };
        } catch { signal.throwIfAborted(); throw new Error("The skill resource is unavailable or outside the assigned skill directory."); }
      },
    }),
  } : {};
  return { prompt, tools };
}
