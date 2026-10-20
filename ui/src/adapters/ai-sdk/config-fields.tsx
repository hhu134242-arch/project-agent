import { useId } from "react";
import { useTranslation } from "@/i18n";
import { Field, DraftInput } from "@/components/agent-config-primitives";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AdapterConfigFieldsProps } from "../types";

/** Native datalist keeps the curated models and arbitrary provider IDs equally accessible. */
export function AiSdkModelField({ value, onChange, disabled = false, models = [] }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  models?: readonly { id: string; label?: string }[];
}) {
  const { t } = useTranslation();
  const listId = useId();
  return <Field label={t("aiSdk.model")} hint={t("aiSdk.modelHint")}>
    <Input aria-label={t("aiSdk.model")} list={listId} value={value} required disabled={disabled}
      placeholder={models[0]?.id ?? t("platform.exactModelId")} onChange={event => onChange(event.target.value)} />
    <datalist id={listId}>{models.map(model => <option key={model.id} value={model.id}>{model.label ?? model.id}</option>)}</datalist>
  </Field>;
}

export function AiSdkConfigFields({ section, isCreate, values, set, config, eff, mark, managedSandboxOnly, hideModel, models }: AdapterConfigFieldsProps) {
  const { t } = useTranslation();
  const model = isCreate ? values!.model : eff("adapterConfig", "model", String(config.model ?? ""));
  const prompt = isCreate ? values!.promptTemplate : eff("adapterConfig", "promptTemplate", String(config.promptTemplate ?? ""));
  if (section && !["adapter", "configuration"].includes(section)) return null;
  return <>
    {(!section || section === "adapter") && <>
      {!hideModel && <AiSdkModelField models={models} value={model} onChange={value => isCreate ? set!({ model: value }) : mark("adapterConfig", "model", value)} />}
      <p className="text-sm text-muted-foreground">{t("aiSdk.capabilities")}</p>
      <p role={managedSandboxOnly ? "alert" : undefined} className={managedSandboxOnly ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
        {t(managedSandboxOnly ? "aiSdk.environmentUnavailable" : "aiSdk.localOnly")}
      </p>
    </>}
    {(!section || section === "configuration") && <>
      <Field label={t("aiSdk.instructions")} hint={t("aiSdk.instructionsHint")}>
        <Textarea aria-label={t("aiSdk.instructions")} value={prompt} rows={5}
          onChange={event => isCreate ? set!({ promptTemplate: event.target.value }) : mark("adapterConfig", "promptTemplate", event.target.value)} />
      </Field>
      {!isCreate && <Field label={t("aiSdk.maxSteps")} hint={t("aiSdk.maxStepsHint")}>
        <DraftInput type="number" min={1} max={50} aria-label={t("aiSdk.maxSteps")}
          value={String(eff("adapterConfig", "maxSteps", config.maxSteps ?? 20))}
          onCommit={value => mark("adapterConfig", "maxSteps", Number(value))}
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm" />
      </Field>}
    </>}
  </>;
}
