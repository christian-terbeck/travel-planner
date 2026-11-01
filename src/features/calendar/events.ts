// Calendar events derived from a trip's plan (or a previewed scenario).

import { isJourney, type PlanItem, segmentFrom, segmentTo } from "@/domain/items";
import type { Selection } from "@/domain/scenarios";
import { type Instant, type PlainDate, parseDate, Temporal } from "@/domain/time";
import type { SlotKind } from "@/domain/types";
import type { EffectiveStatus, TripModel } from "@/lib/model";

export interface CalEvent {
  key: string;
  tripId: string;
  tripTitle: string;
  optionId: string;
  kind: SlotKind;
  title: string;
  subtitle: string | null;
  /** Timed events. */
  start: Instant | null;
  end: Instant | null;
  /** Zone the event's times are printed in (departure zone for flights). */
  tz: string;
  /** Calendar days covered, inclusive. */
  firstDay: PlainDate;
  lastDay: PlainDate;
  allDay: boolean;
  status: EffectiveStatus;
  attention: boolean;
  /** Shown from a scenario preview, not the current plan. */
  preview: boolean;
  /** An alternative outside the plan (shown faintly when requested). */
  alternative: boolean;
}

export interface EventOptions {
  /** Shows these choices instead of the plan (preview), without changing anything. */
  previewSelection?: Selection | null;
  includeAlternatives?: boolean;
}

function dayOf(i: Instant, tz: string): PlainDate {
  return i.toZonedDateTimeISO(tz).toPlainDate();
}

export function itemEvents(
  m: TripModel,
  item: PlanItem,
  flags: { preview: boolean; alternative: boolean; attention: boolean },
): CalEvent[] {
  const base = {
    tripId: m.graph.trip.id,
    tripTitle: m.graph.trip.title,
    optionId: item.option.id,
    kind: item.kind,
    status: m.effectiveStatus(item),
    ...flags,
  };
  const out: CalEvent[] = [];
  if (isJourney(item)) {
    for (const s of item.segments) {
      if (!s.depart || !s.arrive) continue;
      const tz = s.segment.depart_tz ?? m.tz;
      out.push({
        ...base,
        key: `${s.segment.id}`,
        title: `${segmentFrom(s.segment) ?? "?"} → ${segmentTo(s.segment) ?? "?"}`,
        subtitle: [s.segment.flight_number, item.option.title].filter(Boolean).join(" · "),
        start: s.depart,
        end: s.arrive,
        tz,
        firstDay: s.departDate ?? dayOf(s.depart, tz),
        lastDay: s.arriveDate ?? dayOf(s.arrive, s.segment.arrive_tz ?? tz),
        allDay: false,
      });
    }
    return out;
  }
  if ((item.accommodation || item.rentalCar) && item.startDate && item.endDate) {
    const tz = item.accommodation?.tz ?? item.rentalCar?.pickup_tz ?? m.tz;
    out.push({
      ...base,
      key: item.option.id,
      title: item.option.title,
      subtitle: item.accommodation
        ? (item.accommodation.address ?? item.option.provider)
        : (item.rentalCar?.pickup_location ?? item.option.provider),
      start: item.start,
      end: item.end,
      tz,
      firstDay: item.startDate,
      lastDay: item.endDate,
      allDay: true,
    });
    return out;
  }
  if (item.startDate) {
    const tz = item.activity?.tz ?? m.tz;
    out.push({
      ...base,
      key: item.option.id,
      title: item.option.title,
      subtitle: item.activity?.location ?? item.option.provider,
      start: item.start,
      end: item.end,
      tz,
      firstDay: item.startDate,
      lastDay: item.endDate ?? item.startDate,
      allDay: !item.start,
    });
  }
  return out;
}

export function tripEvents(m: TripModel, opts: EventOptions = {}): CalEvent[] {
  const selection = opts.previewSelection ?? m.plan.selection;
  const preview = !!opts.previewSelection;
  const chosen = new Set([...selection.values()].filter((x): x is string => !!x));
  // Bookings always stay on the calendar, even when a preview picks something else.
  for (const item of m.ctx.items.values()) if (item.activeBookings.length > 0) chosen.add(item.option.id);
  const attention = new Set(m.plan.warnings.filter((w) => w.severity !== "info").flatMap((w) => w.optionIds));
  const out: CalEvent[] = [];
  for (const item of m.ctx.items.values()) {
    const inPlan = chosen.has(item.option.id);
    const cancelled = item.option.status === "cancelled";
    if (!inPlan && !(opts.includeAlternatives && !cancelled && item.option.decision !== "rejected")) continue;
    const isPreview =
      preview &&
      inPlan &&
      m.plan.selection.get(item.slot.id) !== item.option.id &&
      item.activeBookings.length === 0;
    out.push(
      ...itemEvents(m, item, {
        preview: isPreview,
        alternative: !inPlan,
        attention: attention.has(item.option.id),
      }),
    );
  }
  return out;
}

/** Items of the selection without any date (flexible ideas). */
export function unscheduled(m: TripModel, selection?: Selection | null): PlanItem[] {
  const sel = selection ?? m.plan.selection;
  return [...sel.values()]
    .map((id) => m.item(id))
    .filter((i): i is PlanItem => !!i && !i.startDate && !isJourney(i));
}

export function eventsOnDay(events: CalEvent[], day: PlainDate): CalEvent[] {
  return events.filter(
    (e) =>
      Temporal.PlainDate.compare(e.firstDay, day) <= 0 && Temporal.PlainDate.compare(e.lastDay, day) >= 0,
  );
}

export function startOfWeek(d: PlainDate): PlainDate {
  return d.subtract({ days: d.dayOfWeek - 1 });
}

export function parseDay(s: string | null): PlainDate | null {
  return parseDate(s);
}
