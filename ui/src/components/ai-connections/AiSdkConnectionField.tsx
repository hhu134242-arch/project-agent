import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DEEPSEEK_MODELS, isAiSdkConnectionCompatible,
  type AiConnectionBinding, type AiManagedConnectionSummary, type AiRuntimeConnectionBinding,
} from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { aiConnectionsApi } from "@/api/ai-connections";
import { AiSdkModelField } from "@/adapters/ai-sdk/config-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AiProviderSetup } from "./AiProviderSetup";

const platforms = ["deepseek", "openai", "anthropic", "openrouter", "gateway"] as const;
type ApiPlatform = (typeof platforms)[number];
export function aiSdkPlatform(connection: AiManagedConnectionSummary): ApiPlatform {
  if (connection.vendorPresetId === "deepseek") return "deepseek";
  if (connection.routing?.kind === "gateway") return "gateway";
  if (connection.routing?.kind === "openrouter" || connection.provider === "openrouter") return "openrouter";
  return connection.provider === "anthropic" ? "anthropic" : "openai";
}
export function isUsableAiSdkConnection(connection: AiManagedConnectionSummary, companyId: string) {
  return connection.companyId === companyId && isAiSdkConnectionCompatible(connection)
    && connection.status === "connected" && !connection.unavailableReason;
}

/** Explicit account grants keep the API platform independent of CLI subscriptions. */
export function AiSdkConnectionField({ companyId, agentId, value, onChange, onClear, model = "", onModelChange, onValidityChange, readOnly = false }: {
  companyId: string;
  agentId?: string;
  value?: AiRuntimeConnectionBinding;
  onChange: (binding: AiRuntimeConnectionBinding) => void;
  onClear?: () => void;
  model?: string;
  onModelChange?: (model: string) => void;
  onValidityChange?: (valid: boolean) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const selectId = useId();
  const platformId = useId();
  const [connecting, setConnecting] = useState(false);
  const [platformChoice, setPlatformChoice] = useState<ApiPlatform>();
  const [saveError, setSaveError] = useState(false);
  const accounts = useQuery({ queryKey: ["ai-connections", companyId, agentId], queryFn: () => aiConnectionsApi.list(companyId, agentId) });
  const bound = value && (value.mode === "shared" || value.mode === "delegated")
    ? accounts.data?.connections.find(connection => connection.id === value.connectionId && connection.grantId === value.grantId)
    : undefined;
  const platform = platformChoice ?? (bound ? aiSdkPlatform(bound) : "deepseek");
  const connections = (accounts.data?.connections ?? []).filter(connection => isUsableAiSdkConnection(connection, companyId) && aiSdkPlatform(connection) === platform);
  const selected = bound && value && value.mode !== "router" && value.mode !== "responsible_user"
    && value.provider === bound.provider && value.method === "api_key"
    && value.mode === (bound.ownership === "shared" ? "shared" : "delegated")
    ? connections.find(connection => connection.id === bound.id && connection.grantId === bound.grantId) : undefined;
  const models = selected?.routing?.models.length ? selected.routing.models : selected?.vendorPresetId === "deepseek" ? DEEPSEEK_MODELS : [];
  const valid = accounts.isSuccess && Boolean(selected) && Boolean(model.trim());
  useEffect(() => { onValidityChange?.(valid); }, [valid, onValidityChange]);
  // Cancel restores the saved connection and platform together.
  useEffect(() => { if (bound) setPlatformChoice(aiSdkPlatform(bound)); }, [bound?.id, bound?.grantId]);
  function select(connection: AiManagedConnectionSummary) {
    onChange({ provider: connection.provider, method: "api_key", mode: connection.ownership === "shared" ? "shared" : "delegated", connectionId: connection.id, grantId: connection.grantId } satisfies AiConnectionBinding);
    const catalog = connection.routing?.models.length ? connection.routing.models : connection.vendorPresetId === "deepseek" ? DEEPSEEK_MODELS : [];
    onModelChange?.(catalog[0]?.id ?? "");
    setSaveError(false);
  }
  return <div className="space-y-3">
    <label htmlFor={platformId} className="block text-sm font-medium">{t("platform.label")}</label>
    <select id={platformId} aria-label={t("platform.label")} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      disabled={readOnly} value={platform} onChange={event => {
        setPlatformChoice(event.target.value as ApiPlatform);
        onClear?.();
        onModelChange?.("");
        onValidityChange?.(false);
        setSaveError(false);
      }}>
      {platforms.map(id => <option key={id} value={id}>{t(`platform.${id}`)}</option>)}
    </select>
    <label htmlFor={selectId} className="block text-sm font-medium">{t("aiSdk.connection")}</label>
    <select id={selectId} aria-label={t("aiSdk.connection")} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      disabled={readOnly || accounts.isPending || accounts.isError} value={selected ? `${selected.id}:${selected.grantId}` : ""}
      onChange={event => {
        const connection = connections.find(item => `${item.id}:${item.grantId}` === event.target.value);
        if (connection) select(connection);
        else { onClear?.(); onModelChange?.(""); onValidityChange?.(false); }
      }}>
      <option value="">{t(accounts.isPending ? "aiSdk.connectionLoading" : "aiSdk.chooseConnection")}</option>
      {connections.map(connection => <option key={`${connection.id}:${connection.grantId}`} value={`${connection.id}:${connection.grantId}`}>
        {connection.name} · {t(connection.ownership === "shared" ? "provider.shared" : "provider.personal")}
      </option>)}
    </select>
    {accounts.isError || saveError ? <p role="alert" className="text-sm text-destructive">{t("aiSdk.connectionLoadError")} <Button type="button" variant="ghost" onClick={() => { setSaveError(false); void accounts.refetch(); }}>{t("modelUi.retry")}</Button></p>
      : value && !selected && !accounts.isPending ? <p role="alert" className="text-sm text-destructive">{t("aiSdk.connectionUnavailable")}</p>
      : !accounts.isPending && connections.length === 0 ? <p className="text-sm text-muted-foreground">{t("aiSdk.noConnections", { platform: t(`platform.${platform}`) })}</p> : null}
    <Button type="button" variant="outline" disabled={readOnly || accounts.isPending || accounts.isError} onClick={() => setConnecting(true)}>{t("aiSdk.addConnection", { platform: t(`platform.${platform}`) })}</Button>
    {onModelChange && <AiSdkModelField value={model} onChange={onModelChange} models={models} disabled={readOnly || !selected || accounts.isError} />}
    <p className="text-xs text-muted-foreground">{t("aiSdk.nextRun")}</p>
    <Dialog open={connecting} onOpenChange={setConnecting}>
      <DialogContent className="max-h-(--sz-85vh) overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{t("aiSdk.addConnection", { platform: t(`platform.${platform}`) })}</DialogTitle><DialogDescription>{t("aiSdk.description")}</DialogDescription></DialogHeader>
        {connecting && <AiProviderSetup key={platform} companyId={companyId} agentId={agentId} initialProvider={platform} apiKeyOnly onCancel={() => setConnecting(false)}
          onComplete={async binding => {
            const result = await accounts.refetch();
            const created = result.data?.connections.find(item => item.id === binding.connectionId && item.grantId === binding.grantId);
            if (created && isUsableAiSdkConnection(created, companyId) && aiSdkPlatform(created) === platform) select(created);
            else { onClear?.(); onModelChange?.(""); setSaveError(true); }
            setConnecting(false);
          }} />}
      </DialogContent>
    </Dialog>
  </div>;
}
