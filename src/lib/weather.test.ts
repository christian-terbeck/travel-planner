import { describe, expect, it } from "vitest";
import { addSlot, addStay, graph } from "@/domain/fixture.test-util";
import { buildItems } from "@/domain/items";
import { weatherKind, weatherPlaces } from "./weather";

describe("weather", () => {
  it("groups WMO codes", () => {
    expect([0, 2, 3, 45, 53, 63, 81, 75, 95, null, 10].map(weatherKind)).toEqual([
      "clear",
      "partly",
      "cloudy",
      "fog",
      "drizzle",
      "rain",
      "showers",
      "snow",
      "thunder",
      null,
      null,
    ]);
  });

  it("asks for stays with coordinates, in trip order and at most 31 days each", () => {
    const g = graph();
    const slot = addSlot(g, "accommodation");
    const porto = addStay(g, slot, 1, "2027-07-01", "2027-08-15", { title: "Porto" });
    const lisbon = addStay(g, slot, 1, "2027-06-10", "2027-06-14", { title: "Lisbon" });
    addStay(g, slot, 1, "2027-06-14", "2027-06-16", { title: "No coordinates" });
    for (const [o, lat] of [
      [porto, 41.15],
      [lisbon, 38.72],
    ] as const) {
      const a = g.accommodation_details.find((x) => x.option_id === o.id);
      if (a) Object.assign(a, { lat, lon: -9 });
    }
    const places = weatherPlaces([
      ...buildItems(g, { travelerCount: 2, fallbackTz: "Europe/Lisbon" }).values(),
    ]);
    expect(places.map((p) => [p.item.option.title, p.query.from, p.query.to])).toEqual([
      ["Lisbon", "2027-06-10", "2027-06-14"],
      ["Porto", "2027-07-01", "2027-07-31"],
    ]);
  });
});
