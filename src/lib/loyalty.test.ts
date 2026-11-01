import { describe, expect, it } from "vitest";
import { addFlight, addSlot, addStay, graph } from "@/domain/fixture.test-util";
import { planContext } from "@/domain/scenarios";
import type { LoyaltyMembership, TripGraph } from "@/domain/types";
import { brandSource, membershipsFor, programProviders } from "./loyalty";

const member = (program: string, provider: string | null = null, traveler = "anna"): LoyaltyMembership => ({
  id: `${program}-${traveler}`,
  traveler_id: traveler,
  program,
  provider,
  number: "123",
  tier: null,
  notes: null,
});

function withTravelers(): TripGraph {
  const g = graph();
  for (const name of ["Anna", "Ben"])
    g.travelers.push({
      id: name.toLowerCase(),
      trip_id: g.trip.id,
      name,
      category: "adult",
      birth_date: null,
      notes: null,
      sort: 0,
    });
  return g;
}

const item = (g: TripGraph, optionId: string) => planContext(g, [], "Europe/Lisbon").items.get(optionId);

describe("loyalty programmes", () => {
  it("knows which companies a programme belongs to", () => {
    expect([...programProviders(member("Miles & More"))]).toContain("swiss");
    expect([...programProviders(member("miles and more"))]).toContain("lufthansa");
    expect([...programProviders(member("Bonus card", "Sixt"))]).toEqual(["sixt"]);
    expect(programProviders(member("Local club")).size).toBe(0);
  });

  it("offers the memberships matching a booking's airlines, company or platform", () => {
    const g = withTravelers();
    g.loyalty_memberships.push(
      member("Miles & More", null, "anna"),
      member("Flying Blue", null, "ben"),
      member("Genius", null, "ben"),
      member("Hilton Honors", null, "anna"),
    );
    // A Lufthansa flight connecting to a SWISS one, entered without a provider.
    const f = addFlight(g, addSlot(g, "flight"), 1, [
      ["FRA", "ZRH", "2027-06-10T07:00", "2027-06-10T08:00"],
      ["ZRH", "LIS", "2027-06-10T09:00", "2027-06-10T11:00"],
    ]);
    g.flight_segments.forEach((s, i) => {
      s.flight_number = i === 0 ? "LH 1234" : "LX 2088";
    });
    const s = addStay(g, addSlot(g, "accommodation"), 1, "2027-06-10", "2027-06-17", {
      url: "https://www.booking.com/hotel/pt/x.html",
    });
    const flight = item(g, f.id);
    const stay = item(g, s.id);
    expect(
      flight && membershipsFor(brandSource(flight), g).map((x) => [x.travelerName, x.membership.program]),
    ).toEqual([["Anna", "Miles & More"]]);
    expect(stay && membershipsFor(brandSource(stay), g).map((x) => x.membership.program)).toEqual(["Genius"]);
  });
});
