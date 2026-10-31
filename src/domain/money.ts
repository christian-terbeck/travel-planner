// Money is an integer amount in minor units plus an ISO currency code. Sums keep one bucket per
// currency; conversion happens only with an explicit exchange rate, using exact BigInt math.

import type { ExchangeRate } from "./types";

export interface Money {
  minor: number;
  currency: string;
}

const digitsCache = new Map<string, number>();

/** Number of minor-unit digits of a currency (EUR 2, JPY 0, KWD 3). */
export function currencyDigits(currency: string): number {
  let d = digitsCache.get(currency);
  if (d === undefined) {
    try {
      d =
        new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
          .maximumFractionDigits ?? 2;
    } catch {
      d = 2;
    }
    digitsCache.set(currency, d);
  }
  return d;
}

export function money(minor: number, currency: string): Money {
  return { minor, currency };
}

/**
 * Parses user input like "1.234,56", "1,234.56", "1234.5" or "€ 280" into minor units.
 * A single separator followed by at most the currency's digits is the decimal mark,
 * otherwise separators group thousands. Returns null for anything that is not an amount.
 */
export function parseAmount(text: string, currency: string): number | null {
  const digits = currencyDigits(currency);
  const cleaned = text.replace(/[\s  ']/g, "").replace(/[^\d.,-]/g, "");
  if (!/\d/.test(cleaned) || /-/.test(cleaned.slice(1))) return null;
  const negative = cleaned.startsWith("-");
  const body = negative ? cleaned.slice(1) : cleaned;
  if (!/^[\d.,]+$/.test(body)) return null;

  let intPart = body;
  let frac = "";
  const lastDot = body.lastIndexOf(".");
  const lastComma = body.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const sep = lastDot > lastComma ? "." : ",";
    const idx = Math.max(lastDot, lastComma);
    intPart = body.slice(0, idx).replace(/[.,]/g, "");
    frac = body.slice(idx + 1);
    if (frac.includes(sep === "." ? "," : ".")) return null;
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const parts = body.split(sep);
    const tail = parts[parts.length - 1] ?? "";
    if (
      parts.length === 2 &&
      tail.length >= 1 &&
      tail.length <= Math.max(digits, 2) &&
      !(tail.length === 3 && digits < 3)
    ) {
      intPart = parts[0] ?? "";
      frac = tail;
    } else if (parts.slice(1).every((p) => p.length === 3)) {
      intPart = parts.join("");
    } else {
      return null;
    }
  }
  if (frac.length > digits) return null;
  if (intPart === "" && frac === "") return null;
  const minor = Number(intPart || "0") * 10 ** digits + Number(frac.padEnd(digits, "0") || "0");
  if (!Number.isSafeInteger(minor)) return null;
  return negative ? -minor : minor;
}

/** Minor units as a plain decimal string for input fields ("280.00" → "280", "12.50"). */
export function toMajorString(minor: number, currency: string): string {
  const digits = currencyDigits(currency);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const int = Math.floor(abs / 10 ** digits);
  const frac = abs % 10 ** digits;
  return digits === 0 || frac === 0 ? `${sign}${int}` : `${sign}${int}.${String(frac).padStart(digits, "0")}`;
}

export function formatMoney(
  m: Money,
  locale: string,
  opts: { signed?: boolean; compact?: boolean } = {},
): string {
  const digits = currencyDigits(m.currency);
  const fmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: m.currency,
    signDisplay: opts.signed ? "exceptZero" : "auto",
    minimumFractionDigits: opts.compact && m.minor % 10 ** digits === 0 ? 0 : digits,
    maximumFractionDigits: digits,
  });
  // Divide via string to avoid binary rounding: 12345 → "123.45".
  return fmt.format(Number(toMajorString(m.minor, m.currency)));
}

// ---- Sums ---------------------------------------------------------------------------------

/** Per-currency totals. Never collapsed without explicit rates. */
export type Totals = Record<string, number>;

export function addTo(totals: Totals, m: Money): Totals {
  totals[m.currency] = (totals[m.currency] ?? 0) + m.minor;
  return totals;
}

export function mergeTotals(...all: Totals[]): Totals {
  const out: Totals = {};
  for (const t of all) for (const [c, v] of Object.entries(t)) out[c] = (out[c] ?? 0) + v;
  return out;
}

export function scaleTotals(t: Totals, factor: number): Totals {
  const out: Totals = {};
  for (const [c, v] of Object.entries(t)) out[c] = v * factor;
  return out;
}

export function isEmptyTotals(t: Totals): boolean {
  return Object.values(t).every((v) => v === 0);
}

/** A cost that may be incomplete: known amounts per currency plus what is missing. */
export interface CostSum {
  totals: Totals;
  /** Labels or ids of items whose price is unknown. */
  missing: string[];
}

export const emptyCost = (): CostSum => ({ totals: {}, missing: [] });

export function addCost(target: CostSum, part: CostSum): CostSum {
  for (const [c, v] of Object.entries(part.totals)) target.totals[c] = (target.totals[c] ?? 0) + v;
  for (const m of part.missing) if (!target.missing.includes(m)) target.missing.push(m);
  return target;
}

// ---- Conversion ---------------------------------------------------------------------------

interface Ratio {
  num: bigint;
  den: bigint;
}

function parseRate(rate: string): Ratio | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(rate.trim());
  if (!m) return null;
  const frac = m[2] ?? "";
  const num = BigInt((m[1] ?? "0") + frac);
  if (num === 0n) return null;
  return { num, den: 10n ** BigInt(frac.length) };
}

/** Latest explicit rate for base→quote (or the inverse of quote→base), optionally as of a date. */
export function findRate(
  rates: ExchangeRate[],
  base: string,
  quote: string,
  asOf?: string,
): (Ratio & { rate: ExchangeRate }) | null {
  let best: { r: ExchangeRate; inverse: boolean } | null = null;
  for (const r of rates) {
    if (asOf && r.as_of > asOf) continue;
    const direct = r.base === base && r.quote === quote;
    const inverse = r.base === quote && r.quote === base;
    if (!direct && !inverse) continue;
    if (!best || r.as_of > best.r.as_of) best = { r, inverse };
  }
  if (!best) return null;
  const ratio = parseRate(best.r.rate);
  if (!ratio) return null;
  return best.inverse ? { num: ratio.den, den: ratio.num, rate: best.r } : { ...ratio, rate: best.r };
}

/** Rounds num/den to the nearest integer, halves away from zero. */
function divRound(num: bigint, den: bigint): bigint {
  const neg = num < 0n !== den < 0n;
  const a = num < 0n ? -num : num;
  const b = den < 0n ? -den : den;
  const q = (a * 2n + b) / (b * 2n);
  return neg ? -q : q;
}

export function convert(m: Money, target: string, rates: ExchangeRate[], asOf?: string): Money | null {
  if (m.currency === target) return m;
  const r = findRate(rates, m.currency, target, asOf);
  if (!r) return null;
  const scale = 10n ** BigInt(currencyDigits(target));
  const srcScale = 10n ** BigInt(currencyDigits(m.currency));
  const minor = divRound(BigInt(m.minor) * r.num * scale, r.den * srcScale);
  return { minor: Number(minor), currency: target };
}

export interface Converted {
  /** Sum of everything that could be converted, in the target currency. */
  minor: number;
  currency: string;
  /** Currencies without a rate; their amounts are not part of `minor`. */
  unconvertible: Totals;
}

export function convertTotals(t: Totals, target: string, rates: ExchangeRate[]): Converted {
  let minor = 0;
  const unconvertible: Totals = {};
  for (const [c, v] of Object.entries(t)) {
    if (v === 0) continue;
    const m = convert({ minor: v, currency: c }, target, rates);
    if (m) minor += m.minor;
    else unconvertible[c] = v;
  }
  return { minor, currency: target, unconvertible };
}

/** Multiplies minor units by a whole factor (e.g. persons or nights). */
export function times(minor: number, factor: number): number {
  return minor * factor;
}

/** Percentage of an amount, rounded half away from zero. */
export function percentOf(minor: number, percent: number): number {
  return Number(divRound(BigInt(minor) * BigInt(percent), 100n));
}
