// Everything a trip screen derives from the stored graph, computed once per data change.

import { useMemo } from "react";
import { type BudgetSummary, budget } from "@/domain/budget";
import { type CancellationStatus, cancellationStatus } from "@/domain/cancellation";
import type { PlanItem } from "@/domain/items";
import { type Reminder, reminders, tripStatus } from "@/domain/reminders";
import {
  bookedSelection,
  currentPlan,
  type Evaluation,
  evaluate,
  type PlanContext,
  planContext,
} from "@/domain/scenarios";
import { type Instant, Temporal } from "@/domain/time";
import type { Booking, ExchangeRate, OptionBundle, Scenario, TripGraph, TripStatus } from "@/domain/types";
import { type Prefs, usePrefs } from "./prefs";

export type EffectiveStatus =
  | "idea"
  | "planned"
  | "preferred"
  | "booked"
  | "cancelled"
  | "completed"
  | "archived"
  | "rejected";

export interface TripModel {
  graph: TripGraph;
  ctx: PlanContext;
  /** Preferred scenario with bookings in place. */
  plan: Evaluation;
  scenario: Scenario | null;
  /** Bookings only. */
  confirmed: Evaluation;
  budget: BudgetSummary;
  status: TripStatus;
  reminders: Reminder[];
  now: Instant;
  tz: string;
  item: (optionId: string | null | undefined) => PlanItem | undefined;
  effectiveStatus: (item: PlanItem) => EffectiveStatus;
  cancellation: (b: Booking) => CancellationStatus;
}

export function buildModel(
  g: TripGraph,
  rates: ExchangeRate[],
  prefs: Pick<Prefs, "timeZone" | "reminders">,
  now: Instant,
): TripModel {
  const tz = prefs.timeZone;
  const ctx = planContext(g, rates, tz);
  const { selection, scenario } = currentPlan(ctx);
  const plan = evaluate(ctx, selection);
  const confirmed = evaluate(ctx, bookedSelection(ctx));
  const chosen = new Set([...selection.values()].filter(Boolean));
  const today = now.toZonedDateTimeISO(tz).toPlainDate();
  return {
    graph: g,
    ctx,
    plan,
    scenario,
    confirmed,
    budget: budget(ctx),
    status: tripStatus(ctx, now, tz),
    reminders: reminders(ctx, now, tz, prefs.reminders),
    now,
    tz,
    item: (id) => (id ? ctx.items.get(id) : undefined),
    effectiveStatus: (item) => {
      const o = item.option;
      if (o.status === "archived") return "archived";
      if (o.status === "booked") {
        const end = item.endDate ?? item.startDate;
        return end && Temporal.PlainDate.compare(end, today) < 0 ? "completed" : "booked";
      }
      if (o.status === "cancelled" || o.status === "completed") return o.status;
      if (o.decision === "rejected") return "rejected";
      if (chosen.has(o.id)) return "preferred";
      return o.status;
    },
    cancellation: (b) =>
      cancellationStatus(b, g.cancellation_policies.find((p) => p.booking_id === b.id) ?? null, now, tz),
  };
}

export function useTripModel(g: TripGraph | undefined): TripModel | null {
  const prefs = usePrefs();
  return useMemo(() => (g ? buildModel(g, prefs.rates, prefs, Temporal.Now.instant()) : null), [g, prefs]);
}

export function useTripModels(gs: TripGraph[] | undefined): TripModel[] {
  const prefs = usePrefs();
  return useMemo(() => {
    const now = Temporal.Now.instant();
    return (gs ?? []).map((g) => buildModel(g, prefs.rates, prefs, now));
  }, [gs, prefs]);
}

/** An item as the editable bundle of rows it was built from. */
export function bundleOf(m: TripModel, item: PlanItem): OptionBundle {
  return {
    option: item.option,
    segments: item.segments.map((s) => s.segment),
    accommodation: item.accommodation,
    rental_car: item.rentalCar,
    activity: item.activity,
    fees: item.fees,
    policy: m.graph.cancellation_policies.find((p) => p.option_id === item.option.id) ?? null,
  };
}
