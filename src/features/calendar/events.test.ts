// Acceptance 7 and 10: the chosen itinerary is on the calendar, bookings are marked as booked,
// alternatives and scenario previews are told apart, and conflicts are flagged.

import { describe, expect, it } from "vitest";
import {
  addActivity,
  addBooking,
  addFlight,
  addSlot,
  addStay,
  graph,
  preferAll,
} from "@/domain/fixture.test-util";
import { defaultReminderSettings } from "@/domain/reminders";
import { Temporal } from "@/domain/time";
import type { TripGraph } from "@/domain/types";
import { buildModel } from "@/lib/model";
import { eventsOnDay, tripEvents, unscheduled } from "./events";

const model = (g: TripGraph) =>
  buildModel(
    g,
    [],
    { timeZone: "Europe/Berlin", reminders: defaultReminderSettings },
    Temporal.Instant.from("2027-05-01T10:00:00Z"),
  );
const day = (s: string) => Temporal.PlainDate.from(s);

function trip() {
  const g = graph();
  const flights = addSlot(g, "flight");
  const flight = addFlight(g, flights, 28_000, [
    ["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"],
    ["LIS", "FRA", "2027-06-14T18:00", "2027-06-14T22:00"],
  ]);
  const stays = addSlot(g, "accommodation");
  const stay = addStay(g, stays, 40_000, "2027-06-10", "2027-06-14");
  const tours = addSlot(g, "activity");
  const tour = addActivity(g, tours, 6_000, "2027-06-12", "10:00", "13:00");
  const other = addActivity(g, addSlot(g, "activity"), 3_000, "2027-06-12", "12:00", "14:00");
  preferAll(g);
  // A second, unchosen stay as an alternative.
  const alt = addStay(g, stays, 35_000, "2027-06-10", "2027-06-14", { title: "Alternative stay" });
  return { g, flight, stay, tour, other, alt };
}

describe("calendar", () => {
  it("shows the plan: flight segments on their days, stays across their nights", () => {
    const { g, flight, stay } = trip();
    const events = tripEvents(model(g));
    const segs = events.filter((e) => e.optionId === flight.id);
    expect(segs.map((e) => e.title)).toEqual(["FRA → LIS", "LIS → FRA"]);
    expect(segs[0]?.firstDay.toString()).toBe("2027-06-10");
    const s = events.find((e) => e.optionId === stay.id);
    expect(s?.allDay).toBe(true);
    expect(eventsOnDay(events, day("2027-06-12")).some((e) => e.optionId === stay.id)).toBe(true);
    expect(events.every((e) => !e.alternative && !e.preview)).toBe(true);
  });

  it("marks bookings as booked and keeps them when previewing another scenario", () => {
    const { g, flight, stay, alt } = trip();
    addBooking(g, flight, 28_000);
    const m = model(g);
    const events = tripEvents(m);
    expect(events.filter((e) => e.optionId === flight.id).every((e) => e.status === "booked")).toBe(true);
    expect(events.find((e) => e.optionId === stay.id)?.status).toBe("preferred");

    const preview = new Map(m.plan.selection);
    preview.set(alt.slot_id, alt.id);
    const previewed = tripEvents(m, { previewSelection: preview });
    expect(previewed.find((e) => e.optionId === alt.id)?.preview).toBe(true);
    expect(previewed.some((e) => e.optionId === flight.id)).toBe(true);
    expect(previewed.some((e) => e.optionId === stay.id)).toBe(false);
  });

  it("can show alternatives and flags conflicting activities", () => {
    const { g, alt, tour, other } = trip();
    const events = tripEvents(model(g), { includeAlternatives: true });
    expect(events.find((e) => e.optionId === alt.id)?.alternative).toBe(true);
    expect(events.find((e) => e.optionId === tour.id)?.attention).toBe(true);
    expect(events.find((e) => e.optionId === other.id)?.attention).toBe(true);
  });

  it("lists planned items without a date separately", () => {
    const g = graph();
    const idea = addActivity(g, addSlot(g, "activity"), null, null, null, null);
    preferAll(g);
    expect(unscheduled(model(g)).map((i) => i.option.id)).toEqual([idea.id]);
  });
});
