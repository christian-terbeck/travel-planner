// Reads what an offer link or a pasted offer text gives away without going online: dates and
// travellers from the query of booking, rental and flight search links, airports from flight
// search paths, a name from hotel page slugs, and a price when the text states one clearly.
// Everything found is a proposal for the option form; nothing is guessed beyond what is there.

import { currencyDigits } from "@/domain/money";
import type { OptionBundle, Slot } from "@/domain/types";
import { fillFromUrl } from "./providers";
import { newBundle, newSegment, nowIso } from "./rows";

export interface ParsedOffer {
  url: string | null;
  title: string | null;
  /** Local dates (YYYY-MM-DD): check-in / pickup / outbound and check-out / return / return flight. */
  start: string | null;
  end: string | null;
  adults: number | null;
  children: number | null;
  /** IATA codes of a flight search. */
  from: string | null;
  to: string | null;
  price: { amount: number; currency: string } | null;
  /** The pasted text without the link, for the notes or for Claude. */
  rest: string;
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/i;

const START_KEYS = [
  "checkin",
  "check_in",
  "checkindate",
  "chkin",
  "q-check-in",
  "arrival",
  "arrivaldate",
  "arrival_date",
  "startdate",
  "start_date",
  "datefrom",
  "date_from",
  "fromdate",
  "from_date",
  "pickupdate",
  "pickup_date",
  "puday",
  "departuredate",
  "depart",
  "outbounddate",
];
const END_KEYS = [
  "checkout",
  "check_out",
  "checkoutdate",
  "chkout",
  "q-check-out",
  "departure",
  "departure_date",
  "enddate",
  "end_date",
  "dateto",
  "date_to",
  "todate",
  "to_date",
  "dropoffdate",
  "dropoff_date",
  "returndate",
  "return_date",
  "doday",
  "return",
  "inbounddate",
];
const ADULT_KEYS = ["group_adults", "adults", "adult", "no_adults", "num_adults", "adultcount"];
const CHILD_KEYS = ["group_children", "children", "child", "no_children", "num_children", "childcount"];

const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Date patterns with the positions of year, month and day in the match. */
const DATE_FORMATS: Array<[RegExp, number, number, number]> = [
  [/^(\d{4})-(\d{1,2})-(\d{1,2})/, 1, 2, 3],
  [/^(\d{4})(\d{2})(\d{2})$/, 1, 2, 3],
  [/^(\d{2})(\d{2})(\d{2})$/, 1, 2, 3],
  [/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, 3, 2, 1],
  [/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, 3, 1, 2],
];

/** ISO, compact (20270610 / 270610), German (10.06.2027) or US (6/10/2027) dates. */
export function parseDate(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  for (const [re, y, m, d] of DATE_FORMATS) {
    const g = re.exec(v);
    if (!g) continue;
    const year = Number(g[y]);
    return validDate(year < 100 ? 2000 + year : year, Number(g[m]), Number(g[d]));
  }
  return null;
}

function count(raw: string | null | undefined): number | null {
  if (!raw || !/^\d{1,2}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}

const titleCase = (slug: string) =>
  slug
    .split(/[-_+]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** A readable name from hotel page paths like /hotel/pt/casa-do-alfama.de.html. */
function titleFromPath(u: URL): string | null {
  const parts = u.pathname.split("/").filter(Boolean);
  const i = parts.findIndex((p) => /^(hotel|hotels|accommodation|unterkunft)$/i.test(p));
  if (i < 0) return null;
  const last = parts.at(-1);
  if (!last || parts.length <= i + 1) return null;
  const slug = decodeURIComponent(last)
    .replace(/\.html?$/i, "")
    .replace(/\.[a-z]{2}(-[a-z]{2})?$/i, "");
  if (!/[a-z]/i.test(slug) || /^\d+$/.test(slug) || !/[-_+]/.test(slug)) return null;
  return titleCase(slug);
}

/** Airports and dates of flight search paths (Kayak, momondo, Skyscanner and similar). */
function flightFromPath(u: URL): { from: string; to: string; dates: string[] } | null {
  const parts = u.pathname.split("/").filter(Boolean);
  const k = parts.findIndex((p) => /^flights?$/i.test(p));
  if (k < 0) return null;
  const rest = parts.slice(k + 1);
  for (const p of rest) {
    const [, from, to] = /^([a-z]{3})(?:,[a-z]{3})*-([a-z]{3})(?:,[a-z]{3})*$/i.exec(p) ?? [];
    if (!from || !to) continue;
    const dates = rest.map(parseDate).filter((d): d is string => d !== null);
    return { from: from.toUpperCase(), to: to.toUpperCase(), dates };
  }
  // Skyscanner: /transport/flights/fra/lis/270610/270617/
  const [a, b, ...more] = rest;
  if (a && b && /^[a-z]{3,4}$/i.test(a) && /^[a-z]{3,4}$/i.test(b) && a.length === 3 && b.length === 3) {
    const dates = more.map(parseDate).filter((d): d is string => d !== null);
    return { from: a.toUpperCase(), to: b.toUpperCase(), dates };
  }
  return null;
}

const CURRENCY_SIGNS: Record<string, string> = { "€": "EUR", $: "USD", "£": "GBP", "¥": "JPY" };
const CODE = "EUR|USD|GBP|CHF|JPY|DKK|SEK|NOK|PLN|CZK|HUF|AUD|CAD|NZD|THB|TRY|ISK";
const NUM = "\\d{1,3}(?:[.,'’\\s\\u00a0\\u202f]\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?";
const PRICE_RE = new RegExp(
  `(?:([€$£¥]|\\b(?:${CODE})\\b)\\s?(${NUM}))|(?:(${NUM})(?:,-)?\\s?([€$£¥]|\\b(?:${CODE})\\b))`,
  "gi",
);
const TOTAL_RE = /(gesamt\w*|insgesamt|summe|endpreis|total\w*|you pay|sie zahlen|price for)/i;

/** "1.234,56", "1,234.56", "1 234", "1'000", "620" → number. */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/[\s\u00a0\u202f'’]/g, "");
  const dec = /[.,](\d{1,2})$/.exec(s);
  const whole = (dec ? s.slice(0, -dec[0].length) : s).replace(/[.,]/g, "");
  if (!/^\d+$/.test(whole)) return null;
  const n = Number(dec ? `${whole}.${dec[1]}` : whole);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The price of a pasted offer: the amount next to "total"/"Gesamt", else the only amount named.
 * Several different amounts without a total label give nothing, rather than a wrong price.
 */
export function findPrice(text: string): ParsedOffer["price"] {
  const found: Array<{ amount: number; currency: string; total: boolean }> = [];
  for (const line of text.split(/\r?\n/)) {
    for (const m of line.matchAll(PRICE_RE)) {
      const cur = (m[1] ?? m[4] ?? "").toUpperCase();
      const amount = parseAmount(m[2] ?? m[3] ?? "");
      if (amount === null) continue;
      found.push({ amount, currency: CURRENCY_SIGNS[cur] ?? cur, total: TOTAL_RE.test(line) });
    }
  }
  const totals = found.filter((f) => f.total);
  const pick = totals.length > 0 ? totals.at(-1) : undefined;
  if (pick) return { amount: pick.amount, currency: pick.currency };
  const distinct = new Set(found.map((f) => `${f.amount} ${f.currency}`));
  const only = found[0];
  return distinct.size === 1 && only ? { amount: only.amount, currency: only.currency } : null;
}

export function parseOffer(text: string): ParsedOffer {
  const match = URL_RE.exec(text);
  const rawUrl = match?.[0].replace(/[.,;:!?]+$/, "") ?? null;
  const rest = (match ? text.replace(match[0], " ") : text).replace(/[ \t]+/g, " ").trim();
  const out: ParsedOffer = {
    url: null,
    title: null,
    start: null,
    end: null,
    adults: null,
    children: null,
    from: null,
    to: null,
    price: findPrice(rest),
    rest,
  };
  const firstLine = rest
    .split(/\r?\n/)
    .find((l) => l.trim())
    ?.trim();
  if (firstLine && firstLine.length <= 120 && !new RegExp(PRICE_RE.source, "i").test(firstLine))
    out.title = firstLine;

  let u: URL | null = null;
  try {
    u = rawUrl ? new URL(rawUrl) : null;
  } catch {
    u = null;
  }
  if (!u) return out;
  out.url = u.toString();
  const q = new Map<string, string>();
  for (const [k, v] of u.searchParams) if (!q.has(k.toLowerCase())) q.set(k.toLowerCase(), v);
  const first = (keys: string[], read: (v: string) => string | number | null) => {
    for (const k of keys) {
      const v = read(q.get(k) ?? "");
      if (v !== null) return v;
    }
    return null;
  };
  out.start = first(START_KEYS, parseDate) as string | null;
  out.end = first(END_KEYS, parseDate) as string | null;
  // Older Booking.com links split the dates into year, month and day.
  const split = (p: string) =>
    validDate(Number(q.get(`${p}_year`)), Number(q.get(`${p}_month`)), Number(q.get(`${p}_monthday`)));
  out.start ??= split("checkin");
  out.end ??= split("checkout");
  out.adults = first(ADULT_KEYS, count) as number | null;
  out.children = first(CHILD_KEYS, count) as number | null;
  const flight = flightFromPath(u);
  if (flight) {
    out.from = flight.from;
    out.to = flight.to;
    out.start ??= flight.dates[0] ?? null;
    out.end ??= flight.dates[1] ?? null;
  }
  if (out.start && out.end && out.end < out.start) out.end = null;
  out.title = titleFromPath(u) ?? out.title;
  return out;
}

/** Whether anything usable was found, so the dialog can say when a link told nothing. */
export function offerFound(p: ParsedOffer): boolean {
  return !!(p.start || p.end || p.from || p.price || p.adults || p.title);
}

/**
 * A new option of the slot filled with what the offer gave away. Dates without a time are kept
 * where the form takes dates (stays, activities) and otherwise named in the notes.
 */
export function bundleFromOffer(
  p: ParsedOffer,
  slot: Slot,
  tripCurrency: string,
  sort: number,
  datesNote: (start: string, end: string | null) => string,
): OptionBundle {
  const currency = p.price?.currency && /^[A-Z]{3}$/.test(p.price.currency) ? p.price.currency : tripCurrency;
  const b = newBundle(slot, currency, sort);
  const people = (p.adults ?? 0) + (p.children ?? 0);
  const names = fillFromUrl({ provider: null, platform: null }, p.url);
  let notes: string | null = null;
  let host: string | null = null;
  if (p.url) {
    try {
      host = new URL(p.url).hostname.replace(/^www\./, "");
    } catch {
      host = null;
    }
  }

  if (b.accommodation) b.accommodation = { ...b.accommodation, check_in: p.start, check_out: p.end };
  else if (b.activity) b.activity = { ...b.activity, start_date: p.start, end_date: p.end };
  else if (p.start) notes = datesNote(p.start, p.end);
  // The pasted text stays with the option, so nothing that was copied is lost.
  if (p.rest) notes = [notes, p.rest.slice(0, 4000)].filter(Boolean).join("\n\n");

  if (slot.kind === "flight" && p.from && p.to) {
    const out = { ...newSegment(b.option.id, 1), from_airport: p.from, to_airport: p.to };
    b.segments = p.end
      ? [out, { ...newSegment(b.option.id, 2), from_airport: p.to, to_airport: p.from }]
      : [out];
  }

  b.option = {
    ...b.option,
    title: p.title ?? "",
    url: p.url,
    provider: names.provider,
    platform: names.platform,
    price_minor: p.price ? Math.round(p.price.amount * 10 ** currencyDigits(currency)) : null,
    party_size: people > 0 ? people : null,
    notes,
    source: host,
    price_verified_at: p.price ? nowIso() : null,
  };
  return b;
}
