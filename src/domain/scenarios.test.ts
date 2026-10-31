import { describe, expect, it } from "vitest";
import { budget } from "./budget";
import {
  addActivity,
  addBooking,
  addCar,
  addFlight,
  addSlot,
  addStay,
  deepFreeze,
  graph,
} from "./fixture.test-util";
import { cheapest, currentPlan, evaluate, explore, planContext, type Selection } from "./scenarios";
import type { TripGraph } from "./types";

/** The example from the README: two flights, two stays, two cars. */
function readmeExample() {
  const g = graph();
  const flights = addSlot(g, "flight", { title: "Flights" });
  const stays = addSlot(g, "accommodation", { title: "Stay" });
  const cars = addSlot(g, "rental_car", { title: "Car" });
  const flightA = addFlight(g, flights, 28000, [
    ["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"],
    ["LIS", "FRA", "2027-06-17T18:00", "2027-06-17T22:00"],
  ]);
  const flightB = addFlight(g, flights, 34000, [
    ["FRA", "LIS", "2027-06-12T07:00", "2027-06-12T09:00"],
    ["LIS", "FRA", "2027-06-18T18:00", "2027-06-18T22:00"],
  ]);
  const stayA = addStay(g, stays, 62000, "2027-06-10", "2027-06-17");
  const stayB = addStay(g, stays, 49000, "2027-06-12", "2027-06-18");
  const carA = addCar(g, cars, 24000, "2027-06-10T10:30", "2027-06-17T15:00");
  const carB = addCar(g, cars, 19500, "2027-06-12T10:30", "2027-06-18T15:00");
  return { g, flights, stays, cars, flightA, flightB, stayA, stayB, carA, carB };
}

const ctxOf = (g: TripGraph) => planContext(g, [], "Europe/Berlin");

describe("scenario evaluation", () => {
  it("totals a compatible scenario and derives period and nights", () => {
    const x = readmeExample();
    const sel: Selection = new Map([
      [x.flights.id, x.flightA.id],
      [x.stays.id, x.stayA.id],
      [x.cars.id, x.carA.id],
    ]);
    const e = evaluate(ctxOf(x.g), sel);
    expect(e.total.totals).toEqual({ EUR: 28000 + 62000 + 24000 });
    expect(e.complete).toBe(true);
    expect(e.compatible).toBe(true);
    expect(e.period.start?.toString()).toBe("2027-06-10");
    expect(e.period.end?.toString()).toBe("2027-06-17");
    expect(e.travelDays).toBe(8);
    expect(e.nights.required).toHaveLength(7);
    expect(e.nights.gaps).toHaveLength(0);
    // 10:30 → 15:00 seven days later: the eighth 24-hour block has started.
    expect(e.rentalDays).toBe(8);
    expect(e.budgetDelta).toBe(250000 - 114000);
  });

  it("finds incompatible combinations and the cheapest valid one", () => {
    const x = readmeExample();
    const result = explore(ctxOf(x.g));
    expect(result.count).toBe(8);
    const valid = result.results.filter((r) => r.compatible);
    const best = cheapest(result.results);
    expect(best).not.toBeNull();
    expect(best?.selection.get(x.flights.id)).toBe(x.flightA.id);
    // Car B returns on the 18th, after flight A departs on the 17th: incompatible.
    const aWithCarB = result.results.find(
      (r) => r.selection.get(x.flights.id) === x.flightA.id && r.selection.get(x.cars.id) === x.carB.id,
    );
    expect(aWithCarB?.compatible).toBe(false);
    expect(aWithCarB?.warnings.some((w) => w.code === "return_after_departure")).toBe(true);
    // Flight B lands on the 12th; car A is picked up on the 10th: incompatible.
    const bWithCarA = result.results.find(
      (r) => r.selection.get(x.flights.id) === x.flightB.id && r.selection.get(x.cars.id) === x.carA.id,
    );
    expect(bWithCarA?.compatible).toBe(false);
    expect(valid.every((v) => v.warnings.every((w) => !w.blocking))).toBe(true);
  });

  it("marks a total with a missing price as incomplete instead of counting zero", () => {
    const x = readmeExample();
    x.stayA.price_minor = null;
    const e = evaluate(
      ctxOf(x.g),
      new Map([
        [x.flights.id, x.flightA.id],
        [x.stays.id, x.stayA.id],
        [x.cars.id, x.carA.id],
      ]),
    );
    expect(e.complete).toBe(false);
    expect(e.total.missing).toContain(x.stayA.id);
    expect(e.budgetDelta).toBeNull();
  });

  it("does not compare amounts in another currency without a rate", () => {
    const x = readmeExample();
    x.carA.currency = "USD";
    const sel: Selection = new Map([
      [x.flights.id, x.flightA.id],
      [x.stays.id, x.stayA.id],
      [x.cars.id, x.carA.id],
    ]);
    const e = evaluate(ctxOf(x.g), sel);
    expect(e.complete).toBe(false);
    expect(e.converted.unconvertible).toEqual({ USD: 24000 });
    const withRate = evaluate(
      planContext(
        x.g,
        [
          {
            id: "r",
            base: "EUR",
            quote: "USD",
            rate: "1.2",
            as_of: "2027-01-01",
            source: null,
            created_at: "x",
          },
        ],
        "UTC",
      ),
      sel,
    );
    expect(withRate.complete).toBe(true);
    expect(withRate.converted.minor).toBe(28000 + 62000 + 20000);
  });

  it("reports missing required slots and uncovered nights", () => {
    const x = readmeExample();
    const e = evaluate(
      ctxOf(x.g),
      new Map([
        [x.flights.id, x.flightA.id],
        [x.stays.id, x.stayB.id],
      ]),
    );
    expect(e.warnings.some((w) => w.code === "missing_required")).toBe(true);
    const gap = e.warnings.find((w) => w.code === "accommodation_gap");
    expect(gap?.params).toMatchObject({ from: "2027-06-10", to: "2027-06-11", nights: 2 });
    expect(e.complete).toBe(false);
  });

  it("respects nights marked as intentionally open and dismissed warnings", () => {
    const x = readmeExample();
    x.g.open_nights.push(
      { trip_id: "trip", night: "2027-06-10", note: null },
      { trip_id: "trip", night: "2027-06-11", note: null },
    );
    const sel: Selection = new Map([
      [x.flights.id, x.flightA.id],
      [x.stays.id, x.stayB.id],
      [x.cars.id, null],
    ]);
    x.cars.required = false;
    const e = evaluate(ctxOf(x.g), sel);
    expect(e.nights.gaps).toHaveLength(0);
    expect(e.nights.open).toHaveLength(2);
    const stayOutside = e.warnings.find((w) => w.code === "stay_outside_period");
    expect(stayOutside).toBeUndefined();
  });

  it("does not mutate the stored data", () => {
    const x = readmeExample();
    deepFreeze(x.g);
    expect(() => explore(ctxOf(x.g))).not.toThrow();
  });
});

describe("conflicts", () => {
  it("detects activities outside the period and overlapping activities", () => {
    const x = readmeExample();
    const acts = addSlot(x.g, "activity", { required: false });
    const hike = addActivity(x.g, acts, 4000, "2027-06-12", "09:00", "13:00");
    const acts2 = addSlot(x.g, "activity", { required: false });
    const boat = addActivity(x.g, acts2, 6000, "2027-06-12", "12:00", "15:00");
    const acts3 = addSlot(x.g, "activity", { required: false });
    const late = addActivity(x.g, acts3, 6000, "2027-06-20", "10:00", "12:00");
    const sel: Selection = new Map([
      [x.flights.id, x.flightA.id],
      [x.stays.id, x.stayA.id],
      [x.cars.id, x.carA.id],
      [acts.id, hike.id],
      [acts2.id, boat.id],
      [acts3.id, late.id],
    ]);
    const e = evaluate(ctxOf(x.g), sel);
    const overlap = e.warnings.find((w) => w.code === "activities_overlap");
    expect(overlap?.optionIds.sort()).toEqual([hike.id, boat.id].sort());
    expect(overlap?.params.minutes).toBe(60);
    const outside = e.warnings.find((w) => w.code === "activity_outside_period");
    expect(outside?.optionIds).toEqual([late.id]);
    expect(e.compatible).toBe(false);
  });

  it("warns about a pickup inside the arrival buffer", () => {
    const x = readmeExample();
    x.g.rental_car_details.forEach((r) => {
      if (r.option_id === x.carA.id) r.pickup_local = "2027-06-10T09:30";
    });
    const e = evaluate(
      ctxOf(x.g),
      new Map([
        [x.flights.id, x.flightA.id],
        [x.stays.id, x.stayA.id],
        [x.cars.id, x.carA.id],
      ]),
    );
    const tight = e.warnings.find((w) => w.code === "pickup_tight");
    expect(tight?.params).toMatchObject({ minutes: 30, buffer: 60 });
    expect(e.compatible).toBe(true);
  });

  it("excludes nights on an overnight internal flight from required nights", () => {
    const g = graph();
    const s = addSlot(g, "flight");
    addFlight(g, s, 1, [["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"]]);
    const s2 = addSlot(g, "flight");
    addFlight(g, s2, 1, [["LIS", "FRA", "2027-06-13T23:30", "2027-06-14T03:00"]]);
    const s3 = addSlot(g, "flight");
    addFlight(g, s3, 1, [["FRA", "LIS", "2027-06-16T07:00", "2027-06-16T09:00"]]);
    const s4 = addSlot(g, "flight");
    addFlight(g, s4, 1, [["LIS", "FRA", "2027-06-18T18:00", "2027-06-18T22:00"]]);
    const ctx = ctxOf(g);
    const sel: Selection = new Map(
      g.slots.map((sl) => [sl.id, g.options.find((o) => o.slot_id === sl.id)?.id ?? null]),
    );
    const e = evaluate(ctx, sel);
    expect(e.nights.transit.map(String)).toEqual(["2027-06-13"]);
    expect(e.nights.required.map(String)).not.toContain("2027-06-13");
    expect(e.nights.required).toHaveLength(7);
  });
});

describe("plan and budget", () => {
  it("uses booked prices for booked slots and never double counts", () => {
    const x = readmeExample();
    const b = addBooking(x.g, x.flightA, 29500);
    x.g.payments.push({
      id: "p1",
      booking_id: b.id,
      kind: "payment",
      amount_minor: 20000,
      currency: "EUR",
      paid_on: null,
      method: null,
      traveler_id: null,
      notes: null,
      created_at: "x",
    });
    x.g.scenarios.push({
      id: "sc",
      trip_id: "trip",
      name: "Preferred",
      preferred: true,
      notes: null,
      created_at: "x",
      updated_at: "x",
    });
    x.g.scenario_selections.push(
      { scenario_id: "sc", slot_id: x.flights.id, option_id: x.flightB.id },
      { scenario_id: "sc", slot_id: x.stays.id, option_id: x.stayA.id },
      { scenario_id: "sc", slot_id: x.cars.id, option_id: x.carA.id },
    );
    x.g.expenses.push({
      id: "e1",
      trip_id: "trip",
      booking_id: null,
      kind: "planned",
      category: "fuel",
      title: "Fuel",
      amount_minor: 8000,
      currency: "EUR",
      spent_on: null,
      paid_by: null,
      notes: null,
      created_at: "x",
    });
    const ctx = ctxOf(x.g);
    const plan = currentPlan(ctx);
    expect(plan.selection.get(x.flights.id)).toBe(x.flightA.id);
    const s = budget(ctx);
    expect(s.plan.total.totals).toEqual({ EUR: 29500 + 62000 + 24000 });
    expect(s.confirmed.totals).toEqual({ EUR: 29500 });
    expect(s.paid).toEqual({ EUR: 20000 });
    expect(s.outstanding).toEqual({ EUR: 9500 });
    expect(s.expected.totals).toEqual({ EUR: 29500 + 62000 + 24000 + 8000 });
    expect(s.plannedExpenses).toEqual({ EUR: 8000 });
  });

  it("separates refunds and cancellation costs", () => {
    const x = readmeExample();
    const b = addBooking(x.g, x.stayA, 62000, { status: "cancelled", payment_status: "partially_refunded" });
    x.g.payments.push(
      {
        id: "p1",
        booking_id: b.id,
        kind: "payment",
        amount_minor: 62000,
        currency: "EUR",
        paid_on: null,
        method: null,
        traveler_id: null,
        notes: null,
        created_at: "x",
      },
      {
        id: "p2",
        booking_id: b.id,
        kind: "refund",
        amount_minor: 50000,
        currency: "EUR",
        paid_on: null,
        method: null,
        traveler_id: null,
        notes: null,
        created_at: "x",
      },
    );
    const s = budget(ctxOf(x.g));
    expect(s.confirmed.totals).toEqual({});
    expect(s.refunds).toEqual({ EUR: 50000 });
    expect(s.paid).toEqual({ EUR: 12000 });
    expect(s.cancellationCosts).toEqual({ EUR: 12000 });
    expect(s.expected.totals).toEqual({ EUR: 12000 });
  });
});
