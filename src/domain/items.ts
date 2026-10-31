// Turns the stored rows of a trip into plan items: one per option, with resolved instants,
// nights, rental days and an estimated cost that is explicit about what is unknown.

import { addCost, addTo, type CostSum, emptyCost } from "./money";
import { type Instant, type PlainDate, parseDate, Temporal, zoned, zonedFromParts } from "./time";
import type {
  AccommodationDetails,
  ActivityDetails,
  Booking,
  CancellationPolicy,
  FlightSegment,
  OptionFee,
  PlanOption,
  RentalCarDetails,
  Slot,
  SlotKind,
  TripGraph,
} from "./types";

export interface ResolvedSegment {
  segment: FlightSegment;
  depart: Instant | null;
  arrive: Instant | null;
  departDate: PlainDate | null;
  arriveDate: PlainDate | null;
  /** A zone was missing; times were read as UTC. */
  approximate: boolean;
}

export interface PlanItem {
  option: PlanOption;
  slot: Slot;
  kind: SlotKind;
  segments: ResolvedSegment[];
  accommodation: AccommodationDetails | null;
  rentalCar: RentalCarDetails | null;
  activity: ActivityDetails | null;
  fees: OptionFee[];
  /** Policy as offered (option) — the booked terms live on the booking. */
  policy: CancellationPolicy | null;
  bookings: Booking[];
  activeBookings: Booking[];
  /** Timed span (flights, car, timed activities). */
  start: Instant | null;
  end: Instant | null;
  /** Local dates the item touches (stays: check-in → check-out). */
  startDate: PlainDate | null;
  endDate: PlainDate | null;
  /** Accommodation nights. */
  nights: number | null;
  /** Chargeable rental days. */
  rentalDays: number | null;
  /** Estimated cost of the option as planned (price and additional fees). */
  estimate: CostSum;
  /** The additional fees alone (not included in the price). */
  feeCost: CostSum;
  /** Assumptions the estimate relies on (e.g. "price per person × 2"). */
  assumptions: string[];
  approximate: boolean;
}

export interface ItemContext {
  /** People the trip is planned for, when known. */
  travelerCount: number | null;
  /** Zone used when a time has none. */
  fallbackTz: string;
}

export function travelerCount(g: TripGraph): number | null {
  return g.travelers.length > 0 ? g.travelers.length : null;
}

export function resolveSegment(s: FlightSegment, fallbackTz: string): ResolvedSegment {
  const d = zoned(s.depart_local, s.depart_tz, fallbackTz);
  const a = zoned(s.arrive_local, s.arrive_tz, fallbackTz);
  return {
    segment: s,
    depart: d?.zdt.toInstant() ?? null,
    arrive: a?.zdt.toInstant() ?? null,
    departDate: d?.zdt.toPlainDate() ?? null,
    arriveDate: a?.zdt.toPlainDate() ?? null,
    approximate: !!(d?.approximate || a?.approximate),
  };
}

/**
 * Chargeable rental days. "24h": every started 24-hour block after a grace period counts;
 * "calendar": every calendar day from pickup to return counts.
 */
export function rentalDays(r: RentalCarDetails, fallbackTz: string): number | null {
  const p = zoned(r.pickup_local, r.pickup_tz, fallbackTz);
  const ret = zoned(r.return_local, r.return_tz, fallbackTz);
  if (!p || !ret) return null;
  if (r.day_rule === "calendar") {
    const days = p.zdt.toPlainDate().until(ret.zdt.toPlainDate(), { largestUnit: "days" }).days + 1;
    return days > 0 ? days : null;
  }
  const minutes = (ret.zdt.epochMilliseconds - p.zdt.epochMilliseconds) / 60_000;
  if (minutes <= 0) return null;
  return Math.max(1, Math.ceil((minutes - r.grace_minutes) / 1440));
}

export function accommodationNights(a: AccommodationDetails): number | null {
  const i = parseDate(a.check_in);
  const o = parseDate(a.check_out);
  if (!i || !o) return null;
  const n = i.until(o, { largestUnit: "days" }).days;
  return n > 0 ? n : null;
}

function activitySpan(a: ActivityDetails, fallbackTz: string) {
  const s = a.start_time ? zonedFromParts(a.start_date, a.start_time, a.tz, fallbackTz) : null;
  let e = a.end_time ? zonedFromParts(a.end_date ?? a.start_date, a.end_time, a.tz, fallbackTz) : null;
  if (!e && s && a.duration_min)
    e = { zdt: s.zdt.add({ minutes: a.duration_min }), approximate: s.approximate };
  return {
    start: s?.zdt.toInstant() ?? null,
    end: e?.zdt.toInstant() ?? null,
    startDate: parseDate(a.start_date),
    endDate: parseDate(a.end_date) ?? parseDate(a.start_date),
    approximate: !!s?.approximate,
  };
}

/** Planned cost of an option, honest about missing prices and assumed quantities. */
export function estimateOption(
  option: PlanOption,
  fees: OptionFee[],
  quantities: {
    nights: number | null;
    rentalDays: number | null;
    days: number | null;
    people: number | null;
  },
): { estimate: CostSum; feeCost: CostSum; assumptions: string[] } {
  const estimate = emptyCost();
  const feeCost = emptyCost();
  const assumptions: string[] = [];
  if (option.price_minor === null) {
    estimate.missing.push(option.id);
  } else {
    let factor: number | null = 1;
    switch (option.price_basis) {
      case "per_person":
        factor = option.party_size ?? quantities.people;
        if (factor === null) assumptions.push("per_person_unknown_count");
        break;
      case "per_night":
        factor = quantities.nights;
        break;
      case "per_day":
        factor = quantities.rentalDays ?? quantities.days;
        break;
      case "total":
        break;
    }
    if (factor === null) estimate.missing.push(option.id);
    else addTo(estimate.totals, { minor: option.price_minor * factor, currency: option.currency });
  }
  for (const f of fees) {
    if (f.included) continue;
    if (f.amount_minor === null) feeCost.missing.push(`${option.id}:fee:${f.id}`);
    else addTo(feeCost.totals, { minor: f.amount_minor, currency: f.currency });
  }
  addCost(estimate, feeCost);
  return { estimate, feeCost, assumptions };
}

export function buildItems(g: TripGraph, ctx: ItemContext): Map<string, PlanItem> {
  const slots = new Map(g.slots.map((s) => [s.id, s]));
  const group = <T extends { option_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.option_id, [...(m.get(r.option_id) ?? []), r]);
    return m;
  };
  const segs = group(g.flight_segments);
  const fees = group(g.option_fees);
  const acc = new Map(g.accommodation_details.map((a) => [a.option_id, a]));
  const cars = new Map(g.rental_car_details.map((r) => [r.option_id, r]));
  const acts = new Map(g.activity_details.map((a) => [a.option_id, a]));
  const policies = new Map(
    g.cancellation_policies.filter((p) => p.option_id).map((p) => [p.option_id as string, p]),
  );
  const bookings = group(g.bookings);

  const items = new Map<string, PlanItem>();
  for (const option of g.options) {
    const slot = slots.get(option.slot_id);
    if (!slot) continue;
    const segments = (segs.get(option.id) ?? [])
      .slice()
      .sort((a, b) => Number(a.seq) - Number(b.seq))
      .map((s) => resolveSegment(s, ctx.fallbackTz));
    const accommodation = acc.get(option.id) ?? null;
    const rentalCar = cars.get(option.id) ?? null;
    const activity = acts.get(option.id) ?? null;
    let start: Instant | null = null;
    let end: Instant | null = null;
    let startDate: PlainDate | null = null;
    let endDate: PlainDate | null = null;
    let approximate = segments.some((s) => s.approximate);

    if (segments.length > 0) {
      start = segments[0]?.depart ?? null;
      end = segments[segments.length - 1]?.arrive ?? null;
      startDate = segments[0]?.departDate ?? null;
      endDate = segments[segments.length - 1]?.arriveDate ?? null;
    }
    if (accommodation) {
      startDate = parseDate(accommodation.check_in);
      endDate = parseDate(accommodation.check_out);
      const tz = accommodation.tz ?? ctx.fallbackTz;
      if (startDate)
        start =
          zonedFromParts(
            accommodation.check_in,
            accommodation.check_in_time ?? "15:00",
            tz,
          )?.zdt.toInstant() ?? null;
      if (endDate)
        end =
          zonedFromParts(
            accommodation.check_out,
            accommodation.check_out_time ?? "11:00",
            tz,
          )?.zdt.toInstant() ?? null;
    }
    let days: number | null = null;
    if (rentalCar) {
      const p = zoned(rentalCar.pickup_local, rentalCar.pickup_tz, ctx.fallbackTz);
      const r = zoned(rentalCar.return_local, rentalCar.return_tz, ctx.fallbackTz);
      start = p?.zdt.toInstant() ?? null;
      end = r?.zdt.toInstant() ?? null;
      startDate = p?.zdt.toPlainDate() ?? null;
      endDate = r?.zdt.toPlainDate() ?? null;
      approximate = !!(p?.approximate || r?.approximate);
    }
    if (activity) {
      const span = activitySpan(activity, ctx.fallbackTz);
      ({ start, end, startDate, endDate } = span);
      approximate = span.approximate;
      if (startDate && endDate) days = startDate.until(endDate, { largestUnit: "days" }).days + 1;
    }
    const nights = accommodation ? accommodationNights(accommodation) : null;
    const rDays = rentalCar ? rentalDays(rentalCar, ctx.fallbackTz) : null;
    const optionFees = fees.get(option.id) ?? [];
    const { estimate, feeCost, assumptions } = estimateOption(option, optionFees, {
      nights,
      rentalDays: rDays,
      days,
      people: ctx.travelerCount,
    });
    const all = bookings.get(option.id) ?? [];
    items.set(option.id, {
      option,
      slot,
      kind: slot.kind,
      segments,
      accommodation,
      rentalCar,
      activity,
      fees: optionFees,
      policy: policies.get(option.id) ?? null,
      bookings: all,
      activeBookings: all.filter((b) => b.status === "active"),
      start,
      end,
      startDate,
      endDate,
      nights,
      rentalDays: rDays,
      estimate,
      feeCost,
      assumptions,
      approximate,
    });
  }
  return items;
}

/** Confirmed cost of an item: the sum of its active bookings (unknown booked prices are missing). */
export function confirmedCost(item: PlanItem): CostSum {
  const c = emptyCost();
  for (const b of item.activeBookings) {
    if (b.price_minor === null) c.missing.push(b.id);
    else addTo(c.totals, { minor: b.price_minor, currency: b.currency });
  }
  return c;
}

/**
 * Cost to count for an item in a plan: what was booked where a booking exists, the estimate
 * otherwise. Additional fees (paid on top, e.g. on site) are counted in both cases.
 */
export function planCost(item: PlanItem): CostSum {
  if (item.activeBookings.length === 0) return item.estimate;
  return addCost(confirmedCost(item), item.feeCost);
}

/** The price part of `planCost`, without additional fees. */
export function planBaseCost(item: PlanItem): CostSum {
  if (item.activeBookings.length > 0) return confirmedCost(item);
  const base: CostSum = { totals: {}, missing: item.estimate.missing.filter((m) => !m.includes(":fee:")) };
  for (const [c, v] of Object.entries(item.estimate.totals)) {
    const rest = v - (item.feeCost.totals[c] ?? 0);
    if (rest !== 0) base.totals[c] = rest;
  }
  return base;
}

export function instantDate(i: Instant, tz: string): PlainDate {
  return i.toZonedDateTimeISO(tz).toPlainDate();
}

export { Temporal };
