import { AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import { compareDate, compareInstant, type PlainDate, Temporal } from "@/domain/time";
import { useT } from "@/i18n";
import { useFormat } from "@/lib/prefs";
import { cn } from "@/ui/core";
import { KindIcon, statusStyle } from "@/ui/status";
import { type CalEvent, eventsOnDay, startOfWeek } from "./events";

/** Visual treatment by status: booked solid, planned dashed, preview outlined, cancelled struck. */
export function eventClass(e: CalEvent): string {
  const tone = statusStyle[e.status].tone;
  const solid: Record<string, string> = {
    ok: "bg-ok text-white border-ok",
    primary: "bg-primary-soft text-primary border-primary",
    neutral: "bg-muted-soft text-fg-2 border-line-strong",
    danger: "bg-danger-soft text-danger border-danger line-through",
    idea: "bg-idea-soft text-idea border-idea",
    warn: "bg-warn-soft text-warn border-warn",
    info: "bg-info-soft text-info border-info",
    accent: "bg-accent-soft text-accent border-accent",
  };
  return cn(
    "border",
    solid[tone],
    e.status !== "booked" && e.status !== "completed" && "border-dashed",
    e.preview && "ring-2 ring-accent ring-offset-1 ring-offset-surface",
    e.alternative && "opacity-55",
    e.status === "completed" && "opacity-70",
  );
}

export function EventChip({
  e,
  onOpen,
  showTrip,
}: {
  e: CalEvent;
  onOpen: (e: CalEvent) => void;
  showTrip?: boolean;
}) {
  const t = useT();
  const f = useFormat();
  return (
    <button
      type="button"
      onClick={() => onOpen(e)}
      title={`${e.title}${e.subtitle ? ` · ${e.subtitle}` : ""} — ${t(`status.${e.status}`)}${e.preview ? ` (${t("calendar.preview")})` : ""}`}
      className={cn(
        "flex w-full min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-left text-[11px] leading-4",
        eventClass(e),
      )}
    >
      <KindIcon kind={e.kind} className="size-3 shrink-0" />
      {!e.allDay && e.start && <span className="tabular shrink-0 opacity-80">{f.time(e.start, e.tz)}</span>}
      <span className="truncate">
        {showTrip ? `${e.tripTitle}: ` : ""}
        {e.title}
      </span>
      {e.attention && <AlertTriangle className="size-3 shrink-0" aria-label={t("calendar.attention")} />}
    </button>
  );
}

interface Bar {
  e: CalEvent;
  col: number;
  span: number;
  lane: number;
}

/** Lays out multi-day events of one week into non-overlapping lanes. */
function weekBars(events: CalEvent[], weekStart: PlainDate): Bar[] {
  const weekEnd = weekStart.add({ days: 6 });
  const multi = events
    .filter((e) => e.allDay || compareDate(e.firstDay, e.lastDay) !== 0)
    .filter((e) => compareDate(e.lastDay, weekStart) >= 0 && compareDate(e.firstDay, weekEnd) <= 0)
    .sort((a, b) => compareDate(a.firstDay, b.firstDay) || compareDate(b.lastDay, a.lastDay));
  const lanes: PlainDate[] = [];
  const bars: Bar[] = [];
  for (const e of multi) {
    const from = compareDate(e.firstDay, weekStart) < 0 ? weekStart : e.firstDay;
    const to = compareDate(e.lastDay, weekEnd) > 0 ? weekEnd : e.lastDay;
    let lane = lanes.findIndex((end) => compareDate(end, from) < 0);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(to);
    } else lanes[lane] = to;
    bars.push({ e, col: from.dayOfWeek, span: from.until(to, { largestUnit: "days" }).days + 1, lane });
  }
  return bars;
}

export function MonthView({
  month,
  events,
  today,
  onOpen,
  showTrip,
  highlight,
}: {
  month: Temporal.PlainYearMonth;
  events: CalEvent[];
  today: PlainDate;
  onOpen: (e: CalEvent) => void;
  showTrip?: boolean;
  highlight?: (d: PlainDate) => "gap" | "trip" | null;
}) {
  const f = useFormat();
  const first = startOfWeek(month.toPlainDate({ day: 1 }));
  const weeks = Array.from({ length: 6 }, (_, i) => first.add({ weeks: i })).filter(
    (w, i) => i < 5 || w.month === month.month,
  );
  const dayNames = Array.from(
    { length: 7 },
    (_, i) => f.date(first.add({ days: i }), "weekday").split(",")[0],
  );
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-7 border-line border-b bg-surface-2 text-fg-3 text-xs">
        {dayNames.map((d, i) => (
          <div key={i} className="px-2 py-1.5 font-medium">
            {d}
          </div>
        ))}
      </div>
      {weeks.map((ws) => {
        const bars = weekBars(events, ws);
        const laneCount = bars.reduce((n, b) => Math.max(n, b.lane + 1), 0);
        const days = Array.from({ length: 7 }, (_, i) => ws.add({ days: i }));
        return (
          <div key={ws.toString()} className="relative border-line border-b last:border-0">
            <div className="absolute inset-0 grid grid-cols-7">
              {days.map((d) => {
                const h = highlight?.(d);
                return (
                  <div
                    key={d.toString()}
                    className={cn(
                      "border-line border-r last:border-0",
                      d.month !== month.month && "bg-surface-2/60",
                      h === "trip" && "bg-primary-soft/30",
                      h === "gap" && "bg-warn-soft/60",
                    )}
                  />
                );
              })}
            </div>
            <div className="relative grid grid-cols-7">
              {days.map((d) => (
                <div key={d.toString()} className="px-2 pt-1 text-right text-xs">
                  <span
                    className={cn(
                      "tabular inline-flex size-5 items-center justify-center rounded-full",
                      d.equals(today) && "bg-primary font-semibold text-on-primary",
                      d.month !== month.month && "text-fg-3",
                    )}
                  >
                    {d.day}
                  </span>
                </div>
              ))}
            </div>
            {laneCount > 0 && (
              <div
                className="relative grid grid-cols-7 gap-y-0.5 px-0.5"
                style={{ gridTemplateRows: `repeat(${laneCount}, auto)` }}
              >
                {bars.map((b) => (
                  <div
                    key={`${b.e.key}-${ws}`}
                    className="px-0.5"
                    style={{ gridColumn: `${b.col} / span ${b.span}`, gridRow: b.lane + 1 }}
                  >
                    <EventChip e={b.e} onOpen={onOpen} showTrip={showTrip} />
                  </div>
                ))}
              </div>
            )}
            <div className="relative grid min-h-16 grid-cols-7 pb-1">
              {days.map((d) => (
                <div key={d.toString()} className="flex min-w-0 flex-col gap-0.5 px-1 pt-0.5">
                  {eventsOnDay(events, d)
                    .filter((e) => !e.allDay && compareDate(e.firstDay, e.lastDay) === 0)
                    .sort((a, b) => (a.start && b.start ? compareInstant(a.start, b.start) : 0))
                    .map((e) => (
                      <EventChip key={e.key} e={e} onOpen={onOpen} showTrip={showTrip} />
                    ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const HOUR = 44;

export function WeekView({
  weekStart,
  events,
  today,
  tz,
  onOpen,
  showTrip,
}: {
  weekStart: PlainDate;
  events: CalEvent[];
  today: PlainDate;
  tz: string;
  onOpen: (e: CalEvent) => void;
  showTrip?: boolean;
}) {
  const t = useT();
  const f = useFormat();
  const days = Array.from({ length: 7 }, (_, i) => weekStart.add({ days: i }));
  const bars = weekBars(
    events.filter((e) => e.allDay),
    weekStart,
  );
  const lanes = bars.reduce((n, b) => Math.max(n, b.lane + 1), 0);

  // Timed events cut into per-day pieces in the displayed zone, with side-by-side lanes.
  const pieces = useMemo(() => {
    const out: Array<{ e: CalEvent; day: number; top: number; height: number; lane: number; lanes: number }> =
      [];
    days.forEach((d, di) => {
      const dayStart = d.toZonedDateTime({ timeZone: tz }).toInstant().epochMilliseconds;
      const dayEnd = d.add({ days: 1 }).toZonedDateTime({ timeZone: tz }).toInstant().epochMilliseconds;
      const list = events
        .filter((e) => !e.allDay && e.start)
        .map((e) => {
          const s = Math.max(e.start?.epochMilliseconds ?? 0, dayStart);
          const en = Math.min((e.end ?? e.start)?.epochMilliseconds ?? s, dayEnd);
          return { e, s, en: Math.max(en, s + 20 * 60_000) };
        })
        .filter((x) => x.s < dayEnd && x.en > dayStart && x.s < x.en)
        .sort((a, b) => a.s - b.s);
      const laneEnds: number[] = [];
      const placed = list.map((x) => {
        let lane = laneEnds.findIndex((end) => end <= x.s);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(x.en);
        } else laneEnds[lane] = x.en;
        return { ...x, lane };
      });
      for (const p of placed) {
        out.push({
          e: p.e,
          day: di,
          top: ((p.s - dayStart) / 3_600_000) * HOUR,
          height: Math.max(18, ((p.en - p.s) / 3_600_000) * HOUR),
          lane: p.lane,
          lanes: Math.max(1, laneEnds.length),
        });
      }
    });
    return out;
  }, [days, events, tz]);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-[56px_repeat(7,1fr)] border-line border-b bg-surface-2 text-xs">
        <div className="px-1 py-1.5 text-[10px] text-fg-3" title={t("calendar.timesIn", { tz })}>
          {tz.split("/").pop()?.replace(/_/g, " ")}
        </div>
        {days.map((d) => (
          <div
            key={d.toString()}
            className={cn("px-2 py-1.5 font-medium", d.equals(today) ? "text-primary" : "text-fg-2")}
          >
            {f.date(d, "weekday")}
          </div>
        ))}
      </div>
      {lanes > 0 && (
        <div
          className="grid grid-cols-[56px_repeat(7,1fr)] gap-y-0.5 border-line border-b py-1"
          style={{ gridTemplateRows: `repeat(${lanes}, auto)` }}
        >
          {bars.map((b) => (
            <div
              key={b.e.key}
              className="px-0.5"
              style={{ gridColumn: `${b.col + 1} / span ${b.span}`, gridRow: b.lane + 1 }}
            >
              <EventChip e={b.e} onOpen={onOpen} showTrip={showTrip} />
            </div>
          ))}
        </div>
      )}
      <div className="relative max-h-[640px] overflow-y-auto">
        <div className="grid grid-cols-[56px_repeat(7,1fr)]" style={{ height: HOUR * 24 }}>
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="tabular absolute right-1 text-[10px] text-fg-3"
                style={{ top: h * HOUR - 6 }}
              >
                {h > 0 ? `${String(h).padStart(2, "0")}:00` : ""}
              </div>
            ))}
          </div>
          {days.map((d, di) => (
            <div key={d.toString()} className="relative border-line border-l">
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-line/60 border-t"
                  style={{ top: h * HOUR }}
                />
              ))}
              {pieces
                .filter((p) => p.day === di)
                .map((p) => (
                  <button
                    key={`${p.e.key}-${di}`}
                    type="button"
                    onClick={() => onOpen(p.e)}
                    className={cn(
                      "absolute overflow-hidden rounded px-1.5 py-0.5 text-left text-[11px] leading-4",
                      eventClass(p.e),
                    )}
                    style={{
                      top: p.top,
                      height: p.height,
                      left: `${(p.lane / p.lanes) * 100}%`,
                      width: `calc(${100 / p.lanes}% - 3px)`,
                    }}
                    title={`${p.e.title} ${p.e.subtitle ?? ""}`}
                  >
                    <div className="flex items-center gap-1 font-medium">
                      <KindIcon kind={p.e.kind} className="size-3 shrink-0" />
                      <span className="truncate">
                        {showTrip ? `${p.e.tripTitle}: ` : ""}
                        {p.e.title}
                      </span>
                    </div>
                    {p.height > 30 && (
                      <div className="truncate opacity-80">
                        {f.time(p.e.start, p.e.tz)}
                        {p.e.end ? `–${f.time(p.e.end, p.e.tz)}` : ""}
                      </div>
                    )}
                  </button>
                ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AgendaView({
  events,
  onOpen,
  showTrip,
  from,
}: {
  events: CalEvent[];
  onOpen: (e: CalEvent) => void;
  showTrip?: boolean;
  from?: PlainDate;
}) {
  const t = useT();
  const f = useFormat();
  const groups = useMemo(() => {
    const byDay = new Map<string, CalEvent[]>();
    for (const e of events) {
      if (from && compareDate(e.lastDay, from) < 0) continue;
      const k = e.firstDay.toString();
      byDay.set(k, [...(byDay.get(k) ?? []), e]);
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events, from]);
  if (groups.length === 0)
    return <p className="py-8 text-center text-fg-3 text-sm">{t("calendar.nothing")}</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      {groups.map(([day, list]) => (
        <div key={day} className="grid grid-cols-[160px_1fr] border-line border-b last:border-0">
          <div className="px-4 py-2.5 font-medium text-fg-2 text-sm">{f.date(day, "long")}</div>
          <ul className="divide-y divide-line">
            {list
              .sort((a, b) => (a.start && b.start ? compareInstant(a.start, b.start) : a.allDay ? -1 : 1))
              .map((e) => (
                <li key={e.key}>
                  <button
                    type="button"
                    onClick={() => onOpen(e)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2"
                  >
                    <span className="tabular w-24 shrink-0 text-fg-3 text-xs">
                      {e.allDay
                        ? compareDate(e.firstDay, e.lastDay) < 0
                          ? t("calendar.untilDate", { date: f.date(e.lastDay, "short") })
                          : t("calendar.allDay")
                        : `${f.time(e.start, e.tz)}${e.end ? `–${f.time(e.end, e.kind === "flight" ? e.tz : e.tz)}` : ""}`}
                    </span>
                    <span
                      className={cn(
                        "inline-flex size-6 shrink-0 items-center justify-center rounded",
                        eventClass(e),
                      )}
                    >
                      <KindIcon kind={e.kind} className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("font-medium", e.status === "cancelled" && "line-through")}>
                        {showTrip ? `${e.tripTitle}: ` : ""}
                        {e.title}
                      </span>
                      {e.subtitle && <span className="ml-2 text-fg-3 text-xs">{e.subtitle}</span>}
                    </span>
                    {e.attention && (
                      <AlertTriangle className="size-4 text-warn" aria-label={t("calendar.attention")} />
                    )}
                    <span className="text-fg-3 text-xs">
                      {t(`status.${e.status}`)}
                      {e.preview ? ` · ${t("calendar.preview")}` : ""}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function Legend() {
  const t = useT();
  const sample = (status: CalEvent["status"], extra?: Partial<CalEvent>) =>
    ({
      key: status,
      status,
      kind: "activity",
      allDay: true,
      preview: false,
      alternative: false,
      attention: false,
      ...extra,
    }) as CalEvent;
  const items: Array<[string, CalEvent]> = [
    [t("status.planned"), sample("planned")],
    [t("status.preferred"), sample("preferred")],
    [t("status.booked"), sample("booked")],
    [t("status.cancelled"), sample("cancelled")],
    [t("status.completed"), sample("completed")],
    [t("calendar.preview"), sample("preferred", { preview: true })],
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-fg-3 text-xs">
      {items.map(([label, e]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={cn("inline-block h-3 w-5 rounded-sm", eventClass(e))} />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <AlertTriangle className="size-3 text-warn" aria-hidden /> {t("calendar.attention")}
      </span>
    </div>
  );
}

export { Temporal };
