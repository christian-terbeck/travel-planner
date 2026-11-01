// Which reminders become operating-system notifications. Each reminder is announced once when
// it first appears and, for dated deadlines, once more when the date is today or tomorrow.

import type { Reminder, ReminderKind } from "./reminders";
import { daysBetween, type PlainDate, parseDate } from "./time";

export const NOTIFY_KINDS: ReadonlySet<ReminderKind> = new Set([
  "cancellation_deadline",
  "payment_due",
  "departure",
  "task_due",
  "missing_document",
]);

export interface Notification {
  /** Remembered once sent, so the same notification never repeats. */
  key: string;
  reminder: Reminder;
  /** The last call: the date is today or tomorrow. */
  final: boolean;
}

export function dueNotifications(
  reminders: Reminder[],
  sent: ReadonlySet<string>,
  today: PlainDate,
): Notification[] {
  const out: Notification[] = [];
  for (const r of reminders) {
    if (!NOTIFY_KINDS.has(r.kind)) continue;
    const date = parseDate(r.date);
    const final = !!date && daysBetween(today, date) <= 1;
    const key = final ? `${r.key}|final` : r.key;
    // A reminder first seen on its last day is announced once, as the final one.
    if (sent.has(key) || (!final && sent.has(`${r.key}|final`))) continue;
    out.push({ key, reminder: r, final });
  }
  return out;
}

/** Sent keys still worth remembering: those of reminders that are still current. */
export function keepSent(sent: Iterable<string>, reminders: Reminder[]): string[] {
  const current = new Set(reminders.map((r) => r.key));
  return [...sent].filter((k) => current.has(k.replace(/\|final$/, "")));
}
