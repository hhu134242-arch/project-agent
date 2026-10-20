import { DEFAULT_LOCALE, type SupportedLocale } from "./locales";

export type LanguagePreference = "auto" | SupportedLocale;
export interface LanguagePreferenceSnapshot {
  preference: LanguagePreference;
  locale: SupportedLocale;
  userId: string | null;
}

export function languagePreferenceKey(userId: string | null) {
  // localStorage already isolates the instance by origin. Never include a company:
  // this is a person's display preference across all their organizations.
  return `paperclip.localePreference.${userId === null ? "anonymous" : `user:${encodeURIComponent(userId)}`}`;
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === "auto" || value === "en" || value === "zh-CN";
}

export function resolveLanguage(preference: LanguagePreference, languages: readonly string[]): SupportedLocale {
  if (preference !== "auto") return preference;
  for (const language of languages) {
    const normalized = language.toLowerCase().replaceAll("_", "-");
    // Traditional Chinese is unpublished. Do not silently label it Simplified.
    if (/^zh(?:-hans(?:-.+)?|-cn|-sg)?$/.test(normalized)) return "zh-CN";
    if (/^en(?:-.+)?$/.test(normalized)) return "en";
  }
  return DEFAULT_LOCALE;
}

export function createLanguagePreferenceStore(environment: {
  storage?: Pick<Storage, "getItem" | "setItem">;
  languages: () => readonly string[];
}) {
  const inMemory = new Map<string, LanguagePreference>();
  const listeners = new Set<() => void>();
  function read(userId: string | null): LanguagePreference {
    const key = languagePreferenceKey(userId);
    if (inMemory.has(key)) return inMemory.get(key)!;
    try {
      const saved = environment.storage?.getItem(key);
      if (isLanguagePreference(saved)) return saved;
    } catch { /* Privacy modes can deny storage; keep an in-memory preference. */ }
    return "auto";
  }
  let snapshot: LanguagePreferenceSnapshot = {
    preference: read(null),
    locale: resolveLanguage(read(null), environment.languages()),
    userId: null,
  };
  function apply(preference: LanguagePreference, userId = snapshot.userId) {
    const locale = resolveLanguage(preference, environment.languages());
    if (snapshot.preference === preference && snapshot.locale === locale && snapshot.userId === userId) return;
    snapshot = { preference, locale, userId };
    listeners.forEach((listener) => listener());
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    bindUser(userId: string | null) { apply(read(userId), userId); },
    setPreference(preference: LanguagePreference) {
      if (!isLanguagePreference(preference)) return;
      const key = languagePreferenceKey(snapshot.userId);
      inMemory.set(key, preference);
      try { environment.storage?.setItem(key, preference); } catch { /* Retain memory fallback. */ }
      apply(preference);
    },
    syncStorage(key: string | null, value: string | null) {
      // A different tab/account's choice cannot change this account's language.
      if (key !== null && !key.startsWith("paperclip.localePreference.")) return;
      const preference = isLanguagePreference(value) ? value : "auto";
      if (key === null) inMemory.clear();
      else inMemory.set(key, preference);
      if (key === null || key === languagePreferenceKey(snapshot.userId)) apply(preference);
    },
    refreshBrowserLanguages() { apply(snapshot.preference); },
  };
}

function browserStorage() {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}

export const languagePreferenceStore = createLanguagePreferenceStore({
  storage: browserStorage(),
  languages: () => typeof navigator === "undefined" ? [] : navigator.languages,
});

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    // sessionStorage notifications are unrelated to language preference.
    if (event.storageArea && event.storageArea !== browserStorage()) return;
    languagePreferenceStore.syncStorage(event.key, event.newValue);
  });
  window.addEventListener("languagechange", () => languagePreferenceStore.refreshBrowserLanguages());
}
