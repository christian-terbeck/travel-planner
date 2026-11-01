// Weather shown for the places of a trip: which stays to ask for and how WMO codes read.

import type { WeatherQuery } from "@/api/bindings/WeatherQuery";
import type { PlanItem } from "@/domain/items";
import { Temporal } from "@/domain/time";

export type WeatherKind =
  | "clear"
  | "partly"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "showers"
  | "snow"
  | "thunder";

/** Groups the WMO weather codes Open-Meteo uses. */
export function weatherKind(code: number | null): WeatherKind | null {
  if (code === null) return null;
  if (code === 0) return "clear";
  if (code <= 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 61 && code <= 67) return "rain";
  if (code >= 80 && code <= 82) return "showers";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "thunder";
  return null;
}

/** The service answers at most 31 days per place. */
const MAX_DAYS = 31;

export interface WeatherPlace {
  item: PlanItem;
  query: WeatherQuery;
}

/** Stays of the plan with coordinates and dates, in the order of the trip. */
export function weatherPlaces(items: PlanItem[]): WeatherPlace[] {
  const out: WeatherPlace[] = [];
  for (const item of items) {
    const { lat, lon } = item.accommodation ?? {};
    const from = item.startDate;
    const end = item.endDate;
    if (lat == null || lon == null || !from || !end) continue;
    const last = from.add({ days: MAX_DAYS - 1 });
    const to = Temporal.PlainDate.compare(end, last) > 0 ? last : end;
    out.push({ item, query: { lat, lon, from: from.toString(), to: to.toString() } });
  }
  return out.sort((a, b) => a.query.from.localeCompare(b.query.from));
}
