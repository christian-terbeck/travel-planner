// Reminders derived from the data whenever the app shows them; while the app runs, some are also
// sent as Windows notifications (see notify.ts). Nothing is delivered when the app is closed.

import { type CancellationState, cancellationStatus } from "./cancellation";
import { isJourney } from "./items";
import { currentPlan, evaluate, type PlanContext } from "./scenarios";
import { dateRuns, daysBetween, type Instant, type PlainDate, parseDate, Temporal } from "./time";
import type { TripStatus } from "./types";

export type ReminderKind =
  | "cancellation_deadline"
  | "departure"
  | "payment_due"
  | "activity"
  | "missing_accommodation"
  | "missing_document"
  | "task_due";

export interface Reminder {
  key: string;
  kind: ReminderKind;
  tripId: string;
  severity: "critical" | "warning" | "info";
  /** Date the reminder is about (YYYY-MM-DD). */
  date: string;
  at: Instant | null;
  optionId: string | null;
  bookingId: string | null;
  params: Record<string, string | number>;
}

export interface ReminderSettings {
  cancellationDays: number;
  departureDays: number;
  paymentDays: number;
  activityDays: number;
  missingDays: number;
  taskDays: number;
}

export const defaultReminderSettings: ReminderSettings = {
  cancellationDays: 7,
  departureDays: 14,
  paymentDays: 30,
  activityDays: 3,
  missingDays: 60,
  taskDays: 3,
};

export function reminders(
  ctx: PlanContext,
  now: Instant,
  tz: string,
  settings = defaultReminderSettings,
): Reminder[] {
  const g = ctx.graph;
  const tripId = g.trip.id;
  const today = now.toZonedDateTimeISO(tz).toPlainDate();
  const out: Reminder[] = [];
  const push = (r: Omit<Reminder, "tripId" | "key"> & { key?: string }) =>
    out.push({ ...r, tripId, key: r.key ?? `${r.kind}|${r.optionId ?? ""}|${r.bookingId ?? ""}|${r.date}` });

  const plan = evaluate(ctx, currentPlan(ctx).selection);
  const start = plan.period.start;
  const daysToStart = start ? daysBetween(today, start) : null;
  const upcoming = daysToStart !== null && daysToStart >= 0;

  for (const item of ctx.items.values()) {
    for (const b of item.activeBookings) {
      const policy = g.cancellation_policies.find((p) => p.booking_id === b.id) ?? null;
      const s = cancellationStatus(b, policy, now, tz);
      const open: CancellationState[] = ["free", "with_fee", "partial"];
      if (s.deadline && s.minutesLeft !== null && s.minutesLeft > 0 && open.includes(s.state)) {
        const days = s.minutesLeft / 1440;
        if (days <= settings.cancellationDays) {
          push({
            kind: "cancellation_deadline",
            severity: days <= 2 ? "critical" : "warning",
            date: s.deadline.toZonedDateTimeISO(tz).toPlainDate().toString(),
            at: s.deadline,
            optionId: item.option.id,
            bookingId: b.id,
            params: { title: item.option.title, state: s.state },
          });
        }
      }
      const paid = g.payments
        .filter((p) => p.booking_id === b.id && p.currency === b.currency)
        .reduce((sum, p) => sum + (p.kind === "refund" ? -p.amount_minor : p.amount_minor), 0);
      const itemStart = item.startDate ?? start;
      const daysToItem = itemStart ? daysBetween(today, itemStart) : null;
      if (
        ["unpaid", "partially_paid"].includes(b.payment_status) &&
        b.price_minor !== null &&
        paid < b.price_minor &&
        daysToItem !== null &&
        daysToItem >= 0 &&
        daysToItem <= settings.paymentDays
      ) {
        push({
          kind: "payment_due",
          severity: daysToItem <= 7 ? "critical" : "warning",
          date: (itemStart as PlainDate).toString(),
          at: null,
          optionId: item.option.id,
          bookingId: b.id,
          params: { title: item.option.title, open: b.price_minor - paid, currency: b.currency },
        });
      }
    }
    if (item.activity && item.activeBookings.length > 0 && item.startDate) {
      const d = daysBetween(today, item.startDate);
      if (d >= 0 && d <= settings.activityDays) {
        push({
          kind: "activity",
          severity: "info",
          date: item.startDate.toString(),
          at: item.start,
          optionId: item.option.id,
          bookingId: null,
          params: { title: item.option.title },
        });
      }
    }
    if (isJourney(item) && item.activeBookings.length > 0 && item.startDate) {
      const hasDoc = g.documents.some(
        (d) => d.option_id === item.option.id || item.activeBookings.some((b) => b.id === d.booking_id),
      );
      const d = daysBetween(today, item.startDate);
      if (!hasDoc && d >= 0 && d <= 30) {
        push({
          kind: "missing_document",
          severity: "info",
          date: item.startDate.toString(),
          at: null,
          optionId: item.option.id,
          bookingId: null,
          params: { title: item.option.title },
        });
      }
    }
  }

  if (upcoming && start && (daysToStart as number) <= settings.departureDays) {
    push({
      kind: "departure",
      severity: "info",
      date: start.toString(),
      at: plan.period.journeys[0]?.depart ?? null,
      optionId: null,
      bookingId: null,
      params: { days: daysToStart as number },
    });
  }
  if (upcoming && (daysToStart as number) <= settings.missingDays && plan.nights.gaps.length > 0) {
    for (const [first, last] of dateRuns(plan.nights.gaps)) {
      push({
        kind: "missing_accommodation",
        severity: (daysToStart as number) <= 14 ? "warning" : "info",
        date: first.toString(),
        at: null,
        optionId: null,
        bookingId: null,
        params: { from: first.toString(), to: last.toString(), nights: daysBetween(first, last) + 1 },
      });
    }
  }
  for (const t of g.tasks) {
    const due = parseDate(t.due_date);
    if (t.done_at || !due) continue;
    const d = daysBetween(today, due);
    if (d <= settings.taskDays) {
      push({
        kind: "task_due",
        severity: d < 0 ? "warning" : "info",
        date: due.toString(),
        at: null,
        optionId: t.option_id,
        bookingId: null,
        params: { title: t.title, overdue: d < 0 ? -d : 0 },
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Trip status: the user's explicit choice when set (cancelled, archived, …), otherwise derived
 * from the plan's dates and the bookings.
 */
export function tripStatus(ctx: PlanContext, now: Instant, tz: string): TripStatus {
  const g = ctx.graph;
  if (g.trip.status_override) return g.trip.status_override;
  const today = now.toZonedDateTimeISO(tz).toPlainDate();
  const plan = evaluate(ctx, currentPlan(ctx).selection);
  const { start, end } = plan.period;
  const anyBooked = g.bookings.some((b) => b.status === "active");
  if (start && end && anyBooked) {
    if (Temporal.PlainDate.compare(today, start) >= 0 && Temporal.PlainDate.compare(today, end) <= 0)
      return "ongoing";
    if (Temporal.PlainDate.compare(today, end) > 0) return "completed";
  }
  if (anyBooked) return "booked";
  if (g.options.length > 0 || g.slots.length > 0) return "planning";
  return "idea";
}
