import { describe, expect, it } from "vitest";
import { createLanguagePreferenceStore, languagePreferenceKey, resolveLanguage } from "./preferences";

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}

describe("language preferences", () => {
  it.each([
    ["auto", ["zh-CN"], "zh-CN"],
    ["auto", ["zh-Hans-SG"], "zh-CN"],
    ["auto", ["zh"], "zh-CN"],
    ["auto", ["fr-FR", "zh-SG", "en"], "zh-CN"],
    ["auto", ["zh-TW", "zh-Hant", "ja"], "en"],
    ["auto", ["en-GB", "zh-CN"], "en"],
    ["auto", [], "en"],
    ["en", ["zh-CN"], "en"],
    ["zh-CN", ["en"], "zh-CN"],
  ] as const)("resolves %s with %j to %s", (preference, languages, expected) => {
    expect(resolveLanguage(preference, languages)).toBe(expected);
  });

  it("restores saved preferences and isolates accounts from each other and anonymous", () => {
    const persisted = storage({ [languagePreferenceKey(null)]: "en" });
    const firstTab = createLanguagePreferenceStore({ storage: persisted, languages: () => ["zh-CN"] });
    firstTab.bindUser("user-a");
    firstTab.setPreference("zh-CN");
    firstTab.bindUser("user-b");
    expect(firstTab.getSnapshot().preference).toBe("auto");
    firstTab.setPreference("en");
    firstTab.bindUser("user-a");
    expect(firstTab.getSnapshot().preference).toBe("zh-CN");
    firstTab.bindUser(null);
    expect(firstTab.getSnapshot().preference).toBe("en");
    const refreshedTab = createLanguagePreferenceStore({ storage: persisted, languages: () => ["en"] });
    refreshedTab.bindUser("user-a");
    expect(refreshedTab.getSnapshot().locale).toBe("zh-CN");
  });

  it("syncs this account across tabs and applies other accounts only when they become active", () => {
    const state = createLanguagePreferenceStore({ storage: storage(), languages: () => ["en"] });
    state.bindUser("user-a");
    state.setPreference("en");
    state.bindUser("user-b");
    state.syncStorage(languagePreferenceKey("user-a"), "zh-CN");
    expect(state.getSnapshot().locale).toBe("en");
    state.bindUser("user-a");
    expect(state.getSnapshot().locale).toBe("zh-CN");
    state.syncStorage(languagePreferenceKey("user-a"), "en");
    expect(state.getSnapshot().locale).toBe("en");
    state.syncStorage(languagePreferenceKey("user-a"), null);
    expect(state.getSnapshot().preference).toBe("auto");
  });

  it("uses in-memory settings when reads and writes are denied", () => {
    const state = createLanguagePreferenceStore({
      storage: { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } },
      languages: () => ["en"],
    });
    state.bindUser("user-a");
    state.setPreference("zh-CN");
    state.bindUser("user-b");
    expect(state.getSnapshot().locale).toBe("en");
    state.bindUser("user-a");
    expect(state.getSnapshot().locale).toBe("zh-CN");
  });

  it("follows browser changes only in auto and ignores corrupt saved values", () => {
    let languages = ["en"];
    const state = createLanguagePreferenceStore({
      storage: storage({ [languagePreferenceKey(null)]: "unpublished-language" }),
      languages: () => languages,
    });
    languages = ["zh-CN"];
    state.refreshBrowserLanguages();
    expect(state.getSnapshot().locale).toBe("zh-CN");
    state.setPreference("en");
    state.refreshBrowserLanguages();
    expect(state.getSnapshot().locale).toBe("en");
  });
});
