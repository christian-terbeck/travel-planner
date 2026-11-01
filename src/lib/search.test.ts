import { describe, expect, it } from "vitest";
import { addBooking, addFlight, addSlot, addStay, graph, trip } from "@/domain/fixture.test-util";
import { buildIndex, search } from "./search";

function trips() {
  const g = graph();
  const flights = addSlot(g, "flight", { title: "Flights" });
  const tap = addFlight(g, flights, 28_000, [["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"]], {
    title: "TAP direct",
  });
  addBooking(g, tap, 28_000, { reference: "XK7Q2L" });
  const stays = addSlot(g, "accommodation", { title: "Stay Porto" });
  const stay = addStay(g, stays, 50_000, "2027-06-10", "2027-06-14", { title: "Casa São Bento" });
  g.notes.push({
    id: "n1",
    trip_id: g.trip.id,
    option_id: null,
    title: "Restaurants",
    body: "Try the pastéis de nata at Manteigaria",
    created_at: "x",
    updated_at: "x",
  });
  const other = graph(trip({ id: "trip-2", title: "Iceland" }));
  return { index: buildIndex([g, other]), stay };
}

describe("search", () => {
  it("finds a booking by its reference, case-insensitive", () => {
    const [hit] = search(trips().index, "xk7q");
    expect(hit).toMatchObject({ kind: "booking", title: "TAP direct", detail: "XK7Q2L", view: "bookings" });
  });

  it("ignores accents and needs every word", () => {
    const { index, stay } = trips();
    expect(search(index, "sao bento")[0]).toMatchObject({ kind: "option", optionId: stay.id, view: "planning" });
    expect(search(index, "sao iceland")).toEqual([]);
    expect(search(index, "pasteis")[0]).toMatchObject({ kind: "note", view: "documents" });
  });

  it("finds flights by airport and ranks title matches first", () => {
    const { index } = trips();
    expect(search(index, "LIS").some((e) => e.title === "TAP direct")).toBe(true);
    const ice = search(index, "ice");
    expect(ice[0]).toMatchObject({ kind: "trip", tripId: "trip-2" });
  });

  it("returns nothing for an empty query", () => {
    expect(search(trips().index, "  ")).toEqual([]);
  });
});
