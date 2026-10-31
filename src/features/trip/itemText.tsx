import { ExternalLink } from "lucide-react";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import type { PlanItem } from "@/domain/items";
import { minutesBetween } from "@/domain/time";
import { useT } from "@/i18n";
import { useFormat } from "@/lib/prefs";

/** One-line "when" of an item, in the local times of its places. */
export function useWhen() {
  const t = useT();
  const f = useFormat();
  return (i: PlanItem): string => {
    if (i.kind === "flight") {
      if (i.segments.length === 0) return t("item.noSegments");
      return i.segments
        .map(
          (s) =>
            `${s.segment.from_airport ?? "?"}→${s.segment.to_airport ?? "?"} ${f.date(s.segment.depart_local?.slice(0, 10), "short")} ${f.localTime(s.segment.depart_local)}`,
        )
        .join(" · ");
    }
    if (i.accommodation) {
      return i.startDate
        ? `${f.dateRange(i.startDate, i.endDate)}${i.nights ? ` · ${t("item.nights", { count: i.nights })}` : ""}`
        : t("item.noDates");
    }
    if (i.rentalCar) {
      const r = i.rentalCar;
      if (!r.pickup_local) return t("item.noDates");
      return `${r.pickup_location ?? ""} ${f.date(r.pickup_local.slice(0, 10), "short")} ${f.localTime(r.pickup_local)} → ${r.return_location ?? ""} ${f.date(r.return_local?.slice(0, 10), "short")} ${f.localTime(r.return_local)}`;
    }
    if (i.activity) {
      const a = i.activity;
      if (!a.start_date) return a.flexible ? t("item.flexible") : t("item.noDate");
      return `${f.date(a.start_date, "weekday")}${a.start_time ? ` ${a.start_time}${a.end_time ? `–${a.end_time}` : ""}` : ""}`;
    }
    return "—";
  };
}

/** Duration-like figure of an item: flight time, nights, rental days. */
export function useDuration() {
  const t = useT();
  const f = useFormat();
  return (i: PlanItem): string => {
    if (i.kind === "flight" && i.start && i.end) {
      const stops = Math.max(0, i.segments.length - 1);
      return `${f.duration(minutesBetween(i.start, i.end))}${stops > 0 ? ` · ${t("item.segments", { count: i.segments.length })}` : ""}`;
    }
    if (i.accommodation && i.nights) return t("item.nights", { count: i.nights });
    if (i.rentalCar && i.rentalDays) return t("item.rentalDays", { count: i.rentalDays });
    if (i.start && i.end) return f.duration(minutesBetween(i.start, i.end));
    return "—";
  };
}

/** External link that opens in the system browser after validation by the core. */
export function ExternalUrl({ url, label }: { url: string | null; label?: string }) {
  const run = useAction();
  const t = useT();
  if (!url) return null;
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* shown as stored */
  }
  return (
    <button
      type="button"
      className="inline-flex max-w-full items-center gap-1 truncate text-primary text-xs hover:underline"
      title={t("common.openInBrowser", { url })}
      onClick={(e) => {
        e.stopPropagation();
        void run(() => api.openUrl(url));
      }}
    >
      <ExternalLink className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{label ?? host}</span>
    </button>
  );
}
