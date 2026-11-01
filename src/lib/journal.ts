// The days of the travel journal: every day of the trip's period (from the plan) plus any day
// that already has an entry, each with what the plan says about it — where the night was spent
// and what started that day — so writing starts from a reminder instead of a blank page.

import type { PlanItem } from "@/domain/items";
import { dateRange } from "@/domain/time";
import type { Document, JournalEntry } from "@/domain/types";
import type { TripModel } from "./model";
import { newId, nowIso } from "./rows";

/** Longer periods are not listed day by day; entries still show. */
export const MAX_LISTED_DAYS = 120;

export interface JournalDay {
  day: string;
  entry: JournalEntry | null;
  photos: Document[];
  /** Stays of the night starting this day. */
  stays: PlanItem[];
  /** Journeys, activities and other plan items that start this day (stays excluded). */
  events: PlanItem[];
  /** Inside the trip's period. */
  inTrip: boolean;
}

export function journalDays(m: TripModel): JournalDay[] {
  const { start, end } = m.plan.period;
  const days = new Set<string>();
  if (start && end && start.until(end).days < MAX_LISTED_DAYS)
    for (const d of dateRange(start, end.add({ days: 1 }))) days.add(d.toString());
  const inTrip = new Set(days);
  for (const e of m.graph.journal_entries) days.add(e.day);

  const entries = new Map(m.graph.journal_entries.map((e) => [e.day, e]));
  return [...days].sort().map((day) => {
    const entry = entries.get(day) ?? null;
    return {
      day,
      entry,
      photos: entry ? m.graph.documents.filter((d) => d.journal_entry_id === entry.id) : [],
      stays: (m.plan.nights.covered.get(day) ?? []).map((id) => m.item(id)).filter((i): i is PlanItem => !!i),
      events: m.plan.items
        .filter((i) => !i.accommodation && i.startDate?.toString() === day)
        .sort((a, b) => (a.start?.epochMilliseconds ?? 0) - (b.start?.epochMilliseconds ?? 0)),
      inTrip: inTrip.has(day),
    };
  });
}

export function newJournalEntry(tripId: string, day: string): JournalEntry {
  const now = nowIso();
  return { id: newId(), trip_id: tripId, day, title: null, body: "", created_at: now, updated_at: now };
}

/** Pictures the webview can show; others (HEIC) are opened with their app. */
export const isShownImage = (d: Document) =>
  ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(d.mime ?? "");
