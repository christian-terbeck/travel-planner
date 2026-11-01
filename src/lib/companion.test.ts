import { describe, expect, it } from "vitest";
import {
  addActivity,
  addBooking,
  addFlight,
  addSlot,
  addStay,
  addTransport,
  graph,
  preferAll,
} from "@/domain/fixture.test-util";
import { defaultReminderSettings } from "@/domain/reminders";
import { Temporal } from "@/domain/time";
import i18n from "@/i18n";
import { companionHtml } from "./companion";
import { buildModel } from "./model";
import { makeFormat } from "./prefs";

function trip() {
  const g = graph();
  const flight = addFlight(g, addSlot(g, "flight"), 30_000, [
    ["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"],
    ["LIS", "FRA", "2027-06-14T18:00", "2027-06-14T22:00"],
  ]);
  addBooking(g, flight, 30_000, { reference: "ABC<123>" });
  for (const seg of g.flight_segments) seg.flight_number = "TP 571";
  g.travelers.push({
    id: "anna",
    trip_id: g.trip.id,
    name: "Anna",
    category: "adult",
    birth_date: null,
    notes: null,
    sort: 0,
  });
  g.loyalty_memberships.push({
    id: "l1",
    traveler_id: "anna",
    program: "TAP Miles&Go",
    provider: null,
    number: "TP 123 456",
    tier: null,
    notes: null,
  });
  const stay = addStay(g, addSlot(g, "accommodation"), 40_000, "2027-06-10", "2027-06-14");
  const a = g.accommodation_details.find((d) => d.option_id === stay.id);
  if (a) Object.assign(a, { address: "Rua & Co 1", lat: 38.71, lon: -9.13 });
  addTransport(g, addSlot(g, "transport"), 2_000, [
    ["Lisboa", "Sintra", "2027-06-12T09:10", "2027-06-12T09:50"],
  ]);
  addActivity(g, addSlot(g, "parking"), 80, "2027-06-09", "22:00", "23:30", "2027-06-14");
  preferAll(g);
  return g;
}

describe("travel companion", () => {
  const t = i18n.getFixedT("en");
  const html = () => {
    const g = trip();
    const m = buildModel(
      g,
      [],
      { timeZone: "Europe/Berlin", reminders: defaultReminderSettings },
      Temporal.Now.instant(),
    );
    return companionHtml(m, makeFormat("en-GB", []), t, Temporal.PlainDate.from("2027-06-12"));
  };

  it("lists every day with local times, escaped references and map links", () => {
    const out = html();
    expect(out).toContain("ABC&lt;123&gt;");
    expect(out).not.toContain("ABC<123>");
    expect(out).toContain("07:00 FRA → 09:00 LIS");
    expect(out).toContain("09:10 Lisboa → 09:50 Sintra");
    expect(out).toContain("Rua &amp; Co 1");
    expect(out).toContain("geo:38.71,-9.13");
    expect(out).toContain('id="d2027-06-12"');
    expect(out).toContain('class="day today"');
    expect(out).toContain('Anna · TAP Miles&amp;Go <span class="ref">TP 123 456</span>');
  });

  it("gives parking before the flight day its own day and needs nothing external", () => {
    const out = html();
    expect(out).toContain('id="d2027-06-09"');
    expect(out).not.toMatch(/<(script|link|img)\b/);
  });
});
