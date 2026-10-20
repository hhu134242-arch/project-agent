import type { Resource } from "i18next";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";
import { assertValidLocaleMessages } from "./locale-validation";

export const DEFAULT_LOCALE = "en" as const;
export const supportedLocales = ["en", "zh-CN"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

// Unpublished locale files stay in the repository without becoming incomplete
// choices or increasing the runtime bundle. Feature bundles can use flat dotted
// semantic keys; each feature must ship both published languages.
const featureModules = import.meta.glob(["./features/*.en.json", "./features/*.zh-CN.json"], {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

function mergeMessages(target: Record<string, unknown>, source: unknown, prefix = "") {
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Locale messages must be objects");
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      mergeMessages(target, value, path);
    } else {
      if (path in target) throw new Error(`Duplicate translation key: ${path}`);
      target[path] = value;
    }
  }
}

export const localeMessages: Record<SupportedLocale, Record<string, unknown>> = { en: {}, "zh-CN": {} };
mergeMessages(localeMessages.en, en);
mergeMessages(localeMessages["zh-CN"], zhCN);
for (const [path, messages] of Object.entries(featureModules)) {
  const locale = path.endsWith(".zh-CN.json") ? "zh-CN" : "en";
  mergeMessages(localeMessages[locale], messages);
}
for (const locale of supportedLocales) {
  try {
    assertValidLocaleMessages(localeMessages[locale], localeMessages.en, locale);
  } catch (error) {
    throw new Error(`Invalid ${locale} locale messages: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export const i18nextResources: Resource = Object.fromEntries(
  supportedLocales.map((locale) => [locale, { translation: localeMessages[locale] }]),
) as Resource;
