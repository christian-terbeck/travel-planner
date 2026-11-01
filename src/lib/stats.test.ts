import { describe, expect, it } from "vitest";
import { addBooking, addFlight, addSlot, addStay, graph, trip } from "@/domain/fixture.test-util";
import { defaultReminderSettings } from "@/domain/reminders";
import { Temporal } from "@/domain/time";
import type { TripGraph } from "@/domain/types";
import type { Airport } from "./airports";
import { buildModel } from "./model";
import { byYear, summarize, tripStats } from "./stats";

const airports = new Map<string, Airport>([
  [
    "FRA",
    {
      iata: "FRA",
      name: "Frankfurt",
      city: "Frankfurt",
      country: "DE",
      tz: "Europe/Berlin",
      lat: 50.0333,
      lon: 8.5706,
    },
  ],
  [
    "LIS",
    {
      iata: "LIS",
      name: "Lisbon",
      city: "Lisbon",
      country: "PT",
      tz: "Europe/Lisbon",
      lat: 38.7813,
      lon: -9.1359,
    },
  ],
  [
    "MAD",
    {
      iata: "MAD",
      name: "Madrid",
      city: "Madrid",
      country: "ES",
      tz: "Europe/Madrid",
      lat: 40.4719,
      lon: -3.5626,
    },
  ],
]);
const TODAY = Temporal.PlainDate.from("2027-08-01");
const model = (g: TripGraph) =>
  buildModel(
    g,
    [],
    { timeZone: "Europe/Berlin", reminders: defaultReminderSettings },
    Temporal.Instant.from("2027-08-01T10:00:00Z"),
  );

function lisbon(id: string, title: string, start = "2027-06-10", end = "2027-06-17"): TripGraph {
  const g = graph(trip({ id, title }));
  const f = addFlight(g, addSlot(g, "flight"), 28_000, [
    ["FRA", "LIS", `${start}T07:00`, `${start}T09:00`],
    ["LIS", "FRA", `${end}T18:00`, `${end}T22:00`],
  ]);
  addBooking(g, f, 28_000);
  addBooking(g, addStay(g, addSlot(g, "accommodation"), 62_000, start, end), 62_000);
  g.expenses.push({
    id: `${id}-e`,
    trip_id: id,
    booking_id: null,
    kind: "actual",
    category: "food",
    title: "Dinner",
    amount_minor: 10_000,
    currency: "EUR",
    spent_on: start,
    paid_by: null,
    notes: null,
    created_at: "x",
  });
  return g;
}

describe("travel statistics", () => {
  it("counts a taken trip from its bookings: days, nights, distance, countries and money", () => {
    const s = tripStats(model(lisbon("a", "Lisbon")), airports, "EUR", [], TODAY);
    expect(s).toMatchObject({ year: 2027, days: 8, nights: 7, flights: 2, countries: ["PT"] });
    expect(s?.spent.minor).toBe(100_000);
    // About 1,876 km each way.
    expect(s?.km.flight).toBeGreaterThan(3700);
    expect(s?.km.flight).toBeLessThan(3800);
  });

  it("leaves out planned-only, future and cancelled trips", () => {
    const planned = graph(trip({ id: "p" }));
    addFlight(planned, addSlot(planned, "flight"), 1, [
      ["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"],
    ]);
    expect(tripStats(model(planned), airports, "EUR", [], TODAY)).toBeNull();
    const future = lisbon("f", "Later", "2027-09-10", "2027-09-17");
    expect(tripStats(model(future), airports, "EUR", [], TODAY)).toBeNull();
    const cancelled = lisbon("c", "Off");
    cancelled.trip.status_override = "cancelled";
    expect(tripStats(model(cancelled), airports, "EUR", [], TODAY)).toBeNull();
  });

  it("sums per year and overall without counting a country twice", () => {
    const a = tripStats(model(lisbon("a", "Lisbon")), airports, "EUR", [], TODAY);
    const b = tripStats(
      model(lisbon("b", "Lisbon again", "2026-05-01", "2026-05-05")),
      airports,
      "EUR",
      [],
      TODAY,
    );
    const list = [a, b].filter((x) => x !== null);
    const total = summarize(list, "EUR");
    expect(total).toMatchObject({ trips: 2, days: 13, countries: ["PT"] });
    expect(byYear(list, "EUR").map((y) => [y.year, y.summary.trips])).toEqual([
      [2027, 1],
      [2026, 1],
    ]);
  });
});
