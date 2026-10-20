import { describe, expect, it } from "vitest";
import { APP_DEFINITIONS } from "./app-definitions.generated.js";
import {
  AI_VENDOR_PRESET_IDS,
  AI_VENDOR_PRESETS,
  isVendorPresetRouting,
  vendorPresetRouting,
} from "./ai-vendor-presets.js";

describe("ai-vendor-presets", () => {
  it("defines a gateway preset for every catalog vendor", () => {
    for (const id of AI_VENDOR_PRESET_IDS) {
      const preset = AI_VENDOR_PRESETS[id];
      const routing = vendorPresetRouting(id);
      expect(isVendorPresetRouting(id, routing)).toBe(true);
      expect(preset.models.length).toBeGreaterThan(0);
      expect(preset.baseUrl.startsWith("https://")).toBe(true);
    }
  });

  it("keeps app definitions aligned with preset routing", () => {
    for (const id of AI_VENDOR_PRESET_IDS) {
      const app = APP_DEFINITIONS.find(entry => entry.slug === id);
      expect(app, id).toBeDefined();
      const method = app!.methods.find(entry => entry.key === "ai-api_key");
      expect(method?.ai?.vendorPresetId).toBe(id);
      expect(isVendorPresetRouting(id, method!.ai!.routing!)).toBe(true);
    }
  });
});
