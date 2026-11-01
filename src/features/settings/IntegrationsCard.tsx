import { Lock, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, inDesktopApp } from "@/api/client";
import { queryClient, useAction } from "@/api/queries";
import { useT } from "@/i18n";
import { DEFAULT_ROUTING_URL, usePrefs } from "@/lib/prefs";
import { Button, Card, CardHeader, Checkbox, Field, Input } from "@/ui/core";
import { useToast } from "@/ui/toast";

export function IntegrationsCard() {
  const t = useT();
  const { routing, geocoding, weather, siteIcons, ecbRates } = usePrefs();
  const run = useAction();
  const toast = useToast();
  const set = (key: string, value: string | null) => run(() => api.setSetting(key, value));
  const [url, setUrl] = useState(routing.url);
  useEffect(() => setUrl(routing.url), [routing.url]);
  const saveUrl = () => {
    const v = url.trim();
    if (v !== routing.url) void set("routing_url", v && v !== DEFAULT_ROUTING_URL ? v : null);
  };
  const reloadIcons = async () => {
    const n = await run(() => api.clearSiteIcons());
    if (n === undefined) return;
    queryClient.removeQueries({ queryKey: ["siteIcon"] });
    toast.show({ kind: "success", text: t("settings.siteIcons.cleared", { count: n }) });
  };
  const clear = async () => {
    const n = await run(() => api.clearRoadCache());
    if (n !== undefined) toast.show({ kind: "success", text: t("settings.routing.cleared", { count: n }) });
  };
  return (
    <Card>
      <CardHeader icon={<Lock className="size-4" />} title={t("settings.integrations")} />
      <div className="flex flex-col gap-3 p-4 text-sm">
        <div className="flex flex-col gap-1">
          <Checkbox
            label={<span className="font-medium">{t("settings.routing.enable")}</span>}
            checked={routing.enabled}
            onChange={(e) => set("routing_enabled", e.target.checked ? "1" : null)}
          />
          <p className="pl-6 text-fg-3 text-xs">{t("settings.routing.hint")}</p>
          <p className="pl-6 text-fg-3 text-xs">{t("settings.routing.sent")}</p>
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2 pl-6">
          <Field
            label={t("settings.routing.url")}
            hint={t("settings.routing.urlHint")}
            htmlFor="set-routing-url"
          >
            <Input
              id="set-routing-url"
              value={url}
              disabled={!routing.enabled}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={saveUrl}
              onKeyDown={(e) => e.key === "Enter" && saveUrl()}
            />
          </Field>
          <Button
            variant="ghost"
            disabled={!routing.enabled || routing.url === DEFAULT_ROUTING_URL}
            onClick={() => set("routing_url", null)}
          >
            {t("settings.routing.reset")}
          </Button>
          <Button icon={<Trash2 className="size-4" />} onClick={clear}>
            {t("settings.routing.clearCache")}
          </Button>
        </div>
        <p className="pl-6 text-fg-3 text-xs">{t("settings.routing.defaultService")}</p>
        <div className="flex flex-col gap-1 border-line border-t pt-3">
          <Checkbox
            label={<span className="font-medium">{t("settings.geocoding.enable")}</span>}
            checked={geocoding}
            onChange={(e) => set("geocoding_enabled", e.target.checked ? "1" : null)}
          />
          <p className="pl-6 text-fg-3 text-xs">{t("settings.geocoding.hint")}</p>
        </div>
        <div className="flex flex-col gap-1 border-line border-t pt-3">
          <Checkbox
            label={<span className="font-medium">{t("settings.weather.enable")}</span>}
            checked={weather}
            onChange={(e) => set("weather_enabled", e.target.checked ? "1" : null)}
          />
          <p className="pl-6 text-fg-3 text-xs">{t("settings.weather.hint")}</p>
        </div>
        <div className="flex flex-col gap-1 border-line border-t pt-3">
          <div className="flex items-center justify-between gap-2">
            <Checkbox
              label={<span className="font-medium">{t("settings.siteIcons.enable")}</span>}
              checked={siteIcons}
              onChange={(e) => set("site_icons_enabled", e.target.checked ? "1" : null)}
            />
            <Button variant="ghost" size="sm" disabled={!siteIcons} onClick={reloadIcons}>
              {t("settings.siteIcons.reload")}
            </Button>
          </div>
          <p className="pl-6 text-fg-3 text-xs">{t("settings.siteIcons.hint")}</p>
        </div>
        <div className="flex flex-col gap-1 border-line border-t pt-3">
          <Checkbox
            label={<span className="font-medium">{t("settings.ecb.enable")}</span>}
            checked={ecbRates}
            onChange={(e) => set("ecb_rates_enabled", e.target.checked ? "1" : null)}
          />
          <p className="pl-6 text-fg-3 text-xs">{t("settings.ecb.hint")}</p>
        </div>
        <AiImportOptions />
        <p className="border-line border-t pt-3">{t("settings.integrationsNone")}</p>
        <p className="text-fg-3">{t("settings.privacy")}</p>
      </div>
    </Card>
  );
}

function AiImportOptions() {
  const t = useT();
  const { aiImport, aiReview } = usePrefs();
  const anyAi = aiImport || aiReview;
  const run = useAction();
  const [stored, setStored] = useState<boolean | null>(null);
  const [key, setKey] = useState("");
  useEffect(() => {
    if (inDesktopApp) void api.aiKeyStored().then(setStored, () => setStored(null));
  }, []);
  const saveKey = async (value: string | null) => {
    const ok = await run(() => api.setAiKey(value), t("settings.ai.keySaved"));
    if (ok !== undefined) {
      setStored(value !== null);
      setKey("");
    }
  };
  return (
    <div className="flex flex-col gap-2 border-line border-t pt-3">
      <Checkbox
        label={<span className="font-medium">{t("settings.ai.enable")}</span>}
        checked={aiImport}
        onChange={(e) => run(() => api.setSetting("ai_import_enabled", e.target.checked ? "1" : null))}
      />
      <p className="pl-6 text-fg-3 text-xs">{t("settings.ai.hint")}</p>
      <Checkbox
        label={<span className="font-medium">{t("settings.ai.reviewEnable")}</span>}
        checked={aiReview}
        onChange={(e) => run(() => api.setSetting("ai_review_enabled", e.target.checked ? "1" : null))}
      />
      <p className="pl-6 text-fg-3 text-xs">{t("settings.ai.reviewHint")}</p>
      <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2 pl-6">
        <Field
          label={t("settings.ai.key")}
          hint={stored ? t("settings.ai.keyStored") : t("settings.ai.keyHint")}
          htmlFor="set-ai-key"
        >
          <Input
            id="set-ai-key"
            type="password"
            autoComplete="off"
            value={key}
            disabled={!anyAi}
            placeholder={stored ? "••••••••" : "sk-ant-…"}
            onChange={(e) => setKey(e.target.value)}
          />
        </Field>
        <Button disabled={!anyAi || !key.trim()} onClick={() => saveKey(key.trim())}>
          {t("common.save")}
        </Button>
        <Button variant="ghost" disabled={!stored} onClick={() => saveKey(null)}>
          {t("settings.ai.removeKey")}
        </Button>
      </div>
    </div>
  );
}
