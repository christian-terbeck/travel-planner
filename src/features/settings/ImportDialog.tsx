import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import type { ImportMode } from "@/api/bindings/ImportMode";
import type { ImportPreview } from "@/api/bindings/ImportPreview";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import { useErrorText, useT } from "@/i18n";
import { useFormat } from "@/lib/prefs";
import { Button } from "@/ui/core";
import { Dialog } from "@/ui/dialog";

/** Imports a trip export after showing what it contains. Nothing changes before confirming. */
export function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImported?: (id: string) => void;
}) {
  const t = useT();
  const f = useFormat();
  const run = useAction();
  const errorText = useErrorText();
  const [path, setPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>("as_new");

  const reset = () => {
    setPath(null);
    setPreview(null);
    setError(null);
    setMode("as_new");
  };
  const pick = async () => {
    const p = await openDialog({
      multiple: false,
      filters: [{ name: "Travel Planner trip", extensions: ["json"] }],
    });
    if (typeof p !== "string") return;
    setPath(p);
    setError(null);
    setPreview(null);
    try {
      setPreview(await api.previewImport(p));
    } catch (e) {
      setError(errorText(e));
    }
  };
  const doImport = async () => {
    if (!path) return;
    const id = await run(() => api.importTrip(path, mode), t("import.done"));
    if (id) {
      onOpenChange(false);
      reset();
      onImported?.(id);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
      title={t("import.title")}
      description={t("import.hint")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" disabled={!preview} onClick={doImport}>
            {t("import.confirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Button onClick={pick}>{t("import.pick")}</Button>
          <span className="min-w-0 flex-1 truncate text-fg-3 text-sm">{path ?? t("import.noFile")}</span>
        </div>
        {error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-danger text-sm" role="alert">
            {error}
          </p>
        )}
        {preview && (
          <div className="rounded-lg border border-line p-3 text-sm">
            <p className="font-semibold">{preview.title}</p>
            <p className="text-fg-3 text-xs">
              {t("import.exportedAt", { date: f.timestamp(preview.exported_at) })}
            </p>
            <ul className="mt-2 grid grid-cols-4 gap-2 text-xs">
              {preview.counts.map(([k, n]) => (
                <li key={k} className="rounded bg-surface-2 px-2 py-1">
                  <span className="tabular font-semibold">{n}</span> {t(`import.count.${k}`)}
                </li>
              ))}
            </ul>
            {preview.missing_documents > 0 && (
              <p className="mt-2 text-warn text-xs">
                {t("import.missingDocs", { count: preview.missing_documents })}
              </p>
            )}
            {preview.new_exchange_rates > 0 && (
              <p className="mt-1 text-fg-3 text-xs">
                {t("import.newRates", { count: preview.new_exchange_rates })}
              </p>
            )}
            {preview.existing_title && (
              <fieldset className="mt-3 flex flex-col gap-1.5">
                <legend className="mb-1 text-warn text-xs">
                  {t("import.exists", { title: preview.existing_title })}
                </legend>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === "as_new"}
                    onChange={() => setMode("as_new")}
                    className="accent-[var(--primary)]"
                  />
                  {t("import.asNew")}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === "replace"}
                    onChange={() => setMode("replace")}
                    className="accent-[var(--primary)]"
                  />
                  {t("import.replace")}
                </label>
              </fieldset>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
