// Search across all trips for the command palette: titles, providers, booking references,
// places, notes, tasks and documents. Everything is local, so the index is rebuilt per change.

import type { TripGraph } from "@/domain/types";

export type SearchKind =
  | "trip"
  | "slot"
  | "option"
  | "booking"
  | "traveler"
  | "station"
  | "expense"
  | "task"
  | "note"
  | "document"
  | "packing";

export interface SearchEntry {
  kind: SearchKind;
  id: string;
  tripId: string;
  tripTitle: string;
  title: string;
  /** Second line, e.g. the booking reference or the start of a note. */
  detail: string | null;
  /** Route inside the trip ("" for the overview). */
  view: "" | "planning" | "bookings" | "budget" | "documents" | "packing";
  /** Option to select in the planning view. */
  optionId?: string;
  text: string;
}

/** Lower case without accents, so "Sao" finds "São". */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function entry(
  g: TripGraph,
  kind: SearchKind,
  id: string,
  title: string,
  detail: string | null,
  view: SearchEntry["view"],
  extra: Array<string | null | undefined> = [],
  optionId?: string,
): SearchEntry {
  return {
    kind,
    id,
    tripId: g.trip.id,
    tripTitle: g.trip.title,
    title,
    detail,
    view,
    optionId,
    text: normalize([title, detail, ...extra].filter(Boolean).join(" ")),
  };
}

export function buildIndex(graphs: TripGraph[]): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const g of graphs) {
    const t = g.trip;
    out.push(entry(g, "trip", t.id, t.title, t.destination, "", [t.description, t.notes]));
    for (const s of g.stations) out.push(entry(g, "station", s.id, s.name, s.location, "", [s.notes]));
    for (const p of g.travelers) out.push(entry(g, "traveler", p.id, p.name, null, ""));
    for (const s of g.slots) out.push(entry(g, "slot", s.id, s.title, null, "planning", [s.notes]));
    const option = new Map(g.options.map((o) => [o.id, o]));
    for (const o of g.options) {
      const places: string[] = [];
      for (const seg of g.flight_segments.filter((x) => x.option_id === o.id))
        places.push(
          seg.from_airport ?? "",
          seg.to_airport ?? "",
          seg.from_place ?? "",
          seg.to_place ?? "",
          seg.flight_number ?? "",
          seg.airline ?? "",
        );
      const stay = g.accommodation_details.find((x) => x.option_id === o.id);
      const car = g.rental_car_details.find((x) => x.option_id === o.id);
      const act = g.activity_details.find((x) => x.option_id === o.id);
      places.push(
        stay?.address ?? "",
        car?.pickup_location ?? "",
        car?.return_location ?? "",
        act?.location ?? "",
      );
      out.push(
        entry(g, "option", o.id, o.title, o.provider, "planning", [o.platform, o.notes, ...places], o.id),
      );
    }
    for (const b of g.bookings) {
      const o = option.get(b.option_id);
      out.push(
        entry(g, "booking", b.id, o?.title ?? b.provider ?? "", b.reference, "bookings", [
          b.provider,
          b.platform,
          b.notes,
        ]),
      );
    }
    for (const e of g.expenses) out.push(entry(g, "expense", e.id, e.title, null, "budget", [e.notes]));
    for (const x of g.tasks) out.push(entry(g, "task", x.id, x.title, x.due_date, "documents", [x.notes]));
    for (const n of g.notes)
      out.push(
        entry(g, "note", n.id, n.title, n.body.slice(0, 80).replace(/\s+/g, " "), "documents", [n.body]),
      );
    for (const p of g.packing_items) out.push(entry(g, "packing", p.id, p.title, p.category, "packing"));
    for (const d of g.documents)
      out.push(entry(g, "document", d.id, d.filename, null, "documents", [d.notes]));
  }
  return out;
}

const RANK: Record<SearchKind, number> = {
  trip: 0,
  booking: 1,
  option: 2,
  slot: 3,
  station: 4,
  traveler: 5,
  task: 6,
  note: 7,
  document: 8,
  expense: 9,
  packing: 10,
};

/** Entries containing every word of the query; title matches first, then by kind. */
export function search(index: SearchEntry[], query: string, limit = 30): SearchEntry[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const score = (e: SearchEntry) => {
    const title = normalize(e.title);
    const first = words[0] as string;
    const titleScore = title.startsWith(first) ? 0 : words.every((w) => title.includes(w)) ? 1 : 2;
    return titleScore * 100 + RANK[e.kind];
  };
  return index
    .filter((e) => words.every((w) => e.text.includes(w)))
    .map((e) => ({ e, s: score(e) }))
    .sort((a, b) => a.s - b.s || a.e.title.localeCompare(b.e.title))
    .slice(0, limit)
    .map((x) => x.e);
}
