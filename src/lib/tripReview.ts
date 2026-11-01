// What the optional trip review sends to Claude: the plan as compact JSON, without names of
// people, booking references, notes, contacts, links or documents. Shown to the user as sent.

import { segmentFrom, segmentTo } from "@/domain/items";
import { type Totals, toMajorString } from "@/domain/money";
import type { TripModel } from "./model";

const amount = (totals: Totals) =>
  Object.entries(totals).map(([currency, minor]) => `${toMajorString(minor, currency)} ${currency}`);

export function reviewInput(m: TripModel, today: string) {
  const g = m.graph;
  const t = g.trip;
  const plan = m.plan;
  const inPlan = new Set(plan.items.map((i) => i.option.id));
  return {
    today,
    trip: {
      title: t.title,
      destination: t.destination,
      travel_style: t.travel_style,
      date_limits: { earliest_departure: t.earliest_departure, latest_return: t.latest_return },
      preferred: { start: t.preferred_start, end: t.preferred_end, month: t.preferred_month },
      nights: { min: t.min_nights, max: t.max_nights },
      home_airports: t.home_airports,
      budget: { currency: t.currency, target_minor: t.budget_target_minor, max_minor: t.budget_max_minor },
      buffers_min: {
        after_arrival: t.arrival_buffer_min,
        before_departure: t.departure_buffer_min,
        change_same_means: t.connection_buffer_min,
        change_of_means_or_airport: t.mode_change_buffer_min,
      },
    },
    travelers: g.travelers.map((p, i) => ({ person: `Person ${i + 1}`, category: p.category })),
    stops: g.stations.map((s) => ({ name: s.name, arrive: s.arrive_date, depart: s.depart_date })),
    plan: {
      period: { start: plan.period.start?.toString() ?? null, end: plan.period.end?.toString() ?? null },
      nights_without_accommodation: plan.nights.gaps.map((d) => d.toString()),
      total: amount(plan.total.totals),
      total_in_trip_currency_minor: plan.converted.minor,
      prices_missing: plan.total.missing.length,
      complete: plan.complete,
    },
    needs: g.slots.map((s) => ({
      need: s.title,
      kind: s.kind,
      required: s.required,
      alternatives: plan.items
        .concat([...m.ctx.items.values()].filter((i) => !inPlan.has(i.option.id)))
        .filter((i) => i.slot.id === s.id && i.option.status !== "archived")
        .map((i) => ({
          title: i.option.title,
          in_plan: inPlan.has(i.option.id),
          status: m.effectiveStatus(i),
          provider: i.option.provider,
          estimate: amount(i.estimate.totals),
          price_unknown: i.estimate.missing.length > 0,
          dates: { from: i.startDate?.toString() ?? null, to: i.endDate?.toString() ?? null },
          segments: i.segments.map((x) => ({
            mode: x.segment.mode ?? "flight",
            from: segmentFrom(x.segment),
            to: segmentTo(x.segment),
            depart: x.segment.depart_local,
            arrive: x.segment.arrive_local,
          })),
          stay: i.accommodation && { type: i.accommodation.accommodation_type, nights: i.nights },
          rental_days: i.rentalDays,
          cancellation: i.policy && { type: i.policy.policy_type, deadline: i.policy.deadline_local },
          booked: i.activeBookings.length > 0,
          pros: i.option.pros,
          cons: i.option.cons,
        })),
    })),
    warnings: plan.warnings.map((w) => ({ code: w.code, severity: w.severity, date: w.date })),
    reminders: m.reminders.map((r) => ({ kind: r.kind, date: r.date })),
    open_tasks: g.tasks.filter((x) => !x.done_at).map((x) => ({ title: x.title, due: x.due_date })),
    budget: {
      confirmed: amount(m.budget.confirmed.totals),
      paid: amount(m.budget.paid),
      outstanding: amount(m.budget.outstanding),
      planned_expenses: amount(m.budget.plannedExpenses),
    },
  };
}
