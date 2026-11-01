import { FileText, Paperclip, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import { useT } from "@/i18n";
import { CONFIRMATION_EXTENSIONS, extensionOf, fileNameOf } from "@/lib/fileDrop";
import type { TripModel } from "@/lib/model";
import { usePrefs } from "@/lib/prefs";
import { Button, Field, Select } from "@/ui/core";
import { Dialog } from "@/ui/dialog";

/**
 * Asks what to do with files dropped on a trip: attach them as documents (to the trip, a booking or
 * an alternative), or — one confirmation, with the import turned on — read it as a booking.
 */
export function FileDropDialog({
  model: m,
  paths,
  onClose,
}: {
  model: TripModel;
  paths: string[] | null;
  onClose: () => void;
}) {
  const t = useT();
  const run = useAction();
  const navigate = useNavigate();
  const { aiImport } = usePrefs();
  const [target, setTarget] = useState("");
  useEffect(() => {
    if (paths) setTarget("");
  }, [paths]);
  if (!paths) return null;
  const readable =
    aiImport && paths.length === 1 && CONFIRMATION_EXTENSIONS.includes(extensionOf(paths[0] ?? ""));
  const targets = [
    ...m.graph.bookings
      .filter((b) => b.status === "active")
      .map((b) => ({
        value: `b:${b.id}`,
        label: `${t("documents.booking")}: ${m.item(b.option_id)?.option.title ?? ""}${b.reference ? ` (${b.reference})` : ""}`,
      })),
    ...m.graph.options.map((o) => ({ value: `o:${o.id}`, label: `${t("documents.option")}: ${o.title}` })),
  ];

  const attach = async () => {
    const optionId = target.startsWith("o:") ? target.slice(2) : null;
    const bookingId = target.startsWith("b:") ? target.slice(2) : null;
    onClose();
    for (const p of paths)
      await run(() => api.attachDocument(m.graph.trip.id, p, optionId, bookingId), t("documents.attached"));
  };
  const read = () => {
    onClose();
    navigate(`/trips/${m.graph.trip.id}/bookings`, { state: { importPath: paths[0] } });
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={t("drop.title", { count: paths.length })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          {readable && (
            <Button icon={<Sparkles className="size-4" />} onClick={read}>
              {t("drop.read")}
            </Button>
          )}
          <Button variant="primary" icon={<Paperclip className="size-4" />} onClick={attach}>
            {t("drop.attach")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <ul className="flex flex-col gap-1">
          {paths.map((p) => (
            <li key={p} className="flex items-center gap-2 text-fg-2">
              <FileText className="size-4 shrink-0 text-fg-3" aria-hidden />
              <span className="truncate">{fileNameOf(p)}</span>
            </li>
          ))}
        </ul>
        <Field label={t("drop.attachTo")} htmlFor="drop-target">
          <Select id="drop-target" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{t("drop.trip")}</option>
            {targets.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </Select>
        </Field>
        {readable && <p className="text-fg-3 text-xs">{t("drop.readHint")}</p>}
      </div>
    </Dialog>
  );
}
