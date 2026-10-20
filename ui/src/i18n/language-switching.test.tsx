// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n, useTranslation } from ".";
import { LanguageSelect } from "@/components/LanguageSelect";
import { LanguagePreferenceProvider } from "@/context/LanguagePreferenceContext";
import { languagePreferenceKey, languagePreferenceStore } from "./preferences";
import { formatCents, formatDate, formatDurationMs, formatProjectBudget, relativeTime } from "@/lib/utils";

const identity = vi.hoisted(() => ({ userId: null as string | null, settled: true, failed: false }));
vi.mock("@/api/companies-query", () => ({ useAccountIdentity: () => identity }));
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function Page() {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  return <>
    <LanguageSelect />
    <h1>{t("app.noCompanies.title")}</h1>
    <p>{t("settings.profile.uploadStorage", { company: "Acme" })}</p>
    <output>{formatCents(12345)} | {formatDate("2026-10-20T12:00:00Z")}</output>
    <textarea aria-label="draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
  </>;
}

let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  identity.userId = null;
  identity.settled = true;
  window.localStorage.clear();
  languagePreferenceStore.syncStorage(null, null);
  languagePreferenceStore.bindUser(null);
  languagePreferenceStore.setPreference("en");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  languagePreferenceStore.setPreference("en");
});

describe("live language switching with real published resources", () => {
  it("updates copy, interpolation, formats and HTML lang without discarding a draft", async () => {
    await act(async () => root.render(<Page />));
    expect(container.querySelector("h1")?.textContent).toBe("Create your first organization");
    const draft = container.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(draft, "Keep my task draft");
      draft.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const select = container.querySelector("select")!;
    await act(async () => {
      select.value = "zh-CN";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector("h1")?.textContent).toBe("创建您的第一个组织");
    expect(container.textContent).toContain("保存在 Acme 的 Paperclip 文件存储中。");
    expect(container.textContent).toContain("US$123.45");
    expect(container.textContent).toContain("2026年10月20日");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(container.querySelector("textarea")).toBe(draft);
    expect(draft.value).toBe("Keep my task draft");
    expect(window.localStorage.getItem(languagePreferenceKey(null))).toBe("zh-CN");
    await act(async () => languagePreferenceStore.setPreference("en"));
    expect(document.documentElement.lang).toBe("en");
    expect(draft.value).toBe("Keep my task draft");
  });

  it("binds authenticated account preferences without remounting the form", async () => {
    window.localStorage.setItem(languagePreferenceKey("chinese-user"), "zh-CN");
    window.localStorage.setItem(languagePreferenceKey("english-user"), "en");
    identity.userId = "chinese-user";
    await act(async () => root.render(<LanguagePreferenceProvider><Page /></LanguagePreferenceProvider>));
    const draft = container.querySelector("textarea");
    expect(i18n.resolvedLanguage).toBe("zh-CN");
    identity.userId = "english-user";
    await act(async () => root.render(<LanguagePreferenceProvider><Page /></LanguagePreferenceProvider>));
    expect(i18n.resolvedLanguage).toBe("en");
    expect(container.querySelector("textarea")).toBe(draft);
    identity.settled = false;
    identity.userId = null;
    await act(async () => root.render(<LanguagePreferenceProvider><Page /></LanguagePreferenceProvider>));
    expect(languagePreferenceStore.getSnapshot().userId).toBe("english-user");
  });

  it("reacts to other tabs through the storage event", async () => {
    await act(async () => root.render(<Page />));
    await act(async () => window.dispatchEvent(new StorageEvent("storage", {
      key: languagePreferenceKey(null), newValue: "zh-CN",
    })));
    expect(container.querySelector("select")?.value).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  it("keeps USD/cents and UTC budget semantics when presentation changes", async () => {
    await i18n.changeLanguage("zh-CN");
    expect(formatCents(12345, "USD")).toBe("US$123.45");
    expect(formatCents(12345, "EUR")).toBe("€123.45");
    expect(formatProjectBudget({ amountCents: 12345, windowKind: "calendar_month_utc" })).toBe("US$123.45/月");
    expect(formatProjectBudget({ amountCents: 12345, windowKind: "lifetime" })).toBe("US$123.45");
    expect(formatDurationMs(62_000)).toBe("1分 2秒");
    expect(relativeTime(new Date(Date.now() - 120_000))).toBe("2 分钟前");
    await i18n.changeLanguage("en");
    expect(formatDurationMs(62_000)).toBe("1m 2s");
  });
});
