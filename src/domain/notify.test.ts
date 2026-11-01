import { describe, expect, it } from "vitest";
import { dueNotifications, keepSent } from "./notify";
import type { Reminder } from "./reminders";
import { Temporal } from "./time";

const reminder = (kind: Reminder["kind"], date: string, key = `${kind}|${date}`): Reminder => ({
  key,
  kind,
  tripId: "t",
  severity: "warning",
  date,
  at: null,
  optionId: null,
  bookingId: null,
  params: {},
});
const day = (s: string) => Temporal.PlainDate.from(s);

describe("notifications", () => {
  const deadline = reminder("cancellation_deadline", "2027-06-10");

  it("announces a deadline when it comes up and once more the day before", () => {
    const sent = new Set<string>();
    const first = dueNotifications([deadline], sent, day("2027-06-04"));
    expect(first.map((n) => n.final)).toEqual([false]);
    for (const n of first) sent.add(n.key);
    expect(dueNotifications([deadline], sent, day("2027-06-05"))).toEqual([]);
    const last = dueNotifications([deadline], sent, day("2027-06-09"));
    expect(last.map((n) => n.final)).toEqual([true]);
    for (const n of last) sent.add(n.key);
    expect(dueNotifications([deadline], sent, day("2027-06-10"))).toEqual([]);
  });

  it("announces a reminder first seen on its last day only once", () => {
    const sent = new Set(dueNotifications([deadline], new Set(), day("2027-06-10")).map((n) => n.key));
    expect(dueNotifications([deadline], sent, day("2027-06-10"))).toEqual([]);
  });

  it("skips kinds that are only shown in the app", () => {
    expect(dueNotifications([reminder("activity", "2027-06-10")], new Set(), day("2027-06-09"))).toEqual([]);
  });

  it("forgets keys of reminders that are gone", () => {
    const other = reminder("departure", "2027-07-01");
    expect(keepSent([deadline.key, `${deadline.key}|final`, other.key], [deadline])).toEqual([
      deadline.key,
      `${deadline.key}|final`,
    ]);
  });
});
