import i18n, { type InitOptions, type TOptions } from "i18next";
import { initReactI18next, useTranslation as useReactI18nextTranslation } from "react-i18next";

import { DEFAULT_LOCALE, i18nextResources, supportedLocales } from "./locales";
import { languagePreferenceStore } from "./preferences";

const i18nextOptions: InitOptions = {
  resources: i18nextResources,
  lng: languagePreferenceStore.getSnapshot().locale,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: [...supportedLocales],
  keySeparator: false,
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  returnObjects: false,
  initAsync: false,
};

void i18n.use(initReactI18next).init(i18nextOptions).catch((error: unknown) => {
  console.error("Failed to initialize i18next", error);
});

function applyDocumentLanguage() {
  if (typeof document !== "undefined") document.documentElement.lang = i18n.resolvedLanguage ?? DEFAULT_LOCALE;
}
applyDocumentLanguage();
i18n.on("languageChanged", applyDocumentLanguage);
languagePreferenceStore.subscribe(() => {
  void i18n.changeLanguage(languagePreferenceStore.getSnapshot().locale);
});

/** Formatting changes presentation only, preserving callers' currency and time zone. */
export function getFormattingLocale() {
  return i18n.resolvedLanguage === "zh-CN" ? "zh-CN" : "en-US";
}

export function t(key: string, options: TOptions = {}) {
  return i18n.t(key, options);
}

export const useTranslation = useReactI18nextTranslation;
export { i18n };
