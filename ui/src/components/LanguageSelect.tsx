import { useId } from "react";
import { useTranslation } from "@/i18n";
import { useLanguagePreference } from "@/context/LanguagePreferenceContext";
import { isLanguagePreference } from "@/i18n/preferences";
import { Label } from "@/components/ui/label";

/** Native select keeps language selection accessible before sign-in and on mobile. */
export function LanguageSelect({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { preference, setPreference } = useLanguagePreference();
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={compact ? "sr-only" : undefined}>{t("settings.language.label")}</Label>
      <select
        id={id}
        value={preference}
        onChange={(event) => {
          if (isLanguagePreference(event.target.value)) setPreference(event.target.value);
        }}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="auto">{t("settings.language.auto")}</option>
        <option value="en" lang="en">English</option>
        <option value="zh-CN" lang="zh-CN">简体中文</option>
      </select>
    </div>
  );
}
