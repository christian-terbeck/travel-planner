// Travel statistics over the trips actually taken: what was booked, not what was planned. A trip
// counts once it has an active booking, has started and was not cancelled. Distances come from
// the booked route (great circle for flights, estimates or road routes on the ground), countries
// from the airports used, money from bookings, cancellation costs and actual expenses.

import { estimateCo2 } from "@/domain/co2";
import { buildRoute } from "@/domain/geo";
import { travelerCount } from "@/domain/items";
import { addTo, type Converted, convertTotals, type Totals } from "@/domain/money";
import { compareDate, type PlainDate } from "@/domain/time";
import type { ExchangeRate } from "@/domain/types";
import type { Airport } from "./airports";
import type { TripModel } from "./model";

export interface TripStats {
  tripId: string;
  title: string;
  year: number;
  start: PlainDate;
  end: PlainDate;
  days: number;
  nights: number;
  km: { flight: number; ground: number };
  flights: number;
  /** ISO country codes visited (from the airports used), without the home country. */
  countries: string[];
  spent: Converted;
  /** Estimated kg CO2e per traveler for the journeys. */
  co2: number;
}

export interface Summary {
  trips: number;
  days: number;
  nights: number;
  km: { flight: number; ground: number };
  flights: number;
  countries: string[];
  spent: Converted;
  co2: number;
}

export function tripStats(
  m: TripModel,
  airports: Map<string, Airport>,
  currency: string,
  rates: ExchangeRate[],
  today: PlainDate,
): TripStats | null {
  const c = m.confirmed;
  const { start, end } = c.period;
  if (m.status === "cancelled" || c.items.length === 0 || !start || !end) return null;
  if (compareDate(start, today) > 0) return null;

  const route = buildRoute(c.items, (code) => airports.get(code) ?? null, m.tz);
  const segments = c.items.flatMap((i) => i.segments).filter((s) => s.segment.mode === null);
  const country = (code: string | null) => (code ? (airports.get(code)?.country ?? null) : null);
  const home = country(segments[0]?.segment.from_airport ?? null);
  const countries = new Set<string>();
  for (const s of segments)
    for (const code of [s.segment.from_airport, s.segment.to_airport]) {
      const k = country(code);
      if (k && k !== home) countries.add(k);
    }

  const b = m.budget;
  const spent: Totals = {};
  for (const t of [b.confirmed.totals, b.actualExpenses, b.cancellationCosts])
    for (const [cur, v] of Object.entries(t)) addTo(spent, { minor: v, currency: cur });
  for (const [cur, v] of Object.entries(b.expenseRefunds)) addTo(spent, { minor: -v, currency: cur });

  const days = start.until(end).days + 1;
  return {
    tripId: m.graph.trip.id,
    title: m.graph.trip.title,
    year: start.year,
    start,
    end,
    days,
    nights: c.nights.evaluable ? c.nights.required.length + c.nights.transit.length : days - 1,
    km: { flight: route.km.flight, ground: route.km.transit + route.km.drive + route.km.ground },
    flights: segments.length,
    countries: [...countries].sort(),
    spent: convertTotals(spent, currency, rates),
    co2: estimateCo2(route, c.items, travelerCount(m.graph) ?? 1).perPerson,
  };
}

export function summarize(list: TripStats[], currency: string): Summary {
  const countries = new Set<string>();
  const out: Summary = {
    trips: list.length,
    days: 0,
    nights: 0,
    km: { flight: 0, ground: 0 },
    flights: 0,
    countries: [],
    spent: { minor: 0, currency, unconvertible: {} },
    co2: 0,
  };
  for (const s of list) {
    out.days += s.days;
    out.nights += s.nights;
    out.km.flight += s.km.flight;
    out.km.ground += s.km.ground;
    out.flights += s.flights;
    out.co2 += s.co2;
    out.spent.minor += s.spent.minor;
    for (const [cur, v] of Object.entries(s.spent.unconvertible))
      addTo(out.spent.unconvertible, { minor: v, currency: cur });
    for (const k of s.countries) countries.add(k);
  }
  out.countries = [...countries].sort();
  return out;
}

/** Per calendar year of the trip's start, newest first. */
export function byYear(
  list: TripStats[],
  currency: string,
): Array<{ year: number; summary: Summary; trips: TripStats[] }> {
  const years = [...new Set(list.map((s) => s.year))].sort((a, b) => b - a);
  return years.map((year) => {
    const trips = list.filter((s) => s.year === year).sort((a, b) => compareDate(a.start, b.start));
    return { year, summary: summarize(trips, currency), trips };
  });
}
