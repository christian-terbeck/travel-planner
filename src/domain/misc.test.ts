import { describe, expect, it } from "vitest";
import { cancellationStatus, isApproaching } from "./cancellation";
import { addBooking, addFlight, addPayment, addSlot, addStay, graph, policy } from "./fixture.test-util";
import { buildIcs, fold } from "./ics";
import { buildItems } from "./items";
import { reminders, tripStatus } from "./reminders";
import { planContext } from "./scenarios";
import { settle, splitByWeights } from "./splits";
import { Temporal } from "./time";

const at = (iso: string) => Temporal.Instant.from(iso);

describe("cancellation", () => {
  const g = graph();
  const slot = addSlot(g, "accommodation");
  const o = addStay(g, slot, 62000, "2027-06-10", "2027-06-17");
  const b = addBooking(g, o, 62000);

  it("treats missing terms as unknown, never as free", () => {
    expect(cancellationStatus(b, null, at("2027-05-01T00:00:00Z"), "UTC").state).toBe("unknown");
    expect(
      cancellationStatus(b, policy({ policy_type: "unknown" }), at("2027-05-01T00:00:00Z"), "UTC").state,
    ).toBe("unknown");
  });

  it("is free until the deadline in the deadline's zone, then passes", () => {
    const p = policy({
      policy_type: "free_until",
      deadline_local: "2027-06-08T18:00",
      deadline_tz: "Europe/Lisbon",
    });
    const before = cancellationStatus(b, p, at("2027-06-08T16:59:00Z"), "UTC");
    expect(before.state).toBe("free");
    expect(before.minutesLeft).toBe(1);
    expect(before.refundable).toEqual({ minor: 62000, currency: "EUR" });
    expect(isApproaching(before)).toBe(true);
    const after = cancellationStatus(b, p, at("2027-06-08T17:01:00Z"), "UTC");
    expect(after.state).toBe("deadline_passed");
    expect(after.refundable).toBeNull();
  });

  it("computes refundable amounts for fees and partial refunds", () => {
    const now = at("2027-05-01T00:00:00Z");
    expect(
      cancellationStatus(b, policy({ policy_type: "with_fee", fee_minor: 5000 }), now, "UTC").refundable,
    ).toEqual({ minor: 57000, currency: "EUR" });
    expect(
      cancellationStatus(
        b,
        policy({ policy_type: "partially_refundable", refundable_percent: 50 }),
        now,
        "UTC",
      ).refundable,
    ).toEqual({ minor: 31000, currency: "EUR" });
    expect(cancellationStatus(b, policy({ policy_type: "non_refundable" }), now, "UTC").refundable).toEqual({
      minor: 0,
      currency: "EUR",
    });
    expect(cancellationStatus(b, policy({ policy_type: "with_fee" }), now, "UTC").refundable).toBeNull();
  });
});

describe("cost splitting", () => {
  it("splits exactly, rounding remainders", () => {
    const parts = splitByWeights(1000, [
      ["a", 1],
      ["b", 1],
      ["c", 1],
    ]);
    expect([...parts.values()].reduce((s, v) => s + v, 0)).toBe(1000);
    expect([...parts.values()].sort()).toEqual([333, 333, 334]);
    expect([
      ...splitByWeights(-100, [
        ["a", 1],
        ["b", 1],
      ]).values(),
    ]).toEqual([-50, -50]);
  });

  it("settles who owes whom", () => {
    const g = graph();
    g.travelers.push(
      {
        id: "anna",
        trip_id: "trip",
        name: "Anna",
        category: "adult",
        birth_date: null,
        notes: null,
        sort: 0,
      },
      { id: "ben", trip_id: "trip", name: "Ben", category: "adult", birth_date: null, notes: null, sort: 1 },
    );
    const slot = addSlot(g, "accommodation");
    const b = addBooking(g, addStay(g, slot, 60000, "2027-06-10", "2027-06-17"), 60000);
    addPayment(g, b, 60000, { traveler_id: "anna" });
    g.expenses.push({
      id: "e",
      trip_id: "trip",
      booking_id: null,
      kind: "actual",
      category: "food",
      title: "Dinner",
      amount_minor: 10000,
      currency: "EUR",
      spent_on: null,
      paid_by: "ben",
      notes: null,
      created_at: "x",
    });
    const s = settle(g, "EUR", []);
    expect(s.balances.find((x) => x.travelerId === "anna")).toMatchObject({
      share: 35000,
      paid: 60000,
      balance: 25000,
    });
    expect(s.transfers).toEqual([{ from: "ben", to: "anna", minor: 25000 }]);
  });
});

describe("reminders and status", () => {
  it("reminds about deadlines within the lead time only", () => {
    const g = graph();
    const slot = addSlot(g, "accommodation");
    const o = addStay(g, slot, 62000, "2027-06-10", "2027-06-17");
    const b = addBooking(g, o, 62000, { payment_status: "paid" });
    g.cancellation_policies.push(
      policy({ booking_id: b.id, policy_type: "free_until", deadline_local: "2027-06-01T23:59" }),
    );
    const ctx = planContext(g, [], "UTC");
    expect(
      reminders(ctx, at("2027-05-20T00:00:00Z"), "UTC").filter((r) => r.kind === "cancellation_deadline"),
    ).toHaveLength(0);
    const soon = reminders(ctx, at("2027-05-30T12:00:00Z"), "UTC").filter(
      (r) => r.kind === "cancellation_deadline",
    );
    expect(soon).toHaveLength(1);
    expect(soon[0]?.severity).toBe("warning");
    expect(
      reminders(ctx, at("2027-06-02T12:00:00Z"), "UTC").filter((r) => r.kind === "cancellation_deadline"),
    ).toHaveLength(0);
  });

  it("derives the trip status from bookings and dates", () => {
    const g = graph();
    expect(tripStatus(planContext(g, [], "UTC"), at("2027-05-01T00:00:00Z"), "UTC")).toBe("idea");
    const slot = addSlot(g, "flight");
    const f = addFlight(g, slot, 1, [
      ["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"],
      ["LIS", "FRA", "2027-06-17T18:00", "2027-06-17T22:00"],
    ]);
    expect(tripStatus(planContext(g, [], "UTC"), at("2027-05-01T00:00:00Z"), "UTC")).toBe("planning");
    addBooking(g, f, 1);
    const ctx = planContext(g, [], "UTC");
    expect(tripStatus(ctx, at("2027-05-01T00:00:00Z"), "UTC")).toBe("booked");
    expect(tripStatus(ctx, at("2027-06-12T00:00:00Z"), "UTC")).toBe("ongoing");
    expect(tripStatus(ctx, at("2027-06-20T00:00:00Z"), "UTC")).toBe("completed");
  });
});

describe("ics", () => {
  it("writes timed flights, all-day stays and folds long lines", () => {
    const g = graph();
    const fs = addSlot(g, "flight");
    addFlight(g, fs, 1, [["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"]]);
    const ss = addSlot(g, "accommodation");
    addStay(g, ss, 1, "2027-06-10", "2027-06-17", { title: "Casa; with, special chars" });
    const items = [...buildItems(g, { travelerCount: null, fallbackTz: "UTC" }).values()];
    const ics = buildIcs(g.trip, items, at("2027-05-01T00:00:00Z"));
    expect(ics).toContain("DTSTART:20270610T050000Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20270610");
    expect(ics).toContain("DTEND;VALUE=DATE:20270617");
    expect(ics).toContain("Casa\\; with\\, special chars");
    expect(ics).toContain("STATUS:TENTATIVE");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    const long = fold(`DESCRIPTION:${"x".repeat(200)}`);
    expect(long.split("\r\n ").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});
