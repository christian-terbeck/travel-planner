import { describe, expect, it } from "vitest";
import { addFlight, addSlot, addStay, graph } from "./fixture.test-util";
import { explore, planContext } from "./scenarios";
import { Temporal } from "./time";
import type { CancellationPolicy, TripGraph } from "./types";
import { DEFAULT_WEIGHTS, isPriceOnly, metrics, weigh } from "./weighting";

const NOW = Temporal.Instant.from("2027-05-01T10:00:00Z");
const TZ = "Europe/Lisbon";

function policy(optionId: string, type: CancellationPolicy["policy_type"], deadline: string | null = null) {
  return {
    id: `p-${optionId}`,
    option_id: optionId,
    booking_id: null,
    policy_type: type,
    deadline_local: deadline,
    deadline_tz: deadline ? TZ : null,
    fee_minor: null,
    refundable_minor: null,
    refundable_percent: null,
    currency: "EUR",
    policy_text: null,
    source: null,
    checked_at: null,
    notes: null,
    updated_at: "2027-04-01T00:00:00Z",
  } satisfies CancellationPolicy;
}

/** A cheap flight with a change and a dearer direct one; a cheap rigid stay and a dearer flexible one. */
function choices(): TripGraph {
  const g = graph();
  const fs = addSlot(g, "flight");
  addFlight(
    g,
    fs,
    25_000,
    [
      ["FRA", "MAD", "2027-06-10T06:00", "2027-06-10T08:30"],
      ["MAD", "LIS", "2027-06-10T10:00", "2027-06-10T10:30"],
    ],
    { title: "Via Madrid" },
  );
  addFlight(g, fs, 32_000, [["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"]], { title: "Direct" });
  const ss = addSlot(g, "accommodation");
  const rigid = addStay(g, ss, 50_000, "2027-06-10", "2027-06-17", { title: "Rigid", rating: 3 });
  const flex = addStay(g, ss, 56_000, "2027-06-10", "2027-06-17", { title: "Flexible", rating: 5 });
  g.cancellation_policies.push(
    policy(rigid.id, "non_refundable"),
    policy(flex.id, "free_until", "2027-06-01T18:00"),
  );
  return g;
}

const titles = (g: TripGraph, w: typeof DEFAULT_WEIGHTS) => {
  const ctx = planContext(g, [], TZ);
  return weigh(explore(ctx).results, g, w, NOW, TZ).map((x) =>
    x.e.items.map((i) => i.option.title).join(" + "),
  );
};

describe("weighing scenarios", () => {
  it("keeps the price order by default", () => {
    expect(isPriceOnly(DEFAULT_WEIGHTS)).toBe(true);
    expect(titles(choices(), DEFAULT_WEIGHTS)[0]).toBe("Via Madrid + Rigid");
  });

  it("puts the direct, flexible and better rated trip first when those matter", () => {
    expect(titles(choices(), { price: 1, time: 3, rating: 0, flexibility: 0 })[0]).toMatch(/^Direct/);
    expect(titles(choices(), { price: 1, time: 0, rating: 0, flexibility: 3 })[0]).toMatch(/Flexible$/);
    expect(titles(choices(), { price: 0, time: 3, rating: 3, flexibility: 3 })[0]).toBe("Direct + Flexible");
  });

  it("measures time on the way, changes, ratings and free cancellation", () => {
    const g = choices();
    const ctx = planContext(g, [], TZ);
    const viaRigid = explore(ctx).results.find((e) =>
      e.items.every((i) => ["Via Madrid", "Rigid"].includes(i.option.title)),
    );
    expect(viaRigid && metrics(viaRigid, g, NOW, TZ)).toMatchObject({
      price: 75_000,
      travelMinutes: 330,
      changes: 1,
      rating: 3,
      flexible: 0,
    });
    // After the free cancellation deadline the flexible stay no longer counts as flexible.
    const late = Temporal.Instant.from("2027-06-05T10:00:00Z");
    const directFlex = explore(ctx).results.find((e) =>
      e.items.every((i) => ["Direct", "Flexible"].includes(i.option.title)),
    );
    expect(directFlex && metrics(directFlex, g, late, TZ).flexible).toBe(0);
  });
});
