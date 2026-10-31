import { describe, expect, it } from "vitest";
import { addCar, addFlight, addOption, addSlot, addStay, graph } from "./fixture.test-util";
import { buildItems, rentalDays } from "./items";
import { minutesBetween } from "./time";
import type { RentalCarDetails } from "./types";

const ctx = { travelerCount: 2, fallbackTz: "Europe/Berlin" };

describe("flights", () => {
  it("computes durations across time zones and midnight", () => {
    const g = graph();
    const slot = addSlot(g, "flight");
    // Frankfurt 22:30 (UTC+2) → Lisbon 00:30 next day (UTC+1): 3 hours in the air.
    const o = addFlight(g, slot, 30000, [["FRA", "LIS", "2027-06-09T22:30", "2027-06-10T00:30"]]);
    const item = buildItems(g, ctx).get(o.id);
    expect(item?.start && item.end && minutesBetween(item.start, item.end)).toBe(180);
    expect(item?.startDate?.toString()).toBe("2027-06-09");
    expect(item?.endDate?.toString()).toBe("2027-06-10");
  });

  it("measures multi-leg itineraries from first departure to last arrival", () => {
    const g = graph();
    const slot = addSlot(g, "flight");
    const o = addFlight(g, slot, 50000, [
      ["FRA", "MAD", "2027-06-10T07:00", "2027-06-10T09:35", "Europe/Berlin", "Europe/Madrid"],
      ["MAD", "LIS", "2027-06-10T11:00", "2027-06-10T11:20", "Europe/Madrid", "Europe/Lisbon"],
    ]);
    const item = buildItems(g, ctx).get(o.id);
    expect(item?.start && item.end && minutesBetween(item.start, item.end)).toBe(5 * 60 + 20);
  });

  it("marks times without a zone as approximate", () => {
    const g = graph();
    const slot = addSlot(g, "flight");
    const o = addFlight(g, slot, 1, [["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00", "", ""]]);
    g.flight_segments.forEach((s) => {
      s.depart_tz = null;
      s.arrive_tz = null;
    });
    expect(buildItems(g, ctx).get(o.id)?.approximate).toBe(true);
  });
});

describe("rental days", () => {
  const car = (pickup: string, ret: string, over: Partial<RentalCarDetails> = {}) =>
    ({
      pickup_local: pickup,
      pickup_tz: "Europe/Lisbon",
      return_local: ret,
      return_tz: "Europe/Lisbon",
      day_rule: "24h",
      grace_minutes: 59,
      ...over,
    }) as RentalCarDetails;

  it("counts started 24-hour blocks after the grace period", () => {
    expect(rentalDays(car("2027-06-10T10:00", "2027-06-17T10:00"), "UTC")).toBe(7);
    expect(rentalDays(car("2027-06-10T10:00", "2027-06-17T10:45"), "UTC")).toBe(7);
    expect(rentalDays(car("2027-06-10T10:00", "2027-06-17T12:00"), "UTC")).toBe(8);
    expect(rentalDays(car("2027-06-10T10:00", "2027-06-10T15:00"), "UTC")).toBe(1);
  });

  it("differs from calendar days", () => {
    expect(rentalDays(car("2027-06-10T18:00", "2027-06-12T09:00", { day_rule: "calendar" }), "UTC")).toBe(3);
    expect(rentalDays(car("2027-06-10T18:00", "2027-06-12T09:00"), "UTC")).toBe(2);
  });

  it("refuses returns before the pickup", () => {
    expect(rentalDays(car("2027-06-12T10:00", "2027-06-10T10:00"), "UTC")).toBeNull();
  });
});

describe("estimates", () => {
  it("multiplies per-night and per-person prices, keeps missing prices missing", () => {
    const g = graph();
    const stay = addSlot(g, "accommodation");
    const perNight = addStay(g, stay, 9000, "2027-06-10", "2027-06-17", { price_basis: "per_night" });
    const unknown = addStay(g, stay, null, "2027-06-10", "2027-06-17");
    const act = addSlot(g, "activity");
    const perPerson = addOption(g, act, 4500, { price_basis: "per_person" });
    const items = buildItems(g, ctx);
    expect(items.get(perNight.id)?.nights).toBe(7);
    expect(items.get(perNight.id)?.estimate.totals).toEqual({ EUR: 63000 });
    expect(items.get(unknown.id)?.estimate).toEqual({ totals: {}, missing: [unknown.id] });
    expect(items.get(perPerson.id)?.estimate.totals).toEqual({ EUR: 9000 });
  });

  it("adds fees that are not part of the price", () => {
    const g = graph();
    const slot = addSlot(g, "rental_car");
    const o = addCar(g, slot, 24000, "2027-06-10T12:00", "2027-06-17T12:00");
    g.option_fees.push(
      {
        id: "f1",
        option_id: o.id,
        label: "Young driver",
        amount_minor: 3000,
        currency: "EUR",
        included: false,
        sort: 0,
      },
      {
        id: "f2",
        option_id: o.id,
        label: "Airport fee",
        amount_minor: 2000,
        currency: "EUR",
        included: true,
        sort: 1,
      },
      {
        id: "f3",
        option_id: o.id,
        label: "Tolls",
        amount_minor: null,
        currency: "EUR",
        included: false,
        sort: 2,
      },
    );
    const item = buildItems(g, ctx).get(o.id);
    expect(item?.estimate.totals).toEqual({ EUR: 27000 });
    expect(item?.estimate.missing).toEqual([`${o.id}:fee:f3`]);
  });
});
