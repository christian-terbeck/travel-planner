import { save } from "@tauri-apps/plugin-dialog";
import { CalendarDays, FileCode, FileJson, FileSpreadsheet } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import { buildIcs } from "@/domain/ics";
import { toMajorString } from "@/domain/money";
import { Temporal } from "@/domain/time";
import { useT } from "@/i18n";
import { financesCsv, itineraryHtml, safeFileName } from "@/lib/exports";
import type { TripModel } from "@/lib/model";
import { useFormat } from "@/lib/prefs";
import { Dialog } from "@/ui/dialog";

export function ExportDialog({
  open,
  onOpenChange,
  model,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  model: TripModel;
}) {
  const t = useT();
  const f = useFormat();
  const run = useAction();
  const base = safeFileName(model.graph.trip.title);

  const pick = (ext: string, name: string) =>
    save({ defaultPath: `${base}.${ext}`, filters: [{ name, extensions: [ext] }] });

  const exportJson = async () => {
    const path = await pick("json", "Travel Planner trip");
    if (path) await run(() => api.exportTrip(model.graph.trip.id, path), t("export.done"));
  };
  const exportIcs = async () => {
    const path = await pick("ics", "iCalendar");
    if (path)
      await run(
        () => api.writeExport(path, buildIcs(model.graph.trip, model.plan.items, Temporal.Now.instant())),
        t("export.done"),
      );
  };
  const exportHtml = async () => {
    const path = await pick("html", "HTML");
    if (path) await run(() => api.writeExport(path, itineraryHtml(model, f, t)), t("export.done"));
  };
  const exportCsv = async () => {
    const path = await pick("csv", "CSV");
    if (path) await run(() => api.writeExport(path, financesCsv(model, t, toMajorString)), t("export.done"));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("export.title")} description={t("export.hint")}>
      <div className="grid grid-cols-2 gap-3">
        <ExportCard
          icon={<FileJson />}
          title={t("export.json")}
          text={t("export.jsonHint")}
          onClick={exportJson}
        />
        <ExportCard
          icon={<CalendarDays />}
          title={t("export.ics")}
          text={t("export.icsHint")}
          onClick={exportIcs}
        />
        <ExportCard
          icon={<FileCode />}
          title={t("export.html")}
          text={t("export.htmlHint")}
          onClick={exportHtml}
        />
        <ExportCard
          icon={<FileSpreadsheet />}
          title={t("export.csv")}
          text={t("export.csvHint")}
          onClick={exportCsv}
        />
      </div>
    </Dialog>
  );
}

function ExportCard({
  icon,
  title,
  text,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-lg border border-line p-3 text-left transition-colors hover:border-primary hover:bg-primary-soft/40"
    >
      <span className="text-primary [&_svg]:size-5">{icon}</span>
      <span>
        <span className="block font-medium text-sm">{title}</span>
        <span className="block text-fg-3 text-xs">{text}</span>
      </span>
    </button>
  );
}
