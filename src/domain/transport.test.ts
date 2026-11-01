import { describe, expect, it } from "vitest";
import { addActivity, addFlight, addSlot, addStay, addTransport, graph } from "./fixture.test-util";
import { buildRoute, ROAD_FACTOR } from "./geo";
import { buildItems } from "./items";
import { evaluate, planContext, type Selection } from "./scenarios";
import type { TripGraph } from "./types";

const ctxOf = (g: TripGraph) => planContext(g, [], "Europe/Lisbon");
const selectAll = (g: TripGraph): Selection => new Map(g.options.map((o) => [o.slot_id, o.id]));
const codes = (g: TripGraph) => evaluate(ctxOf(g), selectAll(g)).warnings.map((w) => w.code);

describe("train, bus and ferry", () => {
  it("joins transport and flights into journeys and checks the connection", () => {
    const g = graph();
    addTransport(g, addSlot(g, "transport"), 1, [
      ["Porto Campanhã", "Lisboa Oriente", "2027-06-10T06:00", "2027-06-10T09:00"],
    ]);
    addFlight(g, addSlot(g, "flight"), 1, [["LIS", "FRA", "2027-06-10T09:30", "2027-06-10T13:30"]]);
    const e = evaluate(ctxOf(g), selectAll(g));
    expect(e.period.journeys).toHaveLength(1);
    expect(e.period.start?.toString()).toBe("2027-06-10");
    const short = e.warnings.find((w) => w.code === "short_connection");
    expect(short?.params.at).toBe("Lisboa Oriente");
    expect(e.warnings.some((w) => w.code === "airport_change")).toBe(false);
  });

  it("counts a night train inside the trip as a night in transit", () => {
    const g = graph();
    const fs = addSlot(g, "flight");
    addFlight(g, fs, 1, [
      ["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"],
      ["LIS", "FRA", "2027-06-16T18:00", "2027-06-16T22:00"],
    ]);
    addTransport(g, addSlot(g, "transport"), 1, [
      ["Lisboa", "Madrid", "2027-06-12T21:00", "2027-06-13T08:00"],
    ]);
    const st = addSlot(g, "accommodation");
    addStay(g, st, 1, "2027-06-10", "2027-06-12");
    const st2 = addSlot(g, "accommodation");
    addStay(g, st2, 1, "2027-06-13", "2027-06-16");
    const e = evaluate(ctxOf(g), selectAll(g));
    expect(e.nights.transit.map(String)).toEqual(["2027-06-12"]);
    expect(e.nights.gaps).toEqual([]);
  });

  it("does not treat parking as an activity", () => {
    const g = graph();
    addFlight(g, addSlot(g, "flight"), 1, [
      ["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"],
      ["LIS", "FRA", "2027-06-17T18:00", "2027-06-17T22:00"],
    ]);
    addActivity(g, addSlot(g, "parking"), 80, "2027-06-10", "05:00", "23:30", "2027-06-17");
    expect(codes(g)).not.toContain("activity_outside_period");
  });

  it("warns when the insurance does not cover the whole trip", () => {
    const g = graph();
    addFlight(g, addSlot(g, "flight"), 1, [
      ["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"],
      ["LIS", "FRA", "2027-06-17T18:00", "2027-06-17T22:00"],
    ]);
    const ins = addSlot(g, "insurance");
    const o = addActivity(g, ins, 30, "2027-06-10", null, null, "2027-06-15");
    expect(codes(g)).toContain("insurance_not_covering");
    const a = g.activity_details.find((d) => d.option_id === o.id);
    if (a) a.end_date = "2027-06-17";
    expect(codes(g)).not.toContain("insurance_not_covering");
  });

  it("draws transport with coordinates as estimated transit legs", () => {
    const g = graph();
    addTransport(g, addSlot(g, "transport"), 1, [
      ["Lisboa", "Porto", "2027-06-12T09:00", "2027-06-12T12:00", [38.7139, -9.1223, 41.1496, -8.5855]],
      ["Porto", "Braga", "2027-06-12T13:00", "2027-06-12T14:00"],
    ]);
    const items = [...buildItems(g, { travelerCount: null, fallbackTz: "Europe/Lisbon" }).values()];
    const r = buildRoute(items, () => null, "Europe/Lisbon");
    expect(r.legs).toHaveLength(1);
    expect(r.legs[0]?.mode).toBe("transit");
    expect(r.legs[0]?.estimated).toBe(true);
    expect(r.km.transit).toBeGreaterThan(270 * ROAD_FACTOR);
    expect(r.missingPlaces).toBe(1);
  });
});
