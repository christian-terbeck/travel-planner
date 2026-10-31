// Central date and time handling. Travel times are stored as the local wall-clock time printed on
// the ticket plus an IANA zone; instants are derived here. All "now" values come from a Clock.

import { Temporal } from "temporal-polyfill";

export { Temporal };

export type Clock = () => Temporal.Instant;
export const systemClock: Clock = () => Temporal.Now.instant();

export type PlainDate = Temporal.PlainDate;
export type Instant = Temporal.Instant;
export type Zoned = Temporal.ZonedDateTime;

export function parseDate(s: string | null | undefined): PlainDate | null {
  if (!s) return null;
  try {
    return Temporal.PlainDate.from(s);
  } catch {
    return null;
  }
}

export function parseLocal(s: string | null | undefined): Temporal.PlainDateTime | null {
  if (!s) return null;
  try {
    return Temporal.PlainDateTime.from(s);
  } catch {
    return null;
  }
}

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    Temporal.Now.zonedDateTimeISO(tz);
    return true;
  } catch {
    return false;
  }
}

/**
 * Local wall-clock time in a zone. Without a valid zone the fallback is used and the result is
 * marked approximate, so callers can avoid confident conclusions (e.g. tight connections).
 */
export interface ZonedResult {
  zdt: Zoned;
  approximate: boolean;
}

export function zoned(
  local: string | null | undefined,
  tz: string | null | undefined,
  fallbackTz = "UTC",
): ZonedResult | null {
  const pdt = parseLocal(local);
  if (!pdt) return null;
  const valid = isValidTimeZone(tz);
  // "compatible": a wall time skipped by a DST change moves forward, a repeated one takes the first.
  const zdt = pdt.toZonedDateTime(valid ? tz : fallbackTz, { disambiguation: "compatible" });
  return { zdt, approximate: !valid };
}

/** A date plus optional "HH:MM" time in a zone. */
export function zonedFromParts(
  date: string | null | undefined,
  time: string | null | undefined,
  tz: string | null | undefined,
  fallbackTz = "UTC",
): ZonedResult | null {
  if (!date) return null;
  return zoned(`${date}T${time || "00:00"}`, tz, fallbackTz);
}

export function minutesBetween(a: Instant, b: Instant): number {
  return Math.round((b.epochMilliseconds - a.epochMilliseconds) / 60_000);
}

export function compareInstant(a: Instant, b: Instant): number {
  return Temporal.Instant.compare(a, b);
}

export function compareDate(a: PlainDate, b: PlainDate): number {
  return Temporal.PlainDate.compare(a, b);
}

export function minDate(a: PlainDate | null, b: PlainDate | null): PlainDate | null {
  if (!a) return b;
  if (!b) return a;
  return compareDate(a, b) <= 0 ? a : b;
}

export function maxDate(a: PlainDate | null, b: PlainDate | null): PlainDate | null {
  if (!a) return b;
  if (!b) return a;
  return compareDate(a, b) >= 0 ? a : b;
}

/** Whole days from a to b (b − a). */
export function daysBetween(a: PlainDate, b: PlainDate): number {
  return a.until(b, { largestUnit: "days" }).days;
}

/** Dates in [start, endExclusive). */
export function dateRange(start: PlainDate, endExclusive: PlainDate): PlainDate[] {
  const out: PlainDate[] = [];
  for (let d = start; compareDate(d, endExclusive) < 0; d = d.add({ days: 1 })) out.push(d);
  return out;
}

/** Collapses sorted dates into consecutive runs: [[first, last], …]. */
export function dateRuns(dates: PlainDate[]): Array<[PlainDate, PlainDate]> {
  const sorted = [...dates].sort(compareDate);
  const runs: Array<[PlainDate, PlainDate]> = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && daysBetween(last[1], d) === 1) last[1] = d;
    else if (!last || daysBetween(last[1], d) > 0) runs.push([d, d]);
  }
  return runs;
}

export function todayIn(clock: Clock, tz: string): PlainDate {
  return clock().toZonedDateTimeISO(tz).toPlainDate();
}

export function systemTimeZone(): string {
  return Temporal.Now.timeZoneId();
}

export function nowIsoUtc(clock: Clock): string {
  return clock().toString({ smallestUnit: "second" });
}

/** Today's date as "YYYY-MM-DD" in the system zone. */
export function todayIso(clock: Clock = systemClock): string {
  return todayIn(clock, systemTimeZone()).toString();
}
