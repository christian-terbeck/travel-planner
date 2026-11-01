// Rough greenhouse gas estimate of a trip's travel, from the distances of its route and average
// emission factors per passenger kilometre. Stays and activities are not included. The figures are
// meant to compare alternatives, not to report a footprint.
//
// Factors: UK government (DESNZ) greenhouse gas conversion factors 2025 for business travel, in
// kg CO2e per passenger km; flights including the effect of non-CO2 emissions at altitude
// (radiative forcing). A rental car counts per vehicle km and is shared by the travelers.

import type { Route } from "./geo";
import type { PlanItem } from "./items";
import type { FlightSegment, TransportMode } from "./types";

export const CO2_FACTORS = {
  flightDomestic: 0.26278,
  flightShortEconomy: 0.14825,
  flightShortBusiness: 0.22236,
  flightLongEconomy: 0.14165,
  flightLongPremium: 0.22663,
  flightLongBusiness: 0.41077,
  flightLongFirst: 0.56658,
  train: 0.035,
  bus: 0.02776,
  ferry: 0.01871,
  transfer: 0.14861,
  /** Per vehicle km, average car of unknown fuel. */
  car: 0.17,
} as const;

/** Flights up to this distance count as domestic, up to `LONG_HAUL_KM` as short-haul. */
export const DOMESTIC_KM = 500;
export const LONG_HAUL_KM = 3700;

export type Co2Mode = "flight" | TransportMode | "car";

export interface Co2Estimate {
  /** kg CO2e for one traveler. */
  perPerson: number;
  /** kg CO2e for all travelers (cars counted once). */
  total: number;
  /** kg CO2e per traveler by means of transport. */
  byMode: Partial<Record<Co2Mode, number>>;
  /** Ground km between places whose means is unknown (no car, no transport), not included. */
  uncountedKm: number;
}

export function flightFactor(km: number, cabin: string | null): number {
  const c = cabin?.toLowerCase() ?? "";
  const business = /business|first|erste|premium/.test(c);
  if (km <= DOMESTIC_KM) return CO2_FACTORS.flightDomestic;
  if (km <= LONG_HAUL_KM) return business ? CO2_FACTORS.flightShortBusiness : CO2_FACTORS.flightShortEconomy;
  if (/first|erste/.test(c)) return CO2_FACTORS.flightLongFirst;
  if (/business/.test(c)) return CO2_FACTORS.flightLongBusiness;
  if (/premium/.test(c)) return CO2_FACTORS.flightLongPremium;
  return CO2_FACTORS.flightLongEconomy;
}

const transitFactor = (mode: TransportMode): number =>
  mode === "train" || mode === "bus" || mode === "ferry" ? CO2_FACTORS[mode] : CO2_FACTORS.transfer;

export function estimateCo2(route: Route, items: PlanItem[], travelers: number): Co2Estimate {
  const people = Math.max(1, travelers);
  const segments = new Map<string, FlightSegment>(
    items.flatMap((i) => i.segments.map((s) => [s.segment.id, s.segment] as const)),
  );
  const byMode: Partial<Record<Co2Mode, number>> = {};
  const add = (mode: Co2Mode, kg: number) => {
    byMode[mode] = (byMode[mode] ?? 0) + kg;
  };
  let uncountedKm = 0;
  for (const leg of route.legs) {
    const seg = leg.segmentId ? segments.get(leg.segmentId) : undefined;
    if (leg.mode === "flight") add("flight", leg.km * flightFactor(leg.km, seg?.cabin ?? null));
    else if (leg.mode === "transit") {
      const mode = seg?.mode ?? "other";
      add(mode, leg.km * transitFactor(mode));
    } else if (leg.mode === "drive") add("car", (leg.km * CO2_FACTORS.car) / people);
    else uncountedKm += leg.km;
  }
  const perPerson = Object.values(byMode).reduce((a, b) => a + b, 0);
  // The car's share was divided by the travelers, so it counts once in the total.
  return { perPerson, total: perPerson * people, byMode, uncountedKm };
}
