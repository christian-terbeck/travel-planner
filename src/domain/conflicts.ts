// Compatibility and conflict checks for a set of selected items. Blocking findings make a
// combination incompatible; the others are informative. Findings that cannot be evaluated
// reliably (missing times or zones) are skipped or softened instead of guessed.

import { isJourney, type PlanItem, segmentTo } from "./items";
import type { NightPlan, Period } from "./itinerary";
import {
  compareDate,
  compareInstant,
  dateRange,
  dateRuns,
  type Instant,
  minutesBetween,
  type PlainDate,
  parseDate,
} from "./time";
import type { Slot, Station, Trip } from "./types";

export type Severity = "critical" | "warning" | "info";

export type WarningCode =
  | "flight_overlap"
  | "short_connection"
  | "airport_change"
  | "overnight_layover"
  | "stay_outside_period"
  | "stay_overlap"
  | "accommodation_gap"
  | "activity_outside_period"
  | "activities_overlap"
  | "pickup_before_arrival"
  | "pickup_tight"
  | "return_after_departure"
  | "return_tight"
  | "rental_missing_on_transfer"
  | "missing_required"
  | "missing_price"
  | "outside_date_limits"
  | "nights_outside_limits"
  | "duplicate_booking"
  | "stay_outside_station"
  | "insurance_not_covering";

export interface Warning {
  key: string;
  code: WarningCode;
  severity: Severity;
  /** Makes a combination incompatible. */
  blocking: boolean;
  optionIds: string[];
  slotIds: string[];
  date: string | null;
  params: Record<string, string | number>;
}

export const MIN_CONNECTION_MINUTES = 45;

function warn(
  code: WarningCode,
  severity: Severity,
  opts: {
    blocking?: boolean;
    optionIds?: string[];
    slotIds?: string[];
    date?: string | null;
    params?: Warning["params"];
  },
): Warning {
  const optionIds = [...(opts.optionIds ?? [])].sort();
  const slotIds = [...(opts.slotIds ?? [])].sort();
  const date = opts.date ?? null;
  return {
    key: [code, optionIds.join("+"), slotIds.join("+"), date ?? ""].join("|"),
    code,
    severity,
    blocking: opts.blocking ?? false,
    optionIds,
    slotIds,
    date,
    params: opts.params ?? {},
  };
}

export interface CheckInput {
  trip: Trip;
  slots: Slot[];
  stations: Station[];
  items: PlanItem[];
  /** Slot → selected option id, or null when intentionally left out. Missing key = no choice. */
  selection: Map<string, string | null>;
  period: Period;
  nights: NightPlan;
}

const ids = (...items: PlanItem[]) => items.map((i) => i.option.id);

function overlapMinutes(a: PlanItem, b: PlanItem): number {
  if (!a.start || !a.end || !b.start || !b.end) return 0;
  const start = compareInstant(a.start, b.start) > 0 ? a.start : b.start;
  const end = compareInstant(a.end, b.end) < 0 ? a.end : b.end;
  return Math.max(0, minutesBetween(start, end));
}

export function checkPlan(input: CheckInput): Warning[] {
  const { trip, items, period, nights } = input;
  const out: Warning[] = [];
  const journeys = items.filter(isJourney);
  const stays = items.filter((i) => i.accommodation);
  const cars = items.filter((i) => i.rentalCar);
  const activities = items.filter((i) => i.activity && (i.kind === "activity" || i.kind === "other"));
  const insurances = items.filter((i) => i.kind === "insurance");

  // Flights and other transport: order, connections and overlaps.
  const segs = journeys
    .flatMap((i) => i.segments.map((s) => ({ s, item: i })))
    .filter((x) => x.s.depart && x.s.arrive)
    .sort((a, b) => compareInstant(a.s.depart as Instant, b.s.depart as Instant));
  for (let k = 1; k < segs.length; k++) {
    const prev = segs[k - 1];
    const next = segs[k];
    if (!prev || !next) continue;
    const gap = minutesBetween(prev.s.arrive as Instant, next.s.depart as Instant);
    const pair = [...new Set([prev.item.option.id, next.item.option.id])];
    const approximate = prev.s.approximate || next.s.approximate;
    if (gap < 0) {
      if (!approximate)
        out.push(
          warn("flight_overlap", "critical", { blocking: true, optionIds: pair, params: { minutes: -gap } }),
        );
      continue;
    }
    const sameTrip = gap <= 24 * 60;
    if (!sameTrip) continue;
    if (gap < MIN_CONNECTION_MINUTES && !approximate) {
      out.push(
        warn("short_connection", "warning", {
          optionIds: pair,
          params: { minutes: gap, at: segmentTo(prev.s.segment) ?? "" },
        }),
      );
    }
    const arriveAt = segmentTo(prev.s.segment);
    // Changing airports is worth a note; moving between a station and an airport is the point of transport.
    const [arrAirport, depAirport] = [prev.s.segment.to_airport, next.s.segment.from_airport];
    if (arrAirport && depAirport && arrAirport !== depAirport) {
      out.push(
        warn("airport_change", "info", { optionIds: pair, params: { from: arrAirport, to: depAirport } }),
      );
    }
    if (
      prev.s.arriveDate &&
      next.s.departDate &&
      compareDate(prev.s.arriveDate, next.s.departDate) < 0 &&
      gap >= 6 * 60
    ) {
      out.push(
        warn("overnight_layover", "info", {
          optionIds: pair,
          date: prev.s.arriveDate.toString(),
          params: { at: arriveAt ?? "", minutes: gap },
        }),
      );
    }
  }

  // Stays against the period and each other.
  const transportKnown = period.source === "transport" && period.start && period.end;
  for (const s of stays) {
    if (!s.startDate || !s.endDate) continue;
    if (
      transportKnown &&
      (compareDate(s.endDate, period.start as PlainDate) <= 0 ||
        compareDate(s.startDate, period.end as PlainDate) >= 0)
    ) {
      out.push(warn("stay_outside_period", "critical", { blocking: true, optionIds: ids(s) }));
    }
  }
  for (let a = 0; a < stays.length; a++) {
    for (let b = a + 1; b < stays.length; b++) {
      const x = stays[a] as PlanItem;
      const y = stays[b] as PlanItem;
      if (!x.startDate || !x.endDate || !y.startDate || !y.endDate) continue;
      const from = compareDate(x.startDate, y.startDate) > 0 ? x.startDate : y.startDate;
      const to = compareDate(x.endDate, y.endDate) < 0 ? x.endDate : y.endDate;
      const n = dateRange(from, to).length;
      if (n > 0) {
        out.push(
          warn("stay_overlap", "warning", {
            blocking: x.slot.id !== y.slot.id,
            optionIds: ids(x, y),
            date: from.toString(),
            params: { nights: n },
          }),
        );
      }
    }
  }
  for (const [first, last] of dateRuns(nights.gaps)) {
    out.push(
      warn("accommodation_gap", "warning", {
        date: first.toString(),
        params: {
          from: first.toString(),
          to: last.toString(),
          nights: dateRange(first, last.add({ days: 1 })).length,
        },
      }),
    );
  }

  // Activities.
  for (const a of activities) {
    if (!a.startDate || !transportKnown) continue;
    const end = a.endDate ?? a.startDate;
    if (
      compareDate(a.startDate, period.start as PlainDate) < 0 ||
      compareDate(end, period.end as PlainDate) > 0
    ) {
      out.push(
        warn("activity_outside_period", "critical", {
          blocking: true,
          optionIds: ids(a),
          date: a.startDate.toString(),
        }),
      );
    } else if (period.arrival && a.start && compareInstant(a.start, period.arrival) < 0) {
      out.push(
        warn("activity_outside_period", "critical", {
          blocking: true,
          optionIds: ids(a),
          date: a.startDate.toString(),
        }),
      );
    } else if (period.departure && a.end && compareInstant(a.end, period.departure) > 0) {
      out.push(
        warn("activity_outside_period", "critical", {
          blocking: true,
          optionIds: ids(a),
          date: a.startDate.toString(),
        }),
      );
    }
  }
  for (let x = 0; x < activities.length; x++) {
    for (let y = x + 1; y < activities.length; y++) {
      const a = activities[x] as PlanItem;
      const b = activities[y] as PlanItem;
      const m = overlapMinutes(a, b);
      if (m > 0)
        out.push(
          warn("activities_overlap", "warning", {
            optionIds: ids(a, b),
            date: a.startDate?.toString(),
            params: { minutes: m },
          }),
        );
    }
  }

  // Rental cars against flights.
  for (const c of cars) {
    if (c.start && period.arrival) {
      const diff = minutesBetween(period.arrival, c.start);
      const tight = c.approximate ? 0 : trip.arrival_buffer_min;
      if (diff < 0 && !c.approximate) {
        out.push(
          warn("pickup_before_arrival", "critical", {
            blocking: true,
            optionIds: ids(c),
            params: { minutes: -diff },
          }),
        );
      } else if (diff >= 0 && diff < tight) {
        out.push(
          warn("pickup_tight", "warning", {
            optionIds: ids(c),
            params: { minutes: diff, buffer: trip.arrival_buffer_min },
          }),
        );
      }
    }
    if (c.end && period.departure) {
      const diff = minutesBetween(c.end, period.departure);
      if (diff < 0 && !c.approximate) {
        out.push(
          warn("return_after_departure", "critical", {
            blocking: true,
            optionIds: ids(c),
            params: { minutes: -diff },
          }),
        );
      } else if (diff >= 0 && diff < trip.departure_buffer_min) {
        out.push(
          warn("return_tight", "warning", {
            optionIds: ids(c),
            params: { minutes: diff, buffer: trip.departure_buffer_min },
          }),
        );
      }
    }
  }
  // Days moving between stations need transport; with a rental car planned, it should cover them.
  if (cars.length > 0 && input.stations.length > 1) {
    const stationOf = (i: PlanItem) => i.slot.station_id;
    const ordered = stays
      .filter((s) => s.startDate && stationOf(s))
      .sort((a, b) => compareDate(a.startDate as PlainDate, b.startDate as PlainDate));
    for (let k = 1; k < ordered.length; k++) {
      const prev = ordered[k - 1] as PlanItem;
      const next = ordered[k] as PlanItem;
      if (stationOf(prev) === stationOf(next) || !next.startDate) continue;
      const day = next.startDate;
      const covered = cars.some(
        (c) =>
          c.startDate && c.endDate && compareDate(c.startDate, day) <= 0 && compareDate(c.endDate, day) >= 0,
      );
      if (!covered)
        out.push(
          warn("rental_missing_on_transfer", "warning", { optionIds: ids(prev, next), date: day.toString() }),
        );
    }
  }

  // Completeness of the selection.
  for (const slot of input.slots) {
    const chosen = input.selection.get(slot.id);
    if (slot.required && chosen === undefined)
      out.push(warn("missing_required", "warning", { slotIds: [slot.id] }));
  }
  for (const i of items) {
    if (i.estimate.missing.length > 0 && i.activeBookings.length === 0) {
      out.push(warn("missing_price", "info", { optionIds: ids(i), slotIds: [i.slot.id] }));
    }
  }

  // The trip's own constraints.
  const earliest = parseDate(trip.earliest_departure);
  const latest = parseDate(trip.latest_return);
  if (period.start && earliest && compareDate(period.start, earliest) < 0) {
    out.push(
      warn("outside_date_limits", "warning", {
        date: period.start.toString(),
        params: { limit: earliest.toString(), side: "start" },
      }),
    );
  }
  if (period.end && latest && compareDate(period.end, latest) > 0) {
    out.push(
      warn("outside_date_limits", "warning", {
        date: period.end.toString(),
        params: { limit: latest.toString(), side: "end" },
      }),
    );
  }
  if (nights.evaluable) {
    const n = nights.required.length + nights.transit.length;
    if (
      (trip.min_nights !== null && n < trip.min_nights) ||
      (trip.max_nights !== null && n > trip.max_nights)
    ) {
      out.push(
        warn("nights_outside_limits", "info", {
          params: { nights: n, min: trip.min_nights ?? "", max: trip.max_nights ?? "" },
        }),
      );
    }
  }

  // Travel insurance should cover the whole trip.
  if (period.start && period.end) {
    for (const ins of insurances) {
      if (!ins.startDate) continue;
      const end = ins.endDate ?? ins.startDate;
      if (compareDate(ins.startDate, period.start) > 0 || compareDate(end, period.end) < 0) {
        out.push(
          warn("insurance_not_covering", "warning", {
            optionIds: ids(ins),
            params: { from: period.start.toString(), to: period.end.toString() },
          }),
        );
      }
    }
  }

  // Stays assigned to a station but outside its planned dates.
  const stations = new Map(input.stations.map((s) => [s.id, s]));
  for (const s of stays) {
    const st = s.slot.station_id ? stations.get(s.slot.station_id) : undefined;
    const a = parseDate(st?.arrive_date);
    const d = parseDate(st?.depart_date);
    if (!st || !a || !d || !s.startDate || !s.endDate) continue;
    if (compareDate(s.startDate, a) < 0 || compareDate(s.endDate, d) > 0) {
      out.push(warn("stay_outside_station", "info", { optionIds: ids(s), params: { station: st.name } }));
    }
  }
  return out;
}

/** Bookings that look like duplicates: two booked options in the same slot, or a repeated reference. */
export function duplicateBookings(items: PlanItem[]): Warning[] {
  const out: Warning[] = [];
  const bySlot = new Map<string, PlanItem[]>();
  for (const i of items)
    if (i.activeBookings.length > 0) bySlot.set(i.slot.id, [...(bySlot.get(i.slot.id) ?? []), i]);
  for (const [slotId, list] of bySlot) {
    if (list.length > 1)
      out.push(warn("duplicate_booking", "warning", { optionIds: ids(...list), slotIds: [slotId] }));
  }
  const byRef = new Map<string, PlanItem[]>();
  for (const i of items) {
    for (const b of i.activeBookings) {
      const ref = b.reference?.trim().toUpperCase();
      if (ref) byRef.set(ref, [...(byRef.get(ref) ?? []), i]);
    }
  }
  for (const [ref, list] of byRef) {
    const distinct = [...new Set(list)];
    // Several bookings of one flight option (outbound/return) may share a reference.
    if (
      distinct.length > 1 &&
      new Set(distinct.map((i) => i.slot.id)).size > 1 &&
      distinct.every((i) => i.kind === distinct[0]?.kind)
    ) {
      out.push(
        warn("duplicate_booking", "warning", { optionIds: ids(...distinct), params: { reference: ref } }),
      );
    }
  }
  return out;
}

export function withoutDismissed(warnings: Warning[], dismissed: Iterable<string>): Warning[] {
  const keys = new Set(dismissed);
  return warnings.filter((w) => !keys.has(w.key));
}
