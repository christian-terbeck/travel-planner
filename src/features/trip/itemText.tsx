import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "@/api/client";
import { useAction } from "@/api/queries";
import { isJourney, type PlanItem, segmentFrom, segmentTo } from "@/domain/items";
import { minutesBetween } from "@/domain/time";
import { useT } from "@/i18n";
import { useFormat } from "@/lib/prefs";
import { type Provider, resolveProviders, type SegmentLike, segmentAirline } from "@/lib/providers";
import { ProviderLogo } from "@/ui/provider";

/** One-line "when" of an item, in the local times of its places. */
export function useWhen() {
  const t = useT();
  const f = useFormat();
  return (i: PlanItem): string => {
    if (isJourney(i)) {
      if (i.segments.length === 0) return t("item.noSegments");
      return i.segments
        .map(
          (s) =>
            `${segmentFrom(s.segment) ?? "?"}→${segmentTo(s.segment) ?? "?"} ${f.date(s.segment.depart_local?.slice(0, 10), "short")} ${f.localTime(s.segment.depart_local)}`,
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
    if (isJourney(i) && i.start && i.end) {
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

/**
 * Provider and platform with their logos (recognised offline from the name, link or flight numbers),
 * followed by the stored link. A logo opens the provider's website.
 */
export function ProviderLine({
  provider,
  platform,
  url,
  segments,
  showUrl = true,
  fallback = null,
}: {
  provider: string | null;
  platform: string | null;
  url: string | null;
  segments?: SegmentLike[];
  showUrl?: boolean;
  /** Shown when there is nothing to name or link. */
  fallback?: ReactNode;
}) {
  const run = useAction();
  const found = resolveProviders({ provider, platform, url }, segments);
  const open = (u: string) => void run(() => api.openUrl(u));
  const names = [
    provider ?? (found.providers.length ? found.providers.map((p) => p.name).join(" / ") : null),
    platform ?? found.platform?.name ?? null,
  ].filter(Boolean);
  const logos = [...found.providers, ...(found.platform ? [found.platform] : [])];
  if (!names.length && !(showUrl && url)) return fallback;
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
      {logos.length > 0 && (
        <span className="inline-flex shrink-0 items-center gap-0.5">
          {logos.map((p) => (
            <ProviderLogo key={p.id} provider={p} size="sm" onOpen={open} />
          ))}
        </span>
      )}
      {names.length > 0 && <span className="truncate">{names.join(" · ")}</span>}
      {showUrl && <ExternalUrl url={url} />}
    </span>
  );
}

/** The one logo that stands for an item (or one of its segments): airline, company, else platform. */
export function itemBrand(item: PlanItem, segmentId?: string): Provider | null {
  const seg = item.segments.find((s) => s.segment.id === segmentId)?.segment;
  const own = seg ? segmentAirline(seg) : null;
  if (own) return own;
  const b = item.activeBookings[0];
  const o = item.option;
  const found = resolveProviders(
    { provider: b?.provider ?? o.provider, platform: b?.platform ?? o.platform, url: b?.url ?? o.url },
    item.segments.map((s) => s.segment),
  );
  return found.providers[0] ?? found.platform;
}
