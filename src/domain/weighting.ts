// Weighing complete trip scenarios against each other by more than the price: travel time and
// changes, the user's own ratings of the chosen alternatives, and how much can still be cancelled
// for free. Every measure is scaled between the best and the worst of the compared scenarios, so
// the score says "better or worse than the others here", never "optimal".

import { cancellationStatus } from "./cancellation";
import type { PlanItem } from "./items";
import type { Evaluation } from "./scenarios";
import { type Instant, minutesBetween, zoned } from "./time";
import type { TripGraph } from "./types";

export type Criterion = "price" | "time" | "rating" | "flexibility";
export const CRITERIA: Criterion[] = ["price", "time", "rating", "flexibility"];

/** 0 = ignore, 3 = very important. */
export type Weights = Record<Criterion, number>;
export const DEFAULT_WEIGHTS: Weights = { price: 3, time: 0, rating: 0, flexibility: 0 };

export const isPriceOnly = (w: Weights) => CRITERIA.every((c) => (c === "price" ? w[c] > 0 : w[c] === 0));

export interface Metrics {
  /** Total in the trip currency; null when incomplete. */
  price: number | null;
  /** Minutes on the way (all journeys, door of the first to door of the last segment). */
  travelMinutes: number | null;
  /** Changes inside journeys. */
  changes: number;
  /** Average of the user's ratings (0–5) of the chosen alternatives; null when none is rated. */
  rating: number | null;
  /** Share (0–1) of the priced items that can still be cancelled for free; null without terms at all. */
  flexible: number | null;
}

/** Free cancellation still possible: the booked terms for booked items, else the offered ones. */
function freelyCancellable(g: TripGraph, item: PlanItem, now: Instant, tz: string): boolean | null {
  const booking = item.activeBookings[0];
  if (booking) {
    const policy = g.cancellation_policies.find((p) => p.booking_id === booking.id) ?? null;
    if (!policy) return null;
    return cancellationStatus(booking, policy, now, tz).state === "free";
  }
  const p = item.policy;
  if (!p || p.policy_type === "unknown") return null;
  if (p.policy_type !== "free_until") return false;
  const deadline = zoned(p.deadline_local, p.deadline_tz, tz)?.zdt.toInstant();
  return !deadline || minutesBetween(now, deadline) > 0;
}

export function metrics(e: Evaluation, g: TripGraph, now: Instant, tz: string): Metrics {
  const js = e.period.journeys;
  const travelMinutes =
    js.length > 0 && js.every((j) => j.depart && j.arrive)
      ? js.reduce((sum, j) => sum + minutesBetween(j.depart as Instant, j.arrive as Instant), 0)
      : null;
  const changes = js.reduce((n, j) => n + Math.max(0, j.segments.length - 1), 0);
  const rated = e.items.map((i) => i.option.rating).filter((r): r is number => r !== null);
  const rating = rated.length > 0 ? rated.reduce((a, b) => a + b, 0) / rated.length : null;
  const terms = e.items.map((i) => freelyCancellable(g, i, now, tz)).filter((x): x is boolean => x !== null);
  const flexible = terms.length > 0 ? terms.filter(Boolean).length / terms.length : null;
  return { price: e.complete ? e.converted.minor : null, travelMinutes, changes, rating, flexible };
}

export interface Weighed {
  e: Evaluation;
  metrics: Metrics;
  /** 0 = best of the compared scenarios on every weighted measure, 1 = worst. */
  score: number;
}

/**
 * Scores scenarios by the weighted measures, each scaled between the best and the worst value
 * among them. A missing price or travel time counts as worst; a missing rating or set of terms as
 * the middle. Compatible and complete scenarios come first, then by score, then by price.
 */
export function weigh(
  evals: Evaluation[],
  g: TripGraph,
  weights: Weights,
  now: Instant,
  tz: string,
): Weighed[] {
  const ms = evals.map((e) => metrics(e, g, now, tz));
  const scale = (values: Array<number | null>, missing: number, higherIsBetter: boolean) => {
    const known = values.filter((v): v is number => v !== null);
    const min = Math.min(...known);
    const max = Math.max(...known);
    return values.map((v) => {
      if (v === null) return missing;
      if (max === min) return 0;
      const x = (v - min) / (max - min);
      return higherIsBetter ? 1 - x : x;
    });
  };
  // Each change counts like an hour on the way.
  const time = ms.map((m) => (m.travelMinutes === null ? null : m.travelMinutes + 60 * m.changes));
  const parts: Record<Criterion, number[]> = {
    price: scale(
      ms.map((m) => m.price),
      1,
      false,
    ),
    time: scale(time, 1, false),
    rating: scale(
      ms.map((m) => m.rating),
      0.5,
      true,
    ),
    flexibility: scale(
      ms.map((m) => m.flexible),
      0.5,
      true,
    ),
  };
  const total = CRITERIA.reduce((s, c) => s + weights[c], 0);
  const out = evals.map((e, i) => ({
    e,
    metrics: ms[i] as Metrics,
    score: total === 0 ? 0 : CRITERIA.reduce((s, c) => s + weights[c] * (parts[c][i] ?? 0), 0) / total,
  }));
  return out.sort(
    (a, b) =>
      Number(b.e.compatible) - Number(a.e.compatible) ||
      Number(b.e.complete) - Number(a.e.complete) ||
      a.score - b.score ||
      a.e.converted.minor - b.e.converted.minor,
  );
}
