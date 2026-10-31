import { describe, expect, it } from "vitest";
import { addCar, addFlight, addSlot, addStay, graph } from "./fixture.test-util";
import { buildRoute, haversineKm, parseCoordinates, ROAD_FACTOR } from "./geo";
import { buildItems } from "./items";

const AIRPORTS: Record<string, { lat: number; lon: number }> = {
  FRA: { lat: 50.0264, lon: 8.5431 },
  LIS: { lat: 38.7813, lon: -9.1359 },
  OPO: { lat: 41.2481, lon: -8.6814 },
};
const airport = (c: string) => AIRPORTS[c] ?? null;

describe("distances", () => {
  it("computes great-circle distances", () => {
    // Frankfurt – Lisbon is about 1,880 km.
    expect(
      haversineKm(AIRPORTS.FRA ?? { lat: 0, lon: 0 }, AIRPORTS.LIS ?? { lat: 0, lon: 0 }),
    ).toBeGreaterThan(1860);
    expect(haversineKm(AIRPORTS.FRA ?? { lat: 0, lon: 0 }, AIRPORTS.LIS ?? { lat: 0, lon: 0 })).toBeLessThan(
      1900,
    );
    expect(haversineKm({ lat: 0, lon: 179.5 }, { lat: 0, lon: -179.5 })).toBeLessThan(112);
  });

  it.each([
    ["38.7139, -9.1334", { lat: 38.7139, lon: -9.1334 }],
    ["38.7139 -9.1334", { lat: 38.7139, lon: -9.1334 }],
    ["https://www.google.com/maps/place/Alfama/@38.7114,-9.1308,16z/data=x", { lat: 38.7114, lon: -9.1308 }],
    [
      "https://www.google.com/maps/place/X/data=!4m6!3m5!1s0x0:0x0!8m2!3d38.7121!4d-9.1299",
      { lat: 38.7121, lon: -9.1299 },
    ],
    ["https://maps.google.com/?q=41.1496,-8.6109", { lat: 41.1496, lon: -8.6109 }],
    [
      "https://www.openstreetmap.org/?mlat=37.0179&mlon=-7.9307#map=15/37.0179/-7.9307",
      { lat: 37.0179, lon: -7.9307 },
    ],
    ["https://www.openstreetmap.org/#map=12/41.1579/-8.6291", { lat: 41.1579, lon: -8.6291 }],
  ])("parses %s", (text, expected) => {
    expect(parseCoordinates(text)).toEqual(expected);
  });

  it.each(["", "Rua das Flores 12, Porto", "https://maps.app.goo.gl/abc", "100, 200"])(
    "rejects %s",
    (text) => {
      expect(parseCoordinates(text)).toBeNull();
    },
  );
});

describe("route", () => {
  function roadTrip() {
    const g = graph();
    const fs = addSlot(g, "flight");
    addFlight(g, fs, 1, [
      ["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"],
      ["OPO", "FRA", "2027-06-17T18:00", "2027-06-17T22:00"],
    ]);
    const s1 = addSlot(g, "accommodation");
    const lisbon = addStay(g, s1, 1, "2027-06-10", "2027-06-13");
    const s2 = addSlot(g, "accommodation");
    const porto = addStay(g, s2, 1, "2027-06-13", "2027-06-17");
    for (const [o, lat, lon] of [
      [lisbon, 38.7139, -9.1334],
      [porto, 41.1496, -8.6109],
    ] as const) {
      const a = g.accommodation_details.find((x) => x.option_id === o.id);
      if (a) Object.assign(a, { lat, lon });
    }
    return { g, lisbon, porto };
  }

  it("splits a road trip into flights and ground legs", () => {
    const { g } = roadTrip();
    const cs = addSlot(g, "rental_car");
    addCar(g, cs, 1, "2027-06-10T10:00", "2027-06-17T15:00", { return_location: "OPO" });
    const r = buildRoute(
      [...buildItems(g, { travelerCount: null, fallbackTz: "UTC" }).values()],
      airport,
      "Europe/Lisbon",
    );
    expect(r.legs.map((l) => `${l.mode}:${l.from.label}>${l.to.label}`)).toEqual([
      "flight:FRA>LIS",
      "drive:LIS>Option",
      "drive:Option>Option",
      "drive:Option>OPO",
      "flight:OPO>FRA",
    ]);
    expect(r.km.flight).toBeGreaterThan(3500);
    // Lisbon → Porto is about 275 km straight; roads are longer.
    const lisPorto = r.legs[2];
    expect(lisPorto?.estimated).toBe(true);
    expect((lisPorto?.km ?? 0) / ROAD_FACTOR).toBeGreaterThan(260);
    expect(r.km.ground).toBe(0);
    expect(r.missingStays).toHaveLength(0);
  });

  it("marks ground travel without a car and reports missing places", () => {
    const { g, porto } = roadTrip();
    const a = g.accommodation_details.find((x) => x.option_id === porto.id);
    if (a) Object.assign(a, { lat: null, lon: null });
    const first = g.flight_segments[0];
    if (first)
      g.flight_segments.push({
        ...first,
        id: "x",
        from_airport: "XXX",
        seq: 9,
        depart_local: "2027-06-20T10:00",
        arrive_local: "2027-06-20T12:00",
      });
    const r = buildRoute(
      [...buildItems(g, { travelerCount: null, fallbackTz: "UTC" }).values()],
      airport,
      "UTC",
    );
    expect(r.km.drive).toBe(0);
    expect(r.km.ground).toBeGreaterThan(0);
    expect(r.missingStays.map((i) => i.option.id)).toEqual([porto.id]);
    expect(r.unknownAirports).toEqual(["XXX"]);
  });
});
