import { describe, expect, it } from "vitest";
import { CO2_FACTORS, estimateCo2, flightFactor } from "./co2";
import { addCar, addFlight, addSlot, addStay, addTransport, graph } from "./fixture.test-util";
import { buildRoute } from "./geo";
import { evaluate, planContext, type Selection } from "./scenarios";
import type { TripGraph } from "./types";

const AIRPORTS: Record<string, { lat: number; lon: number }> = {
  FRA: { lat: 50.0333, lon: 8.5706 },
  LIS: { lat: 38.7813, lon: -9.1359 },
  JFK: { lat: 40.6398, lon: -73.7789 },
};
const TZ = "Europe/Lisbon";

function estimate(g: TripGraph, travelers = 1) {
  const e = evaluate(planContext(g, [], TZ), new Map(g.options.map((o) => [o.slot_id, o.id])) as Selection);
  return estimateCo2(
    buildRoute(e.items, (c) => AIRPORTS[c] ?? null, TZ),
    e.items,
    travelers,
  );
}

describe("CO2 estimate", () => {
  it("uses the factor of the distance band and cabin", () => {
    expect(flightFactor(300, null)).toBe(CO2_FACTORS.flightDomestic);
    expect(flightFactor(1900, "Economy")).toBe(CO2_FACTORS.flightShortEconomy);
    expect(flightFactor(6200, "Business")).toBe(CO2_FACTORS.flightLongBusiness);
    expect(flightFactor(6200, null)).toBe(CO2_FACTORS.flightLongEconomy);
  });

  it("estimates a return flight per traveler and for everyone", () => {
    const g = graph();
    addFlight(g, addSlot(g, "flight"), 1, [
      ["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"],
      ["LIS", "FRA", "2027-06-17T18:00", "2027-06-17T22:00"],
    ]);
    const c = estimate(g, 2);
    // About 2 × 1,876 km × 0.148 kg.
    expect(Math.round(c.perPerson)).toBeGreaterThan(540);
    expect(Math.round(c.perPerson)).toBeLessThan(570);
    expect(c.total).toBeCloseTo(c.perPerson * 2);
  });

  it("counts trains by their means and shares a rental car between the travelers", () => {
    const g = graph();
    const t = addTransport(g, addSlot(g, "transport"), 1, [
      ["Lisboa", "Porto", "2027-06-10T09:00", "2027-06-10T12:00"],
    ]);
    const seg = g.flight_segments.find((s) => s.option_id === t.id);
    if (seg) Object.assign(seg, { from_lat: 38.71, from_lon: -9.14, to_lat: 41.15, to_lon: -8.61 });
    const train = estimate(g);
    expect(Object.keys(train.byMode)).toEqual(["train"]);
    expect(train.byMode.train).toBeGreaterThan(8);
    expect(train.byMode.train).toBeLessThan(15);
    expect(train.uncountedKm).toBe(0);

    // Two stays with a car in between: the drive is shared by four.
    const d = graph();
    const s1 = addStay(d, addSlot(d, "accommodation"), 1, "2027-06-10", "2027-06-12");
    const s2 = addStay(d, addSlot(d, "accommodation"), 1, "2027-06-12", "2027-06-14");
    for (const [o, lat, lon] of [
      [s1, 38.71, -9.14],
      [s2, 41.15, -8.61],
    ] as const) {
      const a = d.accommodation_details.find((x) => x.option_id === o.id);
      if (a) Object.assign(a, { lat, lon });
    }
    addCar(d, addSlot(d, "rental_car"), 1, "2027-06-10T10:00", "2027-06-14T10:00");
    const car4 = estimate(d, 4);
    const car1 = estimate(d, 1);
    expect(car4.byMode.car).toBeCloseTo((car1.byMode.car ?? 0) / 4);
    expect(car4.total).toBeCloseTo(car1.total);
  });
});
