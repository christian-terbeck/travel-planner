// Effective travel period and overnight stays derived from the selected items.

import type { PlanItem, ResolvedSegment } from "./items";
import {
  compareDate,
  compareInstant,
  dateRange,
  daysBetween,
  type Instant,
  maxDate,
  minDate,
  type PlainDate,
  parseDate,
} from "./time";
import type { Trip } from "./types";

/** Segments further apart than this belong to separate journeys (outbound, internal, return). */
export const JOURNEY_GAP_MINUTES = 24 * 60;

export interface Journey {
  segments: ResolvedSegment[];
  depart: Instant | null;
  arrive: Instant | null;
  departDate: PlainDate | null;
  arriveDate: PlainDate | null;
  /** Local dates of nights spent in the air or at a connection inside this journey. */
  nightsInTransit: PlainDate[];
}

export type PeriodSource = "transport" | "accommodation" | "items" | "preferred" | "none";

export interface Period {
  start: PlainDate | null;
  end: PlainDate | null;
  source: PeriodSource;
  /** Arrival of the first journey at the destination. */
  arrival: Instant | null;
  /** Departure of the last journey (return), when there is more than one journey. */
  departure: Instant | null;
  journeys: Journey[];
}

export function journeys(items: PlanItem[]): Journey[] {
  const segs = items
    .flatMap((i) => i.segments)
    .filter((s) => s.depart && s.arrive)
    .sort((a, b) => compareInstant(a.depart as Instant, b.depart as Instant));
  const out: Journey[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    const lastArrive = last?.segments[last.segments.length - 1]?.arrive;
    const gap =
      lastArrive && s.depart
        ? (s.depart.epochMilliseconds - lastArrive.epochMilliseconds) / 60_000
        : Infinity;
    if (last && gap <= JOURNEY_GAP_MINUTES) last.segments.push(s);
    else
      out.push({
        segments: [s],
        depart: null,
        arrive: null,
        departDate: null,
        arriveDate: null,
        nightsInTransit: [],
      });
  }
  for (const j of out) {
    const first = j.segments[0];
    const last = j.segments[j.segments.length - 1];
    j.depart = first?.depart ?? null;
    j.arrive = last?.arrive ?? null;
    j.departDate = first?.departDate ?? null;
    j.arriveDate = last?.arriveDate ?? null;
    if (j.departDate && j.arriveDate && compareDate(j.departDate, j.arriveDate) < 0) {
      j.nightsInTransit = dateRange(j.departDate, j.arriveDate);
    }
  }
  return out;
}

export function tripPeriod(trip: Trip, items: PlanItem[]): Period {
  const js = journeys(items);
  const base = { arrival: null, departure: null, journeys: js };
  if (js.length > 0) {
    const first = js[0] as Journey;
    const last = js[js.length - 1] as Journey;
    return {
      start: first.departDate,
      end: last.arriveDate,
      source: "transport",
      arrival: first.arrive,
      departure: js.length > 1 ? last.depart : null,
      journeys: js,
    };
  }
  const stays = items.filter((i) => i.accommodation && i.startDate && i.endDate);
  if (stays.length > 0) {
    return {
      ...base,
      start: stays.map((s) => s.startDate).reduce(minDate, null),
      end: stays.map((s) => s.endDate).reduce(maxDate, null),
      source: "accommodation",
    };
  }
  const dated = items.filter((i) => i.startDate);
  if (dated.length > 0) {
    return {
      ...base,
      start: dated.map((s) => s.startDate).reduce(minDate, null),
      end: dated.map((s) => s.endDate ?? s.startDate).reduce(maxDate, null),
      source: "items",
    };
  }
  const ps = parseDate(trip.preferred_start);
  const pe = parseDate(trip.preferred_end);
  if (ps && pe) return { ...base, start: ps, end: pe, source: "preferred" };
  return { ...base, start: null, end: null, source: "none" };
}

/** Travel days (inclusive) of a period. */
export function travelDays(p: Period): number | null {
  return p.start && p.end ? daysBetween(p.start, p.end) + 1 : null;
}

export interface NightPlan {
  /** Nights that need a place to sleep (local dates of the evening). */
  required: PlainDate[];
  covered: Map<string, string[]>;
  gaps: PlainDate[];
  overlaps: PlainDate[];
  open: PlainDate[];
  transit: PlainDate[];
  /** False when the period is not known well enough to say which nights need a bed. */
  evaluable: boolean;
}

/**
 * Required nights run from the arrival at the destination to the departure of the return
 * journey (or the last check-out for one-way trips), minus nights in transit and nights the
 * user marked as intentionally open.
 */
export function nightPlan(period: Period, items: PlanItem[], openNights: string[]): NightPlan {
  const stays = items.filter((i) => i.accommodation && i.startDate && i.endDate);
  const covered = new Map<string, string[]>();
  for (const s of stays) {
    for (const d of dateRange(s.startDate as PlainDate, s.endDate as PlainDate)) {
      const k = d.toString();
      covered.set(k, [...(covered.get(k) ?? []), s.option.id]);
    }
  }
  const lastCheckout = stays.map((s) => s.endDate).reduce(maxDate, null);
  const js = period.journeys;
  let from: PlainDate | null = null;
  let to: PlainDate | null = null;
  if (js.length > 1) {
    from = js[0]?.arriveDate ?? null;
    to = js[js.length - 1]?.departDate ?? null;
  } else if (js.length === 1) {
    from = js[0]?.arriveDate ?? null;
    to = lastCheckout;
  } else if (period.start && period.end) {
    from = period.start;
    to = period.end;
  }
  const transit = js.slice(1, -1).flatMap((j) => j.nightsInTransit);
  const transitKeys = new Set(transit.map(String));
  const openKeys = new Set(openNights);
  const evaluable = !!(from && to && compareDate(from, to) <= 0);
  const required = evaluable
    ? dateRange(from as PlainDate, to as PlainDate).filter((d) => !transitKeys.has(d.toString()))
    : [];
  const gaps = required.filter((d) => !covered.has(d.toString()) && !openKeys.has(d.toString()));
  const overlaps = [...covered.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([d]) => parseDate(d) as PlainDate);
  return {
    required,
    covered,
    gaps,
    overlaps: overlaps.sort(compareDate),
    open: required.filter((d) => openKeys.has(d.toString())),
    transit,
    evaluable,
  };
}
