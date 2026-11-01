import { Globe } from "lucide-react";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import { useT } from "@/i18n";
import { type Theme, usePrefs } from "@/lib/prefs";
import { nil } from "@/lib/rows";
import { Card, CardHeader, Field, PageHeader, Select } from "@/ui/core";
import { CurrencySelect } from "@/ui/inputs";
import { DataCard } from "./DataCard";
import { IntegrationsCard } from "./IntegrationsCard";
import { RatesCard } from "./RatesCard";
import { RemindersCard } from "./RemindersCard";
import { UpdatesCard } from "./UpdatesCard";

const LOCALES = ["de-DE", "en-GB", "en-US", "de-AT", "de-CH", "fr-FR", "es-ES", "it-IT", "nl-NL", "pt-PT"];

declare const __APP_VERSION__: string;

export function SettingsPage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t("nav.settings")} />
      <div className="grid max-w-5xl grid-cols-1 gap-6 p-6">
        <GeneralCard />
        <RatesCard />
        <RemindersCard />
        <DataCard />
        <UpdatesCard />
        <IntegrationsCard />
        <p className="text-fg-3 text-xs">{t("settings.version", { version: __APP_VERSION__ })}</p>
      </div>
    </div>
  );
}

function GeneralCard() {
  const t = useT();
  const prefs = usePrefs();
  const run = useAction();
  const set = (key: string, value: string | null) => run(() => api.setSetting(key, value));
  return (
    <Card>
      <CardHeader icon={<Globe className="size-4" />} title={t("settings.general")} />
      <div className="grid grid-cols-4 gap-4 p-4">
        <Field label={t("settings.language")} htmlFor="set-lang">
          <Select
            id="set-lang"
            value={prefs.languageSetting}
            onChange={(e) => set("language", nil(e.target.value))}
          >
            <option value="">{t("settings.languageAuto")}</option>
            <option value="en">English</option>
            <option value="de">Deutsch</option>
          </Select>
        </Field>
        <Field label={t("settings.locale")} hint={t("settings.localeHint")} htmlFor="set-locale">
          <Select id="set-locale" value={prefs.locale} onChange={(e) => set("locale", e.target.value)}>
            {[...new Set([prefs.locale, ...LOCALES])].map((l) => (
              <option key={l} value={l}>
                {new Intl.DisplayNames([l], { type: "language" }).of(l) ?? l} ({l})
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("settings.theme")} htmlFor="set-theme">
          <Select id="set-theme" value={prefs.theme} onChange={(e) => set("theme", e.target.value as Theme)}>
            <option value="system">{t("settings.themeSystem")}</option>
            <option value="light">{t("settings.themeLight")}</option>
            <option value="dark">{t("settings.themeDark")}</option>
          </Select>
        </Field>
        <Field label={t("settings.currency")} hint={t("settings.currencyHint")} htmlFor="set-cur">
          <CurrencySelect
            id="set-cur"
            value={prefs.currency}
            onChange={(c) => set("currency", c)}
            className="w-full"
          />
        </Field>
      </div>
    </Card>
  );
}
