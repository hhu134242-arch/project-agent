import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const presetsPath = path.join(root, "packages/shared/dist/ai-vendor-presets.js");

async function loadPresets() {
  if (!fs.existsSync(presetsPath)) {
    await import("node:child_process").then(({ execSync }) => {
      execSync("pnpm --filter @paperclipai/shared exec tsc -p tsconfig.json", { stdio: "inherit", cwd: root });
    });
  }
  const mod = await import(presetsPath);
  return mod.AI_VENDOR_PRESETS;
}

function appDefinitionFromPreset(preset) {
  return {
    schemaVersion: 1,
    slug: preset.id,
    name: preset.name,
    description: preset.description,
    categories: ["ai"],
    tags: ["model-provider"],
    branding: { logoUrl: `/brands/apps/${preset.id}.svg` },
    urlPatterns: [preset.urlPattern],
    docsUrl: preset.docsUrl,
    methods: [
      {
        key: "ai-api_key",
        label: `${preset.name} API key`,
        purpose: "ai",
        transport: "runtime_auth",
        auth: "api_key",
        ai: {
          provider: "openai",
          method: "api_key",
          vendorPresetId: preset.id,
          routing: {
            kind: "gateway",
            protocol: "chat",
            auth: "bearer",
            baseUrl: preset.baseUrl,
            models: preset.models.map(model => ({ ...model })),
          },
        },
        grantKinds: ["user", "organization"],
        ownershipModes: ["customer"],
        whenToUse: `Run an AI SDK agent using your authorized ${preset.name} account.`,
        guidanceMd: preset.guidanceMd,
        riskTier: "S3",
        credentialFields: [
          {
            key: "apiKey",
            label: "API key",
            type: "password",
            required: true,
            placeholder: preset.apiKeyPlaceholder,
            secret: true,
          },
        ],
        keyPlacement: { location: "env", name: "PAPERCLIP_AI_PROVIDER_KEY" },
        consoleLinks: { keys: preset.keysUrl, docs: preset.docsUrl },
      },
    ],
  };
}

const presets = await loadPresets();
const targets = [
  path.join(root, "packages/shared/src/app-definitions"),
  path.join(root, "scripts/app-definition-overrides"),
];
for (const preset of Object.values(presets)) {
  const json = JSON.stringify(appDefinitionFromPreset(preset), null, 2) + "\n";
  for (const dir of targets) {
    fs.writeFileSync(path.join(dir, `${preset.id}.json`), json);
  }
}
console.log(`Synced ${Object.keys(presets).length} AI vendor app definitions.`);
