// Evaluating a selection of options (a scenario) and exploring all combinations of the saved
// options. Only saved alternatives are compared; results never claim to be the cheapest offer
// available anywhere.

import { checkPlan, duplicateBookings, type Warning, withoutDismissed } from "./conflicts";
import { buildItems, type PlanItem, planBaseCost, travelerCount } from "./items";
import { type NightPlan, nightPlan, type Period, travelDays, tripPeriod } from "./itinerary";
import { addCost, type Converted, type CostSum, convertTotals, emptyCost } from "./money";
import { compareDate, type PlainDate } from "./time";
import type { ExchangeRate, Scenario, SlotKind, TripGraph } from "./types";

/** Slot id → chosen option id, or null for "intentionally left out". */
export type Selection = Map<string, string | null>;

export interface PlanContext {
  graph: TripGraph;
  items: Map<string, PlanItem>;
  rates: ExchangeRate[];
  currency: string;
  dismissed: Set<string>;
}

export function planContext(graph: TripGraph, rates: ExchangeRate[], fallbackTz: string): PlanContext {
  return {
    graph,
    items: buildItems(graph, { travelerCount: travelerCount(graph), fallbackTz }),
    rates,
    currency: graph.trip.currency,
    dismissed: new Set(graph.dismissed_warnings.map((d) => d.key)),
  };
}

export type CostCategory = "transport" | "accommodation" | "rental_car" | "activity" | "other" | "fees";

const categoryOf: Record<SlotKind, CostCategory> = {
  flight: "transport",
  accommodation: "accommodation",
  rental_car: "rental_car",
  activity: "activity",
  transport: "transport",
  parking: "other",
  insurance: "other",
  other: "other",
};

export interface Evaluation {
  selection: Selection;
  items: PlanItem[];
  costs: Record<CostCategory, CostSum>;
  total: CostSum;
  /** Total in the trip currency (only amounts with a rate; see `unconvertible`). */
  converted: Converted;
  /** All required slots chosen, all prices known and convertible. */
  complete: boolean;
  /** Part of the total that is already booked. */
  booked: CostSum;
  period: Period;
  nights: NightPlan;
  travelDays: number | null;
  rentalDays: number | null;
  warnings: Warning[];
  compatible: boolean;
  /** Target budget minus total, when the total is complete. */
  budgetDelta: number | null;
}

export function evaluate(ctx: PlanContext, selection: Selection): Evaluation {
  const g = ctx.graph;
  const items: PlanItem[] = [];
  for (const [, optionId] of selection) {
    const item = optionId ? ctx.items.get(optionId) : undefined;
    if (item) items.push(item);
  }
  const costs: Record<CostCategory, CostSum> = {
    transport: emptyCost(),
    accommodation: emptyCost(),
    rental_car: emptyCost(),
    activity: emptyCost(),
    other: emptyCost(),
    fees: emptyCost(),
  };
  const total = emptyCost();
  const booked = emptyCost();
  for (const i of items) {
    const base = planBaseCost(i);
    addCost(costs[categoryOf[i.kind]], base);
    addCost(costs.fees, i.feeCost);
    addCost(total, base);
    addCost(total, i.feeCost);
    if (i.activeBookings.length > 0) addCost(booked, base);
  }
  const period = tripPeriod(g.trip, items);
  const nights = nightPlan(
    period,
    items,
    g.open_nights.map((n) => n.night),
  );
  const warnings = withoutDismissed(
    [
      ...checkPlan({
        trip: g.trip,
        slots: g.slots,
        stations: g.stations,
        travelers: g.travelers,
        travelerDocuments: g.traveler_documents,
        items,
        selection,
        period,
        nights,
      }),
      ...duplicateBookings(items),
    ],
    ctx.dismissed,
  );
  const converted = convertTotals(total.totals, ctx.currency, ctx.rates);
  const requiredMissing = g.slots.some((s) => s.required && !selection.has(s.id));
  const complete =
    total.missing.length === 0 && !requiredMissing && Object.keys(converted.unconvertible).length === 0;
  const rental = items.filter((i) => i.rentalDays !== null).map((i) => i.rentalDays as number);
  return {
    selection,
    items,
    costs,
    total,
    converted,
    complete,
    booked,
    period,
    nights,
    travelDays: travelDays(period),
    rentalDays: rental.length > 0 ? rental.reduce((a, b) => a + b, 0) : null,
    warnings,
    compatible: !warnings.some((w) => w.blocking),
    budgetDelta:
      complete && g.trip.budget_target_minor !== null ? g.trip.budget_target_minor - converted.minor : null,
  };
}

export function scenarioSelection(g: TripGraph, scenarioId: string): Selection {
  const sel: Selection = new Map();
  for (const s of g.scenario_selections) if (s.scenario_id === scenarioId) sel.set(s.slot_id, s.option_id);
  return sel;
}

export function preferredScenario(g: TripGraph): Scenario | null {
  return g.scenarios.find((s) => s.preferred) ?? null;
}

/** Options with an active booking, per slot (the confirmed itinerary). */
export function bookedSelection(ctx: PlanContext): Selection {
  const sel: Selection = new Map();
  for (const item of ctx.items.values()) {
    if (item.activeBookings.length > 0 && !sel.has(item.slot.id)) sel.set(item.slot.id, item.option.id);
  }
  return sel;
}

/**
 * The plan the trip is working towards: the preferred scenario, with booked options taking the
 * place of whatever the scenario chose for their slot. Without a preferred scenario: bookings only.
 */
export function currentPlan(ctx: PlanContext): { selection: Selection; scenario: Scenario | null } {
  const scenario = preferredScenario(ctx.graph);
  const selection: Selection = scenario ? scenarioSelection(ctx.graph, scenario.id) : new Map();
  for (const [slot, option] of bookedSelection(ctx)) selection.set(slot, option);
  return { selection, scenario };
}

/** Options a combination may use for a slot. A booked slot is fixed to its booking. */
export function candidates(ctx: PlanContext, slotId: string): Array<string | null> {
  const slot = ctx.graph.slots.find((s) => s.id === slotId);
  const options = [...ctx.items.values()].filter((i) => i.slot.id === slotId);
  const booked = options.filter((i) => i.activeBookings.length > 0);
  if (booked.length > 0) return [booked[0]?.option.id ?? null];
  const open = options
    .filter((i) => i.option.decision !== "rejected" && !["cancelled", "archived"].includes(i.option.status))
    .map((i) => i.option.id);
  const list: Array<string | null> = [...open];
  if (!slot?.required || open.length === 0) list.push(null);
  return list;
}

export interface Exploration {
  count: number;
  /** Too many combinations to evaluate; the user should narrow the options. */
  tooMany: boolean;
  results: Evaluation[];
}

export const COMBINATION_LIMIT = 5000;

export function explore(ctx: PlanContext, limit = COMBINATION_LIMIT): Exploration {
  const slots = ctx.graph.slots;
  const lists = slots.map((s) => candidates(ctx, s.id));
  const count = lists.reduce((n, l) => n * Math.max(1, l.length), 1);
  if (count > limit) return { count, tooMany: true, results: [] };
  const results: Evaluation[] = [];
  const walk = (k: number, sel: Selection) => {
    if (k === slots.length) {
      results.push(evaluate(ctx, new Map(sel)));
      return;
    }
    const slot = slots[k];
    const list = lists[k] ?? [];
    if (!slot || list.length === 0) return walk(k + 1, sel);
    for (const choice of list) {
      // `null` here means: leave this optional slot out of the combination.
      if (choice === null) sel.delete(slot.id);
      else sel.set(slot.id, choice);
      walk(k + 1, sel);
    }
    sel.delete(slot.id);
  };
  walk(0, new Map());
  results.sort(rank);
  return { count, tooMany: false, results };
}

/** Compatible before incompatible, complete before incomplete, then by converted total. */
export function rank(a: Evaluation, b: Evaluation): number {
  if (a.compatible !== b.compatible) return a.compatible ? -1 : 1;
  if (a.complete !== b.complete) return a.complete ? -1 : 1;
  return a.converted.minor - b.converted.minor;
}

export interface DateWindow {
  start: PlainDate;
  end: PlainDate;
  nights: number;
  /** Cheapest compatible, complete combination for these dates. */
  best: Evaluation;
  /** Compatible, complete combinations with these dates and the fewest nights without a bed. */
  count: number;
}

/**
 * Travel dates the saved alternatives allow, each with its cheapest compatible and complete
 * combination, in date order. Shows whether shifting the trip saves money. Combinations that leave
 * more nights uncovered than the best ones (e.g. a stay for other dates) are not a real
 * alternative for their dates and are left out.
 */
export function travelWindows(results: Evaluation[]): DateWindow[] {
  const usable = results.filter((e) => e.compatible && e.complete && e.period.start && e.period.end);
  const fewestGaps = Math.min(...usable.map((e) => e.nights.gaps.length));
  const byDates = new Map<string, DateWindow>();
  for (const e of usable) {
    const { start, end } = e.period;
    if (!start || !end || e.nights.gaps.length > fewestGaps) continue;
    const key = `${start}/${end}`;
    const w = byDates.get(key);
    if (!w) byDates.set(key, { start, end, nights: start.until(end).days, best: e, count: 1 });
    else {
      w.count += 1;
      if (e.converted.minor < w.best.converted.minor) w.best = e;
    }
  }
  return [...byDates.values()].sort((a, b) => compareDate(a.start, b.start) || compareDate(a.end, b.end));
}

/** The cheapest compatible, complete evaluation of a list (null when none qualifies). */
export function cheapest(evals: Evaluation[]): Evaluation | null {
  const ok = evals.filter((e) => e.compatible && e.complete);
  return ok.length === 0 ? null : ok.reduce((a, b) => (b.converted.minor < a.converted.minor ? b : a));
}

export function sameSelection(a: Selection, b: Selection): boolean {
  const norm = (s: Selection) =>
    [...s.entries()]
      .filter(([, v]) => v !== null)
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join(",");
  return norm(a) === norm(b);
}
