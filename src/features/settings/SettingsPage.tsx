import { useQueryClient } from "@tanstack/react-query";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import {
  Archive,
  Bell,
  Database,
  Download,
  Globe,
  Lock,
  Plus,
  RefreshCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { RestorePreview } from "@/api/bindings/RestorePreview";
import { api, inDesktopApp } from "@/api/client";
import { useAction, useRemove } from "@/api/queries";
import type { ReminderSettings } from "@/domain/reminders";
import type { ExchangeRate } from "@/domain/types";
import i18n, { useErrorText, useT } from "@/i18n";
import { DEFAULT_ROUTING_URL, type Theme, useFormat, usePrefs } from "@/lib/prefs";
import { newId, nil, nowIso } from "@/lib/rows";
import { UPDATE_KEY, useUpdateResult } from "@/lib/updates";
import { Button, Card, CardHeader, Checkbox, Field, IconButton, Input, PageHeader, Select } from "@/ui/core";
import { Dialog, useConfirm } from "@/ui/dialog";
import { CurrencySelect, DateInput, NumberInput } from "@/ui/inputs";
import { useToast } from "@/ui/toast";
import { ImportDialog } from "./ImportDialog";

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

function RatesCard() {
  const t = useT();
  const prefs = usePrefs();
  const run = useAction();
  const remove = useRemove();
  const toast = useToast();
  const [draft, setDraft] = useState<ExchangeRate | null>(null);
  const create = (): ExchangeRate => ({
    id: newId(),
    base: "EUR",
    quote: "USD",
    rate: "",
    as_of: nowIso().slice(0, 10),
    source: null,
    created_at: nowIso(),
  });
  const valid =
    draft && /^\d+(\.\d+)?$/.test(draft.rate) && Number(draft.rate) > 0 && draft.base !== draft.quote;
  return (
    <Card>
      <CardHeader
        icon={<RefreshCcw className="size-4" />}
        title={t("rates.title")}
        subtitle={t("rates.hint")}
        actions={
          <div className="flex gap-2">
            {prefs.ecbRates && (
              <Button
                size="sm"
                icon={<RefreshCcw className="size-3.5" />}
                onClick={async () => {
                  const n = await run(() => api.fetchReferenceRates());
                  if (n !== undefined)
                    toast.show({ kind: "success", text: t("rates.ecbFetched", { count: n }) });
                }}
              >
                {t("rates.ecbNow")}
              </Button>
            )}
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setDraft(create())}>
              {t("rates.add")}
            </Button>
          </div>
        }
      />
      {prefs.rates.length === 0 ? (
        <p className="px-4 py-3 text-fg-3 text-sm">{t("rates.empty")}</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {prefs.rates.map((r) => (
              <tr key={r.id} className="border-line border-b last:border-0">
                <td className="tabular px-4 py-2">
                  1 {r.base} = {r.rate} {r.quote}
                </td>
                <td className="px-2 py-2 text-fg-3">{t("rates.asOf", { date: r.as_of })}</td>
                <td className="px-2 py-2 text-fg-3">{r.source}</td>
                <td className="px-4 py-2 text-right">
                  <IconButton label={t("common.delete")} onClick={() => remove("exchange_rate", [r.id])}>
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {draft && (
        <Dialog
          open
          size="sm"
          onOpenChange={(o) => !o && setDraft(null)}
          title={t("rates.add")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                disabled={!valid}
                onClick={async () =>
                  (await run(() => api.save({ type: "exchange_rate", row: draft }))) !== undefined &&
                  setDraft(null)
                }
              >
                {t("common.save")}
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("rates.base")} htmlFor="r-base">
              <CurrencySelect
                id="r-base"
                value={draft.base}
                onChange={(c) => setDraft({ ...draft, base: c })}
                className="w-full"
              />
            </Field>
            <Field label={t("rates.quote")} htmlFor="r-quote">
              <CurrencySelect
                id="r-quote"
                value={draft.quote}
                onChange={(c) => setDraft({ ...draft, quote: c })}
                className="w-full"
              />
            </Field>
            <Field
              label={t("rates.rate", { base: draft.base, quote: draft.quote })}
              hint={t("rates.rateHint")}
              htmlFor="r-rate"
            >
              <Input
                id="r-rate"
                inputMode="decimal"
                value={draft.rate}
                placeholder="1.0825"
                onChange={(e) => setDraft({ ...draft, rate: e.target.value.replace(",", ".").trim() })}
              />
            </Field>
            <Field label={t("rates.date")} htmlFor="r-date">
              <DateInput
                id="r-date"
                value={draft.as_of}
                onChange={(v) => setDraft({ ...draft, as_of: v ?? draft.as_of })}
              />
            </Field>
            <Field label={t("rates.source")} className="col-span-2" htmlFor="r-src">
              <Input
                id="r-src"
                value={draft.source ?? ""}
                placeholder={t("rates.sourcePlaceholder")}
                onChange={(e) => setDraft({ ...draft, source: nil(e.target.value) })}
              />
            </Field>
          </div>
        </Dialog>
      )}
    </Card>
  );
}

function RemindersCard() {
  const t = useT();
  const prefs = usePrefs();
  const run = useAction();
  const [r, setR] = useState<ReminderSettings>(prefs.reminders);
  const keys: Array<keyof ReminderSettings> = [
    "cancellationDays",
    "departureDays",
    "paymentDays",
    "activityDays",
    "missingDays",
    "taskDays",
  ];
  return (
    <Card>
      <CardHeader
        icon={<Bell className="size-4" />}
        title={t("settings.reminders")}
        subtitle={t("settings.remindersHint")}
      />
      <NotificationOptions />
      <div className="grid grid-cols-3 gap-4 border-line border-t p-4">
        {keys.map((k) => (
          <Field key={k} label={t(`settings.reminder.${k}`)} htmlFor={`rem-${k}`}>
            <NumberInput
              id={`rem-${k}`}
              min={0}
              max={365}
              value={r[k]}
              onChange={(v) => setR({ ...r, [k]: v ?? 0 })}
            />
          </Field>
        ))}
      </div>
      <div className="flex justify-end border-line border-t px-4 py-2.5">
        <Button
          variant="primary"
          size="sm"
          onClick={() => run(() => api.setSetting("reminders", JSON.stringify(r)), t("settings.saved"))}
        >
          {t("common.save")}
        </Button>
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

function NotificationOptions() {
  const t = useT();
  const prefs = usePrefs();
  const run = useAction();
  const [autostart, setAutostart] = useState<boolean | null>(null);
  useEffect(() => {
    if (inDesktopApp) void api.autostartEnabled().then(setAutostart, () => setAutostart(null));
  }, []);
  const set = (key: string, value: string | null) => run(() => api.setSetting(key, value));
  return (
    <div className="flex flex-col gap-2 p-4">
      <Checkbox
        label={<span className="font-medium">{t("settings.notifications.enable")}</span>}
        checked={prefs.notifications}
        onChange={(e) => set("notifications", e.target.checked ? null : "0")}
      />
      <p className="pl-6 text-fg-3 text-xs">{t("settings.notifications.hint")}</p>
      <Checkbox
        label={t("settings.notifications.tray")}
        checked={prefs.closeToTray}
        onChange={(e) => set("close_to_tray", e.target.checked ? "1" : null)}
      />
      <Checkbox
        label={t("settings.notifications.autostart")}
        checked={autostart ?? false}
        disabled={autostart === null}
        onChange={(e) => {
          const on = e.target.checked;
          void run(async () => {
            await api.setAutostart(on);
            // Started with Windows, the app waits in the tray, so closing must not quit it.
            if (on) await api.setSetting("close_to_tray", "1");
            setAutostart(on);
          });
        }}
      />
      <p className="pl-6 text-fg-3 text-xs">{t("settings.notifications.autostartHint")}</p>
    </div>
  );
}

function DataCard() {
  const t = useT();
  const f = useFormat();
  const prefs = usePrefs();
  const run = useAction();
  const confirm = useConfirm();
  const errorText = useErrorText();
  const [importing, setImporting] = useState(false);
  const [restore, setRestore] = useState<{ path: string; preview: RestorePreview } | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const backup = async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const path = await save({
      defaultPath: `travel-planner-backup-${stamp}.zip`,
      filters: [{ name: "Backup", extensions: ["zip"] }],
    });
    if (path) {
      const m = await run(() => api.createBackup(path));
      if (m)
        await confirm({
          title: t("backup.doneTitle"),
          text: t("backup.doneText", { trips: m.trips, documents: m.documents, path }),
          confirm: t("common.ok"),
        });
    }
  };
  const pickRestore = async () => {
    setRestoreError(null);
    const p = await openDialog({ multiple: false, filters: [{ name: "Backup", extensions: ["zip"] }] });
    if (typeof p !== "string") return;
    try {
      setRestore({ path: p, preview: await api.previewRestore(p) });
    } catch (e) {
      setRestoreError(errorText(e));
    }
  };
  const doRestore = async () => {
    if (!restore) return;
    const safety = await run(() => api.restoreBackup(restore.path), t("backup.restored"));
    setRestore(null);
    if (safety)
      await confirm({
        title: t("backup.restoredTitle"),
        text: t("backup.safety", { path: safety }),
        confirm: t("common.ok"),
      });
  };

  return (
    <Card>
      <CardHeader
        icon={<Database className="size-4" />}
        title={t("settings.data")}
        subtitle={t("settings.dataHint")}
      />
      <div className="flex flex-col gap-4 p-4">
        <div className="text-sm">
          <span className="text-fg-3">{t("settings.dataDir")}: </span>
          <span className="font-mono text-xs">{prefs.dataDir}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<Archive className="size-4" />} onClick={backup}>
            {t("backup.create")}
          </Button>
          <Button icon={<RefreshCcw className="size-4" />} onClick={pickRestore}>
            {t("backup.restore")}
          </Button>
          <Button icon={<Upload className="size-4" />} onClick={() => setImporting(true)}>
            {t("trips.import")}
          </Button>
        </div>
        {restoreError && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-danger text-sm" role="alert">
            {restoreError}
          </p>
        )}
        <p className="text-fg-3 text-xs">{t("backup.hint")}</p>
        <AutoBackupOptions />
      </div>
      <ImportDialog open={importing} onOpenChange={setImporting} />
      {restore && (
        <Dialog
          open
          onOpenChange={(o) => !o && setRestore(null)}
          title={t("backup.restoreTitle")}
          description={t("backup.restoreHint")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRestore(null)}>
                {t("common.cancel")}
              </Button>
              <Button variant="danger" onClick={doRestore}>
                {t("backup.restoreConfirm")}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-2 text-sm">
            <p>{t("backup.createdAt", { date: f.timestamp(restore.preview.manifest.created_at) })}</p>
            <p>
              {t("backup.contains", {
                trips: restore.preview.manifest.trips,
                documents: restore.preview.manifest.documents,
              })}
            </p>
            {restore.preview.trip_titles.length > 0 && (
              <ul className="list-disc pl-5 text-fg-2">
                {restore.preview.trip_titles.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            )}
            {restore.preview.missing_documents > 0 && (
              <p className="text-warn">
                {t("backup.missingDocs", { count: restore.preview.missing_documents })}
              </p>
            )}
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-warn">{t("backup.replaceWarning")}</p>
          </div>
        </Dialog>
      )}
    </Card>
  );
}

function AutoBackupOptions() {
  const t = useT();
  const f = useFormat();
  const { autoBackup } = usePrefs();
  const run = useAction();
  const qc = useQueryClient();
  // Backups written in the background since the settings were loaded.
  useEffect(() => void qc.invalidateQueries({ queryKey: ["app"] }), [qc]);
  const set = (key: string, value: string | null) => run(() => api.setSetting(key, value));
  const choose = async () => {
    const dir = await openDialog({
      directory: true,
      multiple: false,
      defaultPath: autoBackup.dir ?? undefined,
    });
    if (typeof dir === "string") await set("auto_backup_dir", dir);
  };
  return (
    <div className="flex flex-col gap-3 border-line border-t pt-4">
      <div>
        <h3 className="font-medium text-sm">{t("autoBackup.title")}</h3>
        <p className="text-fg-3 text-xs">{t("autoBackup.hint")}</p>
      </div>
      {autoBackup.dir ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t("autoBackup.folder")} className="min-w-64 flex-1">
              <span className="truncate py-1.5 font-mono text-xs" title={autoBackup.dir}>
                {autoBackup.dir}
              </span>
            </Field>
            <Field label={t("autoBackup.keep")} htmlFor="set-backup-keep" className="w-28">
              <NumberInput
                id="set-backup-keep"
                min={1}
                max={100}
                value={autoBackup.keep}
                onChange={(n) => n && n >= 1 && n <= 100 && void set("auto_backup_keep", String(n))}
              />
            </Field>
          </div>
          <p className="text-fg-2 text-sm">
            {autoBackup.last
              ? t("autoBackup.last", { date: f.timestamp(autoBackup.last) })
              : t("autoBackup.never")}
          </p>
          {autoBackup.error && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-danger text-sm" role="alert">
              {t("autoBackup.failed", {
                error: i18n.exists(`errors.${autoBackup.error}`)
                  ? t(`errors.${autoBackup.error}`)
                  : autoBackup.error,
              })}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void run(() => api.runAutoBackup(), t("autoBackup.done"))}>
              {t("autoBackup.now")}
            </Button>
            <Button variant="ghost" onClick={choose}>
              {t("autoBackup.change")}
            </Button>
            <Button variant="ghost" onClick={() => void set("auto_backup_dir", null)}>
              {t("autoBackup.off")}
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button onClick={choose}>{t("autoBackup.choose")}</Button>
        </div>
      )}
    </div>
  );
}

function UpdatesCard() {
  const t = useT();
  const f = useFormat();
  const { updates } = usePrefs();
  const qc = useQueryClient();
  const run = useAction();
  const result = useUpdateResult();
  const [checking, setChecking] = useState(false);
  const set = (key: string, value: string | null) => run(() => api.setSetting(key, value));
  const check = async () => {
    setChecking(true);
    const r = await run(() => api.checkUpdate());
    setChecking(false);
    if (r) qc.setQueryData(UPDATE_KEY, r);
  };
  const latest = result?.latest;
  return (
    <Card>
      <CardHeader icon={<Download className="size-4" />} title={t("updates.title")} />
      <div className="flex flex-col gap-3 p-4 text-sm">
        <div className="flex flex-col gap-1">
          <Checkbox
            label={<span className="font-medium">{t("updates.enable")}</span>}
            checked={updates.enabled}
            onChange={(e) => set("update_check_enabled", e.target.checked ? "1" : null)}
          />
          <p className="pl-6 text-fg-3 text-xs">{t("updates.hint")}</p>
        </div>
        {result && (
          <div className="rounded-lg bg-surface-2 px-3 py-2">
            {result.newer && latest ? (
              <>
                <p className="font-medium">
                  {t("updates.newer", { version: latest.version, current: result.current })}
                </p>
                {latest.notes && (
                  <p className="mt-1 line-clamp-4 whitespace-pre-line text-fg-2 text-xs">{latest.notes}</p>
                )}
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => void run(() => api.openUrl(latest.page_url))}
                  >
                    {t("updates.open")}
                  </Button>
                  {updates.skipped !== latest.version && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void set("update_skipped", latest.version)}
                    >
                      {t("updates.skip")}
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <p>{t("updates.current", { version: result.current })}</p>
            )}
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button onClick={check} disabled={checking}>
            {t("updates.check")}
          </Button>
          {updates.checkedAt && (
            <span className="text-fg-3 text-xs">
              {t("updates.checkedAt", { date: f.timestamp(updates.checkedAt) })}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

function IntegrationsCard() {
  const t = useT();
  const { routing, geocoding, weather, ecbRates } = usePrefs();
  const run = useAction();
  const toast = useToast();
  const set = (key: string, value: string | null) => run(() => api.setSetting(key, value));
  const [url, setUrl] = useState(routing.url);
  useEffect(() => setUrl(routing.url), [routing.url]);
  const saveUrl = () => {
    const v = url.trim();
    if (v !== routing.url) void set("routing_url", v && v !== DEFAULT_ROUTING_URL ? v : null);
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
