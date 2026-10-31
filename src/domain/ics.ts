// iCalendar (RFC 5545) export of a trip's itinerary.

import type { PlanItem } from "./items";
import type { Instant, PlainDate } from "./time";
import type { Trip } from "./types";

function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds lines longer than 75 octets (UTF-8) with CRLF + space. */
export function fold(line: string): string {
  const bytes = new TextEncoder();
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    if (bytes.encode(current + ch).length > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = ch;
    } else current += ch;
  }
  out.push(current);
  return out.join("\r\n ");
}

const utc = (i: Instant) => i.toString({ smallestUnit: "second" }).replace(/[-:]/g, "").replace(/\.\d+/, "");
const day = (d: PlainDate) => d.toString().replace(/-/g, "");

export interface IcsEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: { instant: Instant } | { date: PlainDate };
  end: { instant: Instant } | { date: PlainDate };
  confirmed: boolean;
}

export function itemEvents(item: PlanItem): IcsEvent[] {
  const confirmed = item.activeBookings.length > 0;
  const ref = item.activeBookings
    .map((b) => b.reference)
    .filter(Boolean)
    .join(", ");
  const details = [item.option.provider, item.option.platform, ref ? `Ref ${ref}` : null, item.option.url]
    .filter(Boolean)
    .join("\n");
  const events: IcsEvent[] = [];
  if (item.kind === "flight") {
    for (const s of item.segments) {
      if (!s.depart || !s.arrive) continue;
      const seg = s.segment;
      events.push({
        uid: `${seg.id}@travel-planner`,
        summary: `✈ ${[seg.flight_number, `${seg.from_airport ?? "?"} → ${seg.to_airport ?? "?"}`].filter(Boolean).join(" ")}`,
        description: details,
        location: seg.from_airport ?? undefined,
        start: { instant: s.depart },
        end: { instant: s.arrive },
        confirmed,
      });
    }
    return events;
  }
  if (item.accommodation && item.startDate && item.endDate) {
    events.push({
      uid: `${item.option.id}@travel-planner`,
      summary: `🛏 ${item.option.title}`,
      description: details,
      location: item.accommodation.address ?? undefined,
      start: { date: item.startDate },
      end: { date: item.endDate },
      confirmed,
    });
    return events;
  }
  if (item.rentalCar && item.start && item.end) {
    const r = item.rentalCar;
    events.push(
      {
        uid: `${item.option.id}-pickup@travel-planner`,
        summary: `🚗 Pick up: ${item.option.title}`,
        description: details,
        location: r.pickup_location ?? undefined,
        start: { instant: item.start },
        end: { instant: item.start.add({ minutes: 30 }) },
        confirmed,
      },
      {
        uid: `${item.option.id}-return@travel-planner`,
        summary: `🚗 Return: ${item.option.title}`,
        description: details,
        location: r.return_location ?? undefined,
        start: { instant: item.end },
        end: { instant: item.end.add({ minutes: 30 }) },
        confirmed,
      },
    );
    return events;
  }
  if (item.start && item.end) {
    events.push({
      uid: `${item.option.id}@travel-planner`,
      summary: item.option.title,
      description: details,
      location: item.activity?.location ?? undefined,
      start: { instant: item.start },
      end: { instant: item.end },
      confirmed,
    });
  } else if (item.startDate) {
    events.push({
      uid: `${item.option.id}@travel-planner`,
      summary: item.option.title,
      description: details,
      location: item.activity?.location ?? undefined,
      start: { date: item.startDate },
      end: { date: (item.endDate ?? item.startDate).add({ days: 1 }) },
      confirmed,
    });
  }
  return events;
}

export function buildIcs(trip: Trip, items: PlanItem[], stamp: Instant): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Travel Planner//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(trip.title)}`,
  ];
  for (const e of items.flatMap(itemEvents)) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${utc(stamp)}`);
    lines.push(
      "instant" in e.start ? `DTSTART:${utc(e.start.instant)}` : `DTSTART;VALUE=DATE:${day(e.start.date)}`,
    );
    lines.push("instant" in e.end ? `DTEND:${utc(e.end.instant)}` : `DTEND;VALUE=DATE:${day(e.end.date)}`);
    lines.push(`SUMMARY:${escapeText(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    lines.push(`STATUS:${e.confirmed ? "CONFIRMED" : "TENTATIVE"}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
