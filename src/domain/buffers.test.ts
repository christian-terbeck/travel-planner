import { describe, expect, it } from "vitest";
import { addActivity, addFlight, addSlot, addStay, addTransport, graph, trip } from "./fixture.test-util";
import { evaluate, planContext, type Selection } from "./scenarios";
import type { TripGraph } from "./types";

const selectAll = (g: TripGraph): Selection => new Map(g.options.map((o) => [o.slot_id, o.id]));
const warnings = (g: TripGraph) => evaluate(planContext(g, [], "Europe/Lisbon"), selectAll(g)).warnings;

/** Outbound FRA → LIS landing 09:00 Lisbon time, return LIS → FRA at 18:00 a week later. */
function lisbon(over: Parameters<typeof trip>[0] = {}) {
  const g = graph(trip(over));
  addFlight(g, addSlot(g, "flight"), 1, [
    ["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"],
    ["LIS", "FRA", "2027-06-17T18:00", "2027-06-17T22:00"],
  ]);
  return g;
}

describe("buffers", () => {
  it("asks for more time when changing from a plane to a train than between two trains", () => {
    const g = graph();
    addFlight(g, addSlot(g, "flight"), 1, [["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"]]);
    addTransport(g, addSlot(g, "transport"), 1, [
      ["Lisboa Oriente", "Porto", "2027-06-10T10:00", "2027-06-10T13:00"],
    ]);
    const short = warnings(g).find((w) => w.code === "short_connection");
    expect(short?.params).toMatchObject({ minutes: 60, buffer: 90 });

    const trains = graph();
    addTransport(trains, addSlot(trains, "transport"), 1, [
      ["Porto", "Lisboa Oriente", "2027-06-10T06:00", "2027-06-10T09:00"],
      ["Lisboa Oriente", "Faro", "2027-06-10T10:00", "2027-06-10T13:00"],
    ]);
    expect(warnings(trains).some((w) => w.code === "short_connection")).toBe(false);
  });

  it("uses the trip's own connection times", () => {
    const g = graph(trip({ connection_buffer_min: 75 }));
    addTransport(g, addSlot(g, "transport"), 1, [
      ["Porto", "Lisboa Oriente", "2027-06-10T06:00", "2027-06-10T09:00"],
      ["Lisboa Oriente", "Faro", "2027-06-10T10:00", "2027-06-10T13:00"],
    ]);
    expect(warnings(g).find((w) => w.code === "short_connection")?.params).toMatchObject({ buffer: 75 });
  });

  it("flags activities squeezed against landing and take-off", () => {
    const g = lisbon();
    addActivity(g, addSlot(g, "activity"), 30, "2027-06-10", "09:30", "11:00");
    addActivity(g, addSlot(g, "activity"), 30, "2027-06-17", "14:00", "17:00");
    addActivity(g, addSlot(g, "activity"), 30, "2027-06-12", "10:00", "12:00");
    const codes = warnings(g).map((w) => w.code);
    expect(codes.filter((c) => c === "activity_after_arrival")).toHaveLength(1);
    expect(codes.filter((c) => c === "activity_before_departure")).toHaveLength(1);
  });

  it("notes a long wait for the room or with luggage, only when the stay states its times", () => {
    const g = lisbon();
    const o = addStay(g, addSlot(g, "accommodation"), 1, "2027-06-10", "2027-06-17");
    const acc = g.accommodation_details.find((a) => a.option_id === o.id);
    expect(
      warnings(g).some((w) => w.code === "check_in_wait"),
      "no stated times, no note",
    ).toBe(false);
    Object.assign(acc ?? {}, { check_in_time: "15:00", check_out_time: "10:00" });
    const found = warnings(g);
    // Landing 09:00 + 60 min buffer, room at 15:00: 5 hours. Check-out 10:00, leave 16:00 for the 18:00 flight: 6 hours.
    expect(found.find((w) => w.code === "check_in_wait")?.params).toMatchObject({
      minutes: 300,
      time: "15:00",
    });
    expect(found.find((w) => w.code === "check_out_wait")?.params).toMatchObject({
      minutes: 360,
      time: "10:00",
    });
  });
});
