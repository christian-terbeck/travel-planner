import { EyeOff, Undo2 } from "lucide-react";
import { useNavigate } from "react-router";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import type { Warning } from "@/domain/conflicts";
import type { Reminder } from "@/domain/reminders";
import { useT } from "@/i18n";
import type { TripModel } from "@/lib/model";
import { useFormat } from "@/lib/prefs";
import { nowIso } from "@/lib/rows";
import { useTripUi } from "@/lib/tripUi";
import { IconButton } from "@/ui/core";
import { SeverityIcon } from "@/ui/status";

const DATE_PARAMS = ["from", "to", "limit"];

/** Translated text of a warning, with dates and option titles filled in. */
export function useWarningText(model: TripModel) {
  const t = useT();
  const f = useFormat();
  return (w: Warning) => {
    const params: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(w.params)) {
      params[k] =
        DATE_PARAMS.includes(k) && typeof v === "string"
          ? f.date(v, "short")
          : k === "minutes" && typeof v === "number"
            ? f.duration(v)
            : v;
    }
    params.items = w.optionIds.map((id) => model.item(id)?.option.title ?? "?").join(" · ");
    params.slots = w.slotIds.map((id) => model.graph.slots.find((s) => s.id === id)?.title ?? "?").join(", ");
    params.date = w.date ? f.date(w.date, "short") : "";
    return t(`warning.${w.code}`, params);
  };
}

export function WarningList({
  model,
  warnings,
  compact,
}: {
  model: TripModel;
  warnings: Warning[];
  compact?: boolean;
}) {
  const t = useT();
  const run = useAction();
  const text = useWarningText(model);
  const navigate = useNavigate();
  const [, setUi] = useTripUi(model.graph.trip.id);
  const sorted = [...warnings].sort((a, b) => order(a) - order(b));
  if (sorted.length === 0) return <p className="px-4 py-3 text-fg-3 text-sm">{t("warning.none")}</p>;
  const open = (w: Warning) => {
    const id = w.optionIds[0];
    if (!id) return navigate(`/trips/${model.graph.trip.id}/planning`);
    setUi({ selectedOptionId: id });
    navigate(`/trips/${model.graph.trip.id}/planning`);
  };
  return (
    <ul className="divide-y divide-line">
      {sorted.map((w) => (
        <li key={w.key} className="group flex items-start gap-2.5 px-4 py-2.5">
          <SeverityIcon
            severity={w.severity}
            className={`mt-0.5 size-4 shrink-0 ${w.severity === "critical" ? "text-danger" : w.severity === "warning" ? "text-warn" : "text-info"}`}
          />
          <button
            type="button"
            className="min-w-0 flex-1 text-left text-sm hover:underline"
            onClick={() => open(w)}
          >
            {text(w)}
            {w.blocking && !compact && (
              <span className="ml-1.5 text-danger text-xs">({t("warning.blocking")})</span>
            )}
          </button>
          <IconButton
            label={t("warning.dismiss")}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100"
            onClick={() =>
              run(
                () =>
                  api.save({
                    type: "dismissed_warning",
                    row: { trip_id: model.graph.trip.id, key: w.key, note: null, dismissed_at: nowIso() },
                  }),
                t("warning.dismissed"),
              )
            }
          >
            <EyeOff className="size-3.5" />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}

function order(w: Warning) {
  return { critical: 0, warning: 1, info: 2 }[w.severity];
}

export function DismissedList({ model }: { model: TripModel }) {
  const t = useT();
  const run = useAction();
  const list = model.graph.dismissed_warnings;
  if (list.length === 0) return null;
  return (
    <details className="px-4 py-2 text-fg-3 text-xs">
      <summary className="cursor-pointer">{t("warning.dismissedCount", { count: list.length })}</summary>
      <ul className="mt-1">
        {list.map((d) => (
          <li key={d.key} className="flex items-center gap-2 py-0.5">
            <span className="min-w-0 flex-1 truncate font-mono">{d.key.split("|")[0]}</span>
            <IconButton
              label={t("warning.restore")}
              onClick={() => run(() => api.remove("dismissed_warning", d.trip_id, d.key))}
            >
              <Undo2 className="size-3.5" />
            </IconButton>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function useReminderText() {
  const t = useT();
  const f = useFormat();
  return (r: Reminder) => {
    const p: Record<string, string | number> = { ...r.params, date: f.date(r.date, "weekday") };
    if (typeof r.params.from === "string") p.from = f.date(r.params.from, "short");
    if (typeof r.params.to === "string") p.to = f.date(r.params.to, "short");
    if (typeof r.params.currency === "string") {
      for (const k of ["open", "price", "target"])
        if (typeof r.params[k] === "number") p[k] = f.minor(r.params[k], r.params.currency);
    }
    return t(`reminder.${r.kind}`, p);
  };
}
