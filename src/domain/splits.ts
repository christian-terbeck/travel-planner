// Cost splitting between travelers: who carries which share of the costs, who paid what, and
// the transfers that settle the difference. Settlements already made count as paid by the giver
// and as money back for the receiver. Kept per currency unless rates allow conversion.

import { convert } from "./money";
import type { CostShare, ExchangeRate, TripGraph } from "./types";

export interface TravelerBalance {
  travelerId: string;
  share: number;
  paid: number;
  /** paid − share: positive means the others owe this traveler. */
  balance: number;
}

export interface Settlement {
  currency: string;
  balances: TravelerBalance[];
  transfers: Array<{ from: string; to: string; minor: number }>;
  /** Payments not attributed to a traveler, so the settlement may be incomplete. */
  unattributed: number;
  /** Amounts in other currencies that could not be converted. */
  unconvertible: Record<string, number>;
}

/** Splits an amount by weights; rounding remainders go to the first travelers so the sum is exact. */
export function splitByWeights(minor: number, weights: Array<[string, number]>): Map<string, number> {
  if (minor < 0) return new Map([...splitByWeights(-minor, weights)].map(([k, v]) => [k, -v]));
  const out = new Map<string, number>();
  const total = weights.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return out;
  let assigned = 0;
  const parts = weights.map(([id, w]) => {
    const exact = (minor * w) / total;
    const floor = Math.floor(exact);
    assigned += floor;
    return { id, floor, frac: exact - floor };
  });
  let rest = minor - assigned;
  for (const p of [...parts].sort((a, b) => b.frac - a.frac)) {
    if (rest <= 0) break;
    p.floor += 1;
    rest -= 1;
  }
  for (const p of parts) out.set(p.id, p.floor);
  return out;
}

export function settle(g: TripGraph, currency: string, rates: ExchangeRate[]): Settlement {
  const travelers = g.travelers.map((t) => t.id);
  const share = new Map(travelers.map((t) => [t, 0]));
  const paid = new Map(travelers.map((t) => [t, 0]));
  const unconvertible: Record<string, number> = {};
  let unattributed = 0;
  const inCurrency = (minor: number, cur: string): number | null => {
    const m = convert({ minor, currency: cur }, currency, rates);
    if (!m) unconvertible[cur] = (unconvertible[cur] ?? 0) + minor;
    return m?.minor ?? null;
  };
  const weightsFor = (shares: CostShare[]): Array<[string, number]> =>
    shares.length > 0 ? shares.map((s) => [s.traveler_id, Number(s.weight)]) : travelers.map((t) => [t, 1]);

  const costs: Array<{ minor: number; currency: string; shares: CostShare[] }> = [];
  for (const b of g.bookings) {
    const ps = g.payments.filter((p) => p.booking_id === b.id);
    const net = ps.reduce(
      (s, p) =>
        s + (p.currency === b.currency ? (p.kind === "refund" ? -p.amount_minor : p.amount_minor) : 0),
      0,
    );
    // An active booking costs its price; a cancelled one what was kept after refunds.
    const cost = b.status === "active" ? (b.price_minor ?? net) : Math.max(0, net);
    costs.push({
      minor: cost,
      currency: b.currency,
      shares: g.cost_shares.filter((c) => c.booking_id === b.id),
    });
    for (const p of ps) {
      const v = inCurrency(p.kind === "refund" ? -p.amount_minor : p.amount_minor, p.currency);
      if (v === null) continue;
      if (p.traveler_id && paid.has(p.traveler_id))
        paid.set(p.traveler_id, (paid.get(p.traveler_id) ?? 0) + v);
      else unattributed += v;
    }
  }
  for (const e of g.expenses) {
    if (e.kind === "planned") continue;
    const sign = e.kind === "refund" ? -1 : 1;
    costs.push({
      minor: sign * e.amount_minor,
      currency: e.currency,
      shares: g.cost_shares.filter((c) => c.expense_id === e.id),
    });
    const v = inCurrency(sign * e.amount_minor, e.currency);
    if (v === null) continue;
    if (e.paid_by && paid.has(e.paid_by)) paid.set(e.paid_by, (paid.get(e.paid_by) ?? 0) + v);
    else unattributed += v;
  }
  // Money handed over between travelers: the giver has paid more, the receiver less.
  for (const x of g.settlements) {
    const v = inCurrency(x.amount_minor, x.currency);
    if (v === null) continue;
    if (paid.has(x.from_traveler_id)) paid.set(x.from_traveler_id, (paid.get(x.from_traveler_id) ?? 0) + v);
    if (paid.has(x.to_traveler_id)) paid.set(x.to_traveler_id, (paid.get(x.to_traveler_id) ?? 0) - v);
  }
  for (const c of costs) {
    const v = inCurrency(c.minor, c.currency);
    if (v === null) continue;
    for (const [t, part] of splitByWeights(v, weightsFor(c.shares))) {
      if (share.has(t)) share.set(t, (share.get(t) ?? 0) + part);
    }
  }
  const balances = travelers.map((t) => {
    const s = share.get(t) ?? 0;
    const p = paid.get(t) ?? 0;
    return { travelerId: t, share: s, paid: p, balance: p - s };
  });
  return { currency, balances, transfers: transfers(balances), unattributed, unconvertible };
}

/** Greedy settlement: largest debtor pays largest creditor until everyone is even. */
export function transfers(balances: TravelerBalance[]): Settlement["transfers"] {
  const debt = balances.filter((b) => b.balance < 0).map((b) => ({ id: b.travelerId, v: -b.balance }));
  const credit = balances.filter((b) => b.balance > 0).map((b) => ({ id: b.travelerId, v: b.balance }));
  const out: Settlement["transfers"] = [];
  debt.sort((a, b) => b.v - a.v);
  credit.sort((a, b) => b.v - a.v);
  let i = 0;
  let j = 0;
  while (i < debt.length && j < credit.length) {
    const d = debt[i] as { id: string; v: number };
    const c = credit[j] as { id: string; v: number };
    const m = Math.min(d.v, c.v);
    if (m > 0) out.push({ from: d.id, to: c.id, minor: m });
    d.v -= m;
    c.v -= m;
    if (d.v === 0) i++;
    if (c.v === 0) j++;
  }
  return out;
}
