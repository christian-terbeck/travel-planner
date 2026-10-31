// Financial overview of a trip. Every figure comes from exactly one kind of record, so nothing
// is counted twice: estimates from options, confirmed amounts from bookings, paid amounts from
// payments, additional costs from expenses.

import { addCost, addTo, type Converted, type CostSum, convertTotals, emptyCost, type Totals } from "./money";
import {
  cheapest,
  currentPlan,
  type Evaluation,
  evaluate,
  type PlanContext,
  scenarioSelection,
} from "./scenarios";
import type { PaymentStatus, Scenario } from "./types";

export interface BudgetSummary {
  currency: string;
  target: number | null;
  maximum: number | null;
  /** The current plan (preferred scenario with bookings in place). */
  plan: Evaluation;
  planScenario: Scenario | null;
  /** Cheapest saved scenario that is compatible and fully priced. */
  cheapestScenario: { scenario: Scenario; evaluation: Evaluation } | null;
  /** Active bookings at their booked prices. */
  confirmed: CostSum;
  /** Payments minus refunds on bookings. */
  paid: Totals;
  refunds: Totals;
  /** Confirmed minus net paid, for active bookings (never below zero per booking). */
  outstanding: Totals;
  /** Kept by providers for cancelled bookings (payments − refunds). */
  cancellationCosts: Totals;
  plannedExpenses: Totals;
  actualExpenses: Totals;
  expenseRefunds: Totals;
  /** Plan total plus planned expenses: what the trip is expected to cost. */
  expected: CostSum;
  converted: {
    plan: Converted;
    confirmed: Converted;
    paid: Converted;
    outstanding: Converted;
    expected: Converted;
    actual: Converted;
  };
}

export function budget(ctx: PlanContext): BudgetSummary {
  const g = ctx.graph;
  const { selection, scenario } = currentPlan(ctx);
  const plan = evaluate(ctx, selection);

  let cheapestScenario: BudgetSummary["cheapestScenario"] = null;
  const evals = g.scenarios.map((s) => ({
    scenario: s,
    evaluation: evaluate(ctx, scenarioSelection(g, s.id)),
  }));
  const best = cheapest(evals.map((e) => e.evaluation));
  if (best) cheapestScenario = evals.find((e) => e.evaluation === best) ?? null;

  const confirmed = emptyCost();
  const paid: Totals = {};
  const refunds: Totals = {};
  const outstanding: Totals = {};
  const cancellationCosts: Totals = {};
  for (const b of g.bookings) {
    const ps = g.payments.filter((p) => p.booking_id === b.id);
    const net: Totals = {};
    for (const p of ps) {
      const signed = p.kind === "refund" ? -p.amount_minor : p.amount_minor;
      addTo(net, { minor: signed, currency: p.currency });
      if (p.kind === "refund") addTo(refunds, { minor: p.amount_minor, currency: p.currency });
      else addTo(paid, { minor: p.amount_minor, currency: p.currency });
    }
    if (b.status === "active") {
      if (b.price_minor === null) confirmed.missing.push(b.id);
      else {
        addTo(confirmed.totals, { minor: b.price_minor, currency: b.currency });
        const open = b.price_minor - (net[b.currency] ?? 0);
        if (open > 0 && b.payment_status !== "paid" && b.payment_status !== "not_applicable") {
          addTo(outstanding, { minor: open, currency: b.currency });
        }
      }
    } else {
      for (const [c, v] of Object.entries(net))
        if (v > 0) addTo(cancellationCosts, { minor: v, currency: c });
    }
  }
  // Refunds reduce what was paid.
  for (const [c, v] of Object.entries(refunds)) paid[c] = (paid[c] ?? 0) - v;

  const plannedExpenses: Totals = {};
  const actualExpenses: Totals = {};
  const expenseRefunds: Totals = {};
  for (const e of g.expenses) {
    const m = { minor: e.amount_minor, currency: e.currency };
    if (e.kind === "planned") addTo(plannedExpenses, m);
    else if (e.kind === "actual") addTo(actualExpenses, m);
    else addTo(expenseRefunds, m);
  }

  const expected = addCost(addCost(emptyCost(), plan.total), { totals: plannedExpenses, missing: [] });
  addCost(expected, { totals: cancellationCosts, missing: [] });
  const actualNet: Totals = { ...actualExpenses };
  for (const [c, v] of Object.entries(expenseRefunds)) actualNet[c] = (actualNet[c] ?? 0) - v;
  const conv = (t: Totals) => convertTotals(t, ctx.currency, ctx.rates);
  return {
    currency: ctx.currency,
    target: g.trip.budget_target_minor,
    maximum: g.trip.budget_max_minor,
    plan,
    planScenario: scenario,
    cheapestScenario,
    confirmed,
    paid,
    refunds,
    outstanding,
    cancellationCosts,
    plannedExpenses,
    actualExpenses,
    expenseRefunds,
    expected,
    converted: {
      plan: conv(plan.total.totals),
      confirmed: conv(confirmed.totals),
      paid: conv(paid),
      outstanding: conv(outstanding),
      expected: conv(expected.totals),
      actual: conv(actualNet),
    },
  };
}

/** Payment status that matches the recorded payments (a suggestion; the user decides). */
export function suggestedPaymentStatus(price: number | null, paid: number, refunded: number): PaymentStatus {
  if (refunded > 0) return paid - refunded <= 0 ? "refunded" : "partially_refunded";
  if (paid <= 0) return "unpaid";
  if (price === null) return "partially_paid";
  return paid >= price ? "paid" : "partially_paid";
}
