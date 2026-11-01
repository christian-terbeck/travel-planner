import { describe, expect, it } from "vitest";
import { addBooking, addSlot, addStay, graph } from "./fixture.test-util";
import { reminders } from "./reminders";
import { planContext } from "./scenarios";
import { Temporal } from "./time";
import type { PriceObservation, TripGraph } from "./types";

const now = Temporal.Instant.from("2027-05-01T10:00:00Z");
const alerts = (g: TripGraph) =>
  reminders(planContext(g, [], "Europe/Berlin"), now, "Europe/Berlin").filter(
    (r) => r.kind === "price_target",
  );
const check = (optionId: string, at: string, price: number): PriceObservation => ({
  id: `obs-${at}`,
  option_id: optionId,
  observed_at: at,
  price_minor: price,
  currency: "EUR",
  kind: "manual_check",
  provider: null,
  attributes: null,
  notes: null,
});

describe("price alerts", () => {
  it("fires when the latest check is at or below the target", () => {
    const g = graph();
    const o = addStay(g, addSlot(g, "accommodation"), 50_000, "2027-06-10", "2027-06-14", {
      target_price_minor: 45_000,
    });
    g.price_observations.push(check(o.id, "2027-04-20T08:00:00Z", 44_000));
    g.price_observations.push(check(o.id, "2027-04-28T08:00:00Z", 47_000));
    expect(alerts(g)).toEqual([]);
    g.price_observations.push(check(o.id, "2027-04-30T08:00:00Z", 45_000));
    const [a] = alerts(g);
    expect(a?.params).toMatchObject({ price: 45_000, target: 45_000 });
    expect(a?.date).toBe("2027-04-30");
  });

  it("is silent once the alternative is booked", () => {
    const g = graph();
    const o = addStay(g, addSlot(g, "accommodation"), 50_000, "2027-06-10", "2027-06-14", {
      target_price_minor: 45_000,
    });
    g.price_observations.push(check(o.id, "2027-04-30T08:00:00Z", 40_000));
    addBooking(g, o, 40_000);
    expect(alerts(g)).toEqual([]);
  });
});
