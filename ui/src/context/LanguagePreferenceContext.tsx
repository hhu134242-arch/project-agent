import { useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { useAccountIdentity } from "@/api/companies-query";
import { languagePreferenceStore } from "@/i18n/preferences";
import "@/i18n";

/** Rebind only once authentication answered; a network failure is not a sign-out. */
export function LanguagePreferenceProvider({ children }: { children: ReactNode }) {
  const { userId, settled } = useAccountIdentity();
  useLayoutEffect(() => {
    if (settled) languagePreferenceStore.bindUser(userId);
  }, [userId, settled]);
  return children;
}

export function useLanguagePreference() {
  const snapshot = useSyncExternalStore(
    languagePreferenceStore.subscribe,
    languagePreferenceStore.getSnapshot,
    languagePreferenceStore.getSnapshot,
  );
  return { ...snapshot, setPreference: languagePreferenceStore.setPreference };
}
