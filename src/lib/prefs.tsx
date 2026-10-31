// App preferences (stored in the core's settings table) and locale-aware formatting.

import { createContext, type ReactNode, useContext, useEffect, useMemo } from "react";
import { useAppInfo } from "@/api/queries";
import { type CostSum, convertTotals, formatMoney, type Money, type Totals } from "@/domain/money";
import { defaultReminderSettings, type ReminderSettings } from "@/domain/reminders";
import { type Instant, type PlainDate, parseDate, systemTimeZone, Temporal, zoned } from "@/domain/time";
import type { ExchangeRate } from "@/domain/types";

export type Theme = "system" | "light" | "dark";

export interface Prefs {
  locale: string;
  theme: Theme;
  /** Default currency for new trips and cross-trip summaries. */
  currency: string;
  reminders: ReminderSettings;
  timeZone: string;
  rates: ExchangeRate[];
  dataDir: string;
  ready: boolean;
}

const defaultLocale = typeof navigator !== "undefined" ? navigator.language || "en-GB" : "en-GB";

const PrefsCtx = createContext<Prefs>({
  locale: defaultLocale,
  theme: "system",
  currency: "EUR",
  reminders: defaultReminderSettings,
  timeZone: systemTimeZone(),
  rates: [],
  dataDir: "",
  ready: false,
});

function parseReminders(raw: string | undefined): ReminderSettings {
  if (!raw) return defaultReminderSettings;
  try {
    return { ...defaultReminderSettings, ...(JSON.parse(raw) as Partial<ReminderSettings>) };
  } catch {
    return defaultReminderSettings;
  }
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const info = useAppInfo();
  const prefs = useMemo<Prefs>(() => {
    const s = new Map(info.data?.settings ?? []);
    return {
      locale: s.get("locale") || defaultLocale,
      theme: (s.get("theme") as Theme) || "system",
      currency: s.get("currency") || "EUR",
      reminders: parseReminders(s.get("reminders")),
      timeZone: systemTimeZone(),
      rates: info.data?.exchange_rates ?? [],
      dataDir: info.data?.data_dir ?? "",
      ready: info.isSuccess,
    };
  }, [info.data, info.isSuccess]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = prefs.theme === "dark" || (prefs.theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [prefs.theme]);

  useEffect(() => {
    document.documentElement.lang = prefs.locale;
  }, [prefs.locale]);

  return <PrefsCtx.Provider value={prefs}>{children}</PrefsCtx.Provider>;
}

export function usePrefs() {
  return useContext(PrefsCtx);
}

type DateLike = PlainDate | string | null | undefined;

const asDate = (d: DateLike): PlainDate | null => (typeof d === "string" ? parseDate(d) : (d ?? null));

/** Formatting bound to the user's locale. Dates are shown as calendar dates, times in the zone of the event. */
export function useFormat() {
  const { locale, rates } = usePrefs();
  return useMemo(() => {
    const dateFmt = (opts: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, { ...opts, timeZone: "UTC" });
    const long = dateFmt({ weekday: "short", day: "numeric", month: "short", year: "numeric" });
    const medium = dateFmt({ day: "numeric", month: "short", year: "numeric" });
    const short = dateFmt({ day: "numeric", month: "short" });
    const weekdayShort = dateFmt({ weekday: "short", day: "numeric", month: "short" });
    const monthYear = dateFmt({ month: "long", year: "numeric" });
    const toUtcDate = (d: PlainDate) => new Date(Date.UTC(d.year, d.month - 1, d.day));
    const rel = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

    const f = {
      locale,
      money: (m: Money | null | undefined, opts?: { signed?: boolean; compact?: boolean }) =>
        m ? formatMoney(m, locale, opts) : "—",
      minor: (
        minor: number | null | undefined,
        currency: string,
        opts?: { signed?: boolean; compact?: boolean },
      ) => (minor === null || minor === undefined ? "—" : formatMoney({ minor, currency }, locale, opts)),
      totals: (t: Totals, opts?: { compact?: boolean }) => {
        const parts = Object.entries(t).filter(([, v]) => v !== 0);
        return parts.length === 0
          ? formatMoney({ minor: 0, currency: Object.keys(t)[0] ?? "EUR" }, locale, opts)
          : parts.map(([c, v]) => formatMoney({ minor: v, currency: c }, locale, opts)).join(" + ");
      },
      /** A total in one currency (converted where rates exist) plus whatever could not be converted. */
      converted: (t: Totals, currency: string, opts?: { compact?: boolean }) => {
        const c = convertTotals(t, currency, rates);
        const rest = Object.entries(c.unconvertible).map(([cur, v]) =>
          formatMoney({ minor: v, currency: cur }, locale, opts),
        );
        return [formatMoney({ minor: c.minor, currency }, locale, opts), ...rest].join(" + ");
      },
      cost: (c: CostSum, currency: string) => f.converted(c.totals, currency, { compact: true }),
      date: (d: DateLike, style: "long" | "medium" | "short" | "weekday" = "medium") => {
        const pd = asDate(d);
        if (!pd) return "—";
        const fmt = { long, medium, short, weekday: weekdayShort }[style];
        return fmt.format(toUtcDate(pd));
      },
      month: (year: number, month: number) => monthYear.format(new Date(Date.UTC(year, month - 1, 1))),
      dateRange: (a: DateLike, b: DateLike) => {
        const x = asDate(a);
        const y = asDate(b);
        if (!x && !y) return "—";
        if (!x || !y) return f.date(x ?? y);
        if (x.equals(y)) return f.date(x);
        return x.year === y.year
          ? `${short.format(toUtcDate(x))} – ${medium.format(toUtcDate(y))}`
          : `${f.date(x)} – ${f.date(y)}`;
      },
      time: (i: Instant | null | undefined, tz: string) =>
        i
          ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(
              new Date(i.epochMilliseconds),
            )
          : "—",
      dateTime: (i: Instant | null | undefined, tz: string) =>
        i
          ? new Intl.DateTimeFormat(locale, {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: tz,
            }).format(new Date(i.epochMilliseconds))
          : "—",
      /** A stored local time ("2027-06-10T07:00") as printed, with the zone's city. */
      local: (local: string | null | undefined, tz: string | null | undefined) => {
        const z = zoned(local, tz ?? "UTC");
        if (!z) return "—";
        const text = new Intl.DateTimeFormat(locale, {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: z.zdt.timeZoneId,
        }).format(new Date(z.zdt.epochMilliseconds));
        return tz ? `${text} (${tzCity(tz)})` : text;
      },
      localTime: (local: string | null | undefined) => (local ? local.slice(11, 16) : "—"),
      duration: (minutes: number | null | undefined) => {
        if (minutes === null || minutes === undefined) return "—";
        const h = Math.floor(Math.abs(minutes) / 60);
        const m = Math.abs(minutes) % 60;
        const d = Temporal.Duration.from({ hours: h, minutes: m });
        try {
          return new Intl.DurationFormat(locale, { style: "narrow" }).format(d);
        } catch {
          return h > 0 ? `${h} h ${m} min` : `${m} min`;
        }
      },
      relativeDays: (days: number) => rel.format(days, "day"),
      number: (n: number) => new Intl.NumberFormat(locale).format(n),
      percent: (n: number) =>
        new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(n),
      timestamp: (iso: string | null | undefined) => {
        if (!iso) return "—";
        const d = new Date(iso);
        return Number.isNaN(d.getTime())
          ? "—"
          : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(d);
      },
    };
    return f;
  }, [locale, rates]);
}

export function tzCity(tz: string): string {
  return tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
}

declare global {
  namespace Intl {
    // Available in current WebView2; typed here until the TS lib catches up.
    class DurationFormat {
      constructor(locale?: string, opts?: { style?: string });
      format(d: unknown): string;
    }
  }
}
