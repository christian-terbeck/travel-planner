import { describe, expect, it } from "vitest";
import { addFlight, addSlot, graph, preferAll } from "./fixture.test-util";
import { reminders } from "./reminders";
import { evaluate, planContext, type Selection } from "./scenarios";
import { Temporal } from "./time";
import type { TravelDocumentKind, TripGraph } from "./types";

function trip(docs: Array<[TravelDocumentKind, string | null]>) {
  const g = graph();
  addFlight(g, addSlot(g, "flight"), 1, [
    ["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"],
    ["LIS", "FRA", "2027-06-17T18:00", "2027-06-17T22:00"],
  ]);
  g.travelers.push({
    id: "anna",
    trip_id: g.trip.id,
    name: "Anna",
    category: "adult",
    birth_date: null,
    notes: null,
    sort: 0,
  });
  g.traveler_documents.push(
    ...docs.map(([kind, expires], i) => ({
      id: `d${i}`,
      traveler_id: "anna",
      kind,
      label: null,
      expires_on: expires,
      notes: null,
    })),
  );
  return g;
}

const warnings = (g: TripGraph) => {
  const selection: Selection = new Map(g.options.map((o) => [o.slot_id, o.id]));
  return evaluate(planContext(g, [], "Europe/Berlin"), selection).warnings.filter(
    (w) => w.code === "document_expires" || w.code === "passport_validity",
  );
};

describe("travel documents", () => {
  it("warns about a document that expires before the trip ends", () => {
    const [w] = warnings(trip([["id_card", "2027-06-15"]]));
    expect(w).toMatchObject({ code: "document_expires", severity: "critical", blocking: false });
    expect(w?.params).toMatchObject({ name: "Anna", kind: "id_card", date: "2027-06-15" });
  });

  it("points out passports valid for less than six months after the trip, but not other documents", () => {
    const list = warnings(
      trip([
        ["passport", "2027-12-01"],
        ["id_card", "2027-12-01"],
        ["visa", null],
      ]),
    );
    expect(list.map((w) => w.code)).toEqual(["passport_validity"]);
    expect(warnings(trip([["passport", "2027-12-17"]]))).toEqual([]);
  });

  it("keeps warnings about two documents with the same date apart", () => {
    const list = warnings(
      trip([
        ["passport", "2027-06-12"],
        ["visa", "2027-06-12"],
      ]),
    );
    expect(new Set(list.map((w) => w.key)).size).toBe(2);
  });

  it("reminds before an upcoming trip, not after it", () => {
    const g = trip([["passport", "2027-06-12"]]);
    preferAll(g);
    const ctx = planContext(g, [], "UTC");
    const kinds = (iso: string) =>
      reminders(ctx, Temporal.Instant.from(iso), "UTC")
        .filter((r) => r.kind === "document_expiry")
        .map((r) => r.params.name);
    expect(kinds("2027-01-01T00:00:00Z")).toEqual(["Anna"]);
    expect(kinds("2027-07-01T00:00:00Z")).toEqual([]);
  });
});
