import { useQueryClient } from "@tanstack/react-query";
import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { Archive, Database, RefreshCcw, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import type { RestorePreview } from "@/api/bindings/RestorePreview";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import i18n, { useErrorText, useT } from "@/i18n";
import { useFormat, usePrefs } from "@/lib/prefs";
import { Button, Card, CardHeader, Field } from "@/ui/core";
import { Dialog, useConfirm } from "@/ui/dialog";
import { NumberInput } from "@/ui/inputs";
import { ImportDialog } from "./ImportDialog";

export function DataCard() {
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
