import { useTranslation } from "@/i18n";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Network, Monitor } from "lucide-react";
import {
  AI_SDK_VENDOR_PRESET_IDS,
  AI_VENDOR_PRESETS,
  aiProviderRoutingSchema,
  isAiSdkRoutingCompatible,
  createAiConnectionSchema,
  isAiVendorPresetId,
  type AiProvider,
  type AiProviderRouting,
  type AiConnectionBinding,
  type AiManagedConnectionSummary,
} from "@paperclipai/shared";
import {
  AI_SDK_PLATFORM_IDS,
  isAiSdkGatewayVendor,
  vendorPresetConsoleKeysUrl,
  type AiSdkPlatformId,
} from "./ai-sdk-vendor-presets";
import { aiConnectionsApi } from "@/api/ai-connections";
import { agentsApi } from "@/api/agents";
import { ConnectionChoiceList } from "@/features/connections/ConnectionChoiceList";
import { ConnectionAccessDefaults, connectionDefaultSummarySentence } from "@/features/connections/ConnectionSetupFlow";
import { AppLogo } from "@/pages/apps/AppLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AiConnectionCredentialStep } from "./AiConnectionCredentialStep";

const gatewayVendorProviders = AI_SDK_VENDOR_PRESET_IDS.map(id => ({
  id,
  name: AI_VENDOR_PRESETS[id].name,
  description: AI_VENDOR_PRESETS[id].description,
}));

const providers = [
  ...gatewayVendorProviders,
  {
    id: "openai",
    name: "OpenAI",
    description: "ChatGPT subscription or API key",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude subscription or API key",
  },
  { id: "google", name: "Google", description: "Gemini API key" },
  { id: "xai", name: "xAI", description: "Grok subscription or API key" },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Models through one API key",
    advanced: true,
  },
  {
    id: "bedrock",
    name: "Amazon Bedrock",
    description: "Bedrock API key and AWS region",
    advanced: true,
  },
  {
    id: "gateway",
    name: "Custom gateway",
    description: "Emissary or another compatible endpoint",
    advanced: true,
  },
  {
    id: "local",
    name: "Local endpoint",
    description: "A model server in the agent’s environment",
    advanced: true,
  },
] as const;
type ProviderChoice =
  | AiSdkPlatformId
  | "google"
  | "xai"
  | "bedrock"
  | "local";

export function AiProviderSetup({
  companyId,
  agentId,
  environmentId,
  initialProvider,
  initialProtocol,
  providerLabel,
  advancedOnly = false,
  apiKeyOnly = false,
  reconnect,
  onCancel,
  onComplete,
}: {
  companyId: string;
  agentId?: string;
  environmentId?: string;
  initialProvider?: ProviderChoice;
  initialProtocol?: AiProviderRouting["protocol"];
  providerLabel?: string;
  advancedOnly?: boolean;
  apiKeyOnly?: boolean;
  reconnect?: AiManagedConnectionSummary;
  onCancel: () => void;
  onComplete: (
    binding: Exclude<AiConnectionBinding, { mode: "responsible_user" }>,
  ) => void;
}) {
  const { t } = useTranslation();
  const [provider, setProvider] = useState<ProviderChoice | undefined>(
    reconnect
      ? reconnect.vendorPresetId && isAiVendorPresetId(reconnect.vendorPresetId)
        ? reconnect.vendorPresetId
        : reconnect.routing?.kind === "gateway" ||
        reconnect.routing?.kind === "local" ||
        reconnect.routing?.kind === "bedrock"
        ? reconnect.routing.kind
        : reconnect.provider
      : initialProvider,
  );
  const [step, setStep] = useState(
    reconnect || initialProvider ? "connect" : "provider",
  );
  const [ownershipChoice, setOwnership] = useState<"personal" | "shared">();
  const [allAgentsChoice, setAllAgents] = useState<boolean>();
  const [agentIds, setAgentIds] = useState(new Set(agentId ? [agentId] : []));
  const [protocol, setProtocol] = useState<AiProviderRouting["protocol"]>(
    reconnect?.routing?.protocol ?? initialProtocol ?? ((initialProvider && (isAiSdkGatewayVendor(initialProvider) || initialProvider === "openrouter") || apiKeyOnly) ? "chat" : "responses"),
  );
  const [auth, setAuth] = useState<AiProviderRouting["auth"]>(
    reconnect?.routing?.auth ?? "bearer",
  );
  const [baseUrl, setBaseUrl] = useState(
    reconnect?.routing?.baseUrl ?? (initialProvider && isAiSdkGatewayVendor(initialProvider) ? AI_VENDOR_PRESETS[initialProvider].baseUrl : ""),
  );
  const [region, setRegion] = useState(
    reconnect?.routing?.region ?? "us-east-1",
  );
  const [models, setModels] = useState(
    reconnect?.routing?.models.map((m) => m.id).join(", ")
      ?? (initialProvider && isAiSdkGatewayVendor(initialProvider)
        ? AI_VENDOR_PRESETS[initialProvider].models.map(m => m.id).join(", ")
        : ""),
  );
  const [apiKey, setApiKey] = useState("");
  const client = useQueryClient();
  const accounts = useQuery({
    queryKey: ["ai-connections", companyId, agentId],
    queryFn: () => aiConnectionsApi.list(companyId, agentId),
  });
  const canManageConnections = accounts.data?.canManageConnections ?? false;
  const ownership = reconnect?.ownership ?? ownershipChoice ?? (!agentId && canManageConnections ? "shared" : "personal");
  const allAgents = allAgentsChoice ?? (!agentId && canManageConnections);
  const agents = useQuery({
    queryKey: ["agents", companyId, "provider-access"],
    queryFn: () => agentsApi.list(companyId),
  });
  const label = providerLabel ?? (provider === "gateway" && apiKeyOnly ? t("platform.gateway") : providers.find((p) => p.id === provider)?.name ?? "provider");
  const advanced = apiKeyOnly || (reconnect ? Boolean(reconnect.routing) : provider
    ? [...AI_SDK_VENDOR_PRESET_IDS, "openrouter", "bedrock", "gateway", "local"].includes(provider)
    : false);
  const nativeProvider: AiProvider =
    provider && isAiSdkGatewayVendor(provider) ? "openai" : provider === "bedrock"
      ? "anthropic"
      : provider === "gateway" || provider === "local"
        ? protocol === "messages"
          ? "anthropic"
          : "openai"
        : (provider ?? "openai");
  const name =
    reconnect?.name ??
    t(ownership === "personal" ? "provider.myAccount" : "provider.companyAccount", { name:
      provider === "gateway" && baseUrl
        ? (() => {
            try {
              return new URL(baseUrl).hostname;
            } catch {
              return label;
            }
          })()
        : label
    });
  const complete = (result: {
    connectionId: string;
    grantId: string;
    method?: "api_key" | "subscription";
  }) => {
    void client.invalidateQueries({ queryKey: ["ai-connections", companyId] });
    void client.invalidateQueries({ queryKey: ["tools"] });
    onComplete({
      provider: nativeProvider,
      method: result.method ?? "api_key",
      mode: ownership === "shared" ? "shared" : "delegated",
      ...result,
    });
  };
  const save = useMutation({
    mutationFn: () => {
      const routing = apiKeyOnly && (provider === "openai" || provider === "anthropic") && !reconnect?.routing ? undefined :
        reconnect?.routing ??
        aiProviderRoutingSchema.parse({
          kind: provider && isAiSdkGatewayVendor(provider) ? "gateway" : provider,
          protocol: provider && isAiSdkGatewayVendor(provider) ? "chat" : provider === "bedrock" ? "bedrock" : protocol,
          auth: (provider && isAiSdkGatewayVendor(provider)) || provider === "openrouter" ? "bearer" : auth,
          ...(provider === "bedrock"
            ? { region }
            : provider === "gateway" || provider === "local" || (provider && isAiSdkGatewayVendor(provider))
              ? { baseUrl: provider && isAiSdkGatewayVendor(provider) ? AI_VENDOR_PRESETS[provider].baseUrl : baseUrl }
              : {}),
          models: models
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean)
            .map((id) => ({ id })),
        });
      if (apiKeyOnly && routing && !isAiSdkRoutingCompatible(routing)) throw new Error(t("platform.remoteOnly"));
      return aiConnectionsApi.create(
        companyId,
        createAiConnectionSchema.parse({
          provider: nativeProvider,
          ...(provider && isAiSdkGatewayVendor(provider) ? { vendorPresetId: provider } : {}),
          method: "api_key",
          name,
          ownership,
          allAgents,
          agentIds: [...agentIds],
          connectionId: reconnect?.id,
          routing,
          ...(auth !== "none" ? { apiKey } : {}),
        }),
      );
    },
    onSuccess: complete,
    onSettled: () => {
      setApiKey("");
    },
  });
  const choices = (advancedOnly: boolean) => (
    <ConnectionChoiceList
      choices={providers
        .filter((p) => apiKeyOnly ? (AI_SDK_PLATFORM_IDS as readonly string[]).includes(p.id) : Boolean("advanced" in p && p.advanced) === advancedOnly)
        .map((p) => ({
          ...p,
          ...(apiKeyOnly
            ? { description: t("platform.apiDescription", { platform: t(`platform.${p.id}`, { defaultValue: p.name }) }) }
            : isAiSdkGatewayVendor(p.id) ? { description: t("platform.apiDescription", { platform: p.name }) } : {}),
          icon:
            p.id === "gateway" || p.id === "local" ? (
              <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                {p.id === "gateway" ? (
                  <Network className="size-5" />
                ) : (
                  <Monitor className="size-5" />
                )}
              </span>
            ) : (
              <AppLogo name={p.name} brandKey={p.id} />
            ),
        }))}
      onSelect={(id) => {
        setProvider(id as ProviderChoice);
        setStep("connect");
        setApiKey("");
        setAuth("bearer");
        setProtocol(isAiSdkGatewayVendor(id) || id === "openrouter" || apiKeyOnly ? "chat" : initialProtocol ?? "responses");
        setBaseUrl(isAiSdkGatewayVendor(id) ? AI_VENDOR_PRESETS[id].baseUrl : "");
        setModels(isAiSdkGatewayVendor(id) ? AI_VENDOR_PRESETS[id].models.map(m => m.id).join(", ") : "");
        save.reset();
      }}
    />
  );
  const modelSettings = (
    <label className="block space-y-2 text-xs text-muted-foreground">
      {t("provider.modelIds")}
      <Input
        aria-label={t("provider.modelIdsLabel")}
        value={models}
        onChange={(e) => setModels(e.target.value)}
        disabled={Boolean(reconnect)}
      />
      <span className="block">
        {t("provider.modelHint")}
      </span>
    </label>
  );
  const accessDefaults = !reconnect ? (
    <ConnectionAccessDefaults
      companyId={companyId}
      extra={advanced && (!apiKeyOnly || !["openai", "anthropic"].includes(provider ?? "")) ? modelSettings : undefined}
      agents={agents.data ?? []}
      sentence={connectionDefaultSummarySentence({ grantKind: ownership === "shared" ? "organization" : "user", authKind: auth === "none" ? "none" : "api_key", installChoice: allAgents ? "all" : "specific", installCount: agentIds.size })}
      capabilities={{ canCreateOrganizationGrant: canManageConnections, canSetCompanyInstall: canManageConnections }}
      authKind={auth === "none" ? "none" : "api_key"}
      grantKind={ownership === "shared" ? "organization" : "user"}
      grantKinds={["user", "organization"]}
      setGrantKind={kind => setOwnership(kind === "organization" ? "shared" : "personal")}
      installChoice={allAgents ? "all" : "specific"}
      setInstallChoice={choice => setAllAgents(choice === "all")}
      installAgentIds={agentIds}
      setInstallAgentIds={setAgentIds}
      disabled={save.isPending}
      notice={!canManageConnections ? [t("platform.permissionNotice")] : undefined}
    />
  ) : undefined;
  const cancel = () => reconnect || initialProvider ? onCancel() : setStep("provider");
  if (!reconnect && accounts.isPending) return <p role="status">{t("provider.loadingPermissions")}</p>;
  if (!reconnect && accounts.isError) return <p role="alert">{t("provider.permissionsError")} <Button type="button" variant="ghost" onClick={() => void accounts.refetch()}>{t("modelUi.retry")}</Button></p>;
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6" onSubmit={(event) => event.stopPropagation()}>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">
          {step === "provider"
            ? t("provider.connectTitle")
            : t(reconnect ? "provider.reconnectName" : "provider.connectName", { name: label })}
        </h2>
      </div>
      {agents.isError && <p role="alert" className="text-sm text-destructive">{t("provider.agentsError")} <Button type="button" variant="ghost" onClick={() => void agents.refetch()}>{t("modelUi.retry")}</Button></p>}
      {step === "provider" ? (
        <>
          {apiKeyOnly ? choices(false) : advancedOnly ? choices(true) : <>
          {choices(false)}
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">
              {t("provider.advanced")}
            </summary>
            <div className="pt-4">{choices(true)}</div>
          </details>
          </>}
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("modelUi.cancel")}
          </Button>
        </>
      ) : !advanced ? (
        <AiConnectionCredentialStep
          companyId={companyId}
          provider={nativeProvider}
          connectionId={reconnect?.id}
          initialMethod={reconnect?.method}
          fixedMethod={Boolean(reconnect)}
          name={name}
          hideName
          ownership={ownership}
          allAgents={allAgents}
          agentIds={[...agentIds]}
          environmentId={environmentId}
          onCancel={cancel}
          defaults={accessDefaults}
          disabled={!reconnect && ownership === "shared" && !allAgents && agentIds.size === 0}
          onComplete={complete}
        />
      ) : (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {!apiKeyOnly && provider && isAiSdkGatewayVendor(provider) && <div className="space-y-2 text-sm text-muted-foreground"><p>{t("aiSdk.endpoint")}: {AI_VENDOR_PRESETS[provider].baseUrl}</p><a className="underline underline-offset-4" href={vendorPresetConsoleKeysUrl(provider)} target="_blank" rel="noopener noreferrer">{t("aiSdk.getKey")}</a></div>}
          {apiKeyOnly && <p className="text-sm text-muted-foreground">{t(provider === "gateway" ? "platform.remoteOnly" : "platform.officialEndpoint", { platform: label })}</p>}
          {(provider === "gateway" || provider === "local") && (
            <>
              <label className="block space-y-2 text-xs text-muted-foreground">
                {t("provider.url")}
                <Input
                  aria-label={t("provider.url")}
                  placeholder={
                    provider === "local"
                      ? "http://localhost:11434/v1"
                      : "https://gateway.example.com/v1"
                  }
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  disabled={Boolean(reconnect)}
                />
              </label>
              <label className="block space-y-2 text-xs text-muted-foreground">
                {t("provider.format")}
                <Select
                  value={protocol}
                  onValueChange={(v) => {
                    setProtocol(v as typeof protocol);
                    if (v !== "messages" && auth === "api_key")
                      setAuth("bearer");
                  }}
                  disabled={Boolean(reconnect) || Boolean(initialProtocol)}
                >
                  <SelectTrigger aria-label={t("provider.format")} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="responses">
                      {apiKeyOnly ? "OpenAI Responses" : "OpenAI Responses · Codex"}
                    </SelectItem>
                    <SelectItem value="messages">
                      {apiKeyOnly ? "Anthropic Messages" : "Anthropic Messages · Claude"}
                    </SelectItem>
                    <SelectItem value="chat">
                      {apiKeyOnly ? "Chat Completions" : "Chat Completions · OpenCode, Hermes"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </>
          )}
          {provider === "bedrock" && (
            <label className="block space-y-2 text-xs text-muted-foreground">
              AWS region
              <Input
                aria-label="AWS region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                disabled={Boolean(reconnect)}
              />
            </label>
          )}
          {provider !== "openrouter" && !(provider && isAiSdkGatewayVendor(provider)) && (!apiKeyOnly || provider === "gateway") && (
            <label className="block space-y-2 text-xs text-muted-foreground">
              {t("provider.authentication")}
              <Select
                value={auth}
                onValueChange={(v) => setAuth(v as typeof auth)}
                disabled={Boolean(reconnect)}
              >
                <SelectTrigger aria-label={t("provider.authentication")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bearer">
                    {provider === "bedrock"
                      ? "Bedrock API key"
                      : "Bearer token"}
                  </SelectItem>
                  {provider !== "bedrock" && (
                    <>
                      {protocol === "messages" && (
                        <SelectItem value="api_key">
                          API key · x-api-key
                        </SelectItem>
                      )}
                      {!apiKeyOnly && <SelectItem value="none">No authentication</SelectItem>}
                    </>
                  )}
                </SelectContent>
              </Select>
            </label>
          )}
          {
            auth !== "none" && (
              <label className="block space-y-2 text-xs text-muted-foreground">
                {t("provider.apiKey")}
                <Input
                  aria-label={t("provider.apiKey")}
                  type="password"
                  autoComplete="new-password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </label>
            )
          }
          {reconnect && <details><summary className="cursor-pointer text-sm text-muted-foreground">{t("provider.modelSettings")}</summary>{modelSettings}</details>}
          <p className="text-xs text-muted-foreground">
            {t("provider.testHint")}
          </p>
          {save.error && (
            <p role="alert" className="text-sm text-destructive">
              {save.error instanceof Error && save.error.name === "ZodError"
                ? t("provider.validationError")
                : save.error.message}
            </p>
          )}
          {accessDefaults}
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={cancel}
              disabled={save.isPending}
            >
              {t("modelUi.back")}
            </Button>
            <Button
              type="submit"
              disabled={
                save.isPending || accounts.isPending || accounts.isError ||
                (!reconnect && ownership === "shared" && !allAgents && agentIds.size === 0) ||
                (auth !== "none" && !apiKey.trim())
              }
            >
              {save.isPending
                ? t("provider.connecting")
                : reconnect
                  ? t("provider.reconnect")
                  : t("provider.connect")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
