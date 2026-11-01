import { describe, expect, it } from "vitest";
import { addBooking, addFlight, addSlot, graph, preferAll } from "@/domain/fixture.test-util";
import { defaultReminderSettings } from "@/domain/reminders";
import { Temporal } from "@/domain/time";
import { buildModel } from "./model";
import { reviewInput } from "./tripReview";

describe("trip review input", () => {
  it("describes the plan without names, references, notes or contacts", () => {
    const g = graph();
    const slot = addSlot(g, "flight", { title: "Flights" });
    const o = addFlight(g, slot, 28_000, [["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"]], {
      title: "TAP direct",
      notes: "secret-note",
      contact: "secret-contact",
    });
    addBooking(g, o, 28_000, { reference: "SECRETREF", notes: "secret-booking-note" });
    g.travelers.push({
      id: "p",
      trip_id: g.trip.id,
      name: "Anna Secret",
      category: "adult",
      birth_date: "1990-01-01",
      notes: null,
      sort: 0,
    });
    g.notes.push({
      id: "n",
      trip_id: g.trip.id,
      option_id: null,
      title: "secret-title",
      body: "secret-body",
      created_at: "x",
      updated_at: "x",
    });
    preferAll(g);
    const m = buildModel(
      g,
      [],
      { timeZone: "UTC", reminders: defaultReminderSettings },
      Temporal.Instant.from("2027-05-01T00:00:00Z"),
    );

    const input = reviewInput(m, "2027-05-01");
    const text = JSON.stringify(input);
    for (const secret of ["SECRET", "secret", "Anna", "1990"]) expect(text).not.toContain(secret);
    expect(input.travelers).toEqual([{ person: "Person 1", category: "adult" }]);
    const alt = input.needs[0]?.alternatives[0];
    expect(alt).toMatchObject({ title: "TAP direct", in_plan: true, booked: true, estimate: ["280 EUR"] });
    expect(alt?.segments[0]).toMatchObject({ from: "FRA", to: "LIS", depart: "2027-06-10T07:00" });
  });
});
