// Route and distances of a plan: flights as great-circle distances between airports, travel on
// the ground between airports and stays as straight-line distance times a road factor. Ground
// distances are estimates and are labelled as such; exact road distances need a route service.

import type { PlanItem } from "./items";
import { compareDate, type Instant, type PlainDate } from "./time";

export interface LatLon {
  lat: number;
  lon: number;
}

/** Typical ratio of road distance to straight-line distance in Europe. */
export const ROAD_FACTOR = 1.25;
/** Points closer than this are the same place (e.g. a connection at one airport). */
const SAME_PLACE_KM = 1;
const EARTH_KM = 6371.0088;

export function haversineKm(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function valid(lat: number, lon: number): LatLon | null {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    ? { lat, lon }
    : null;
}

/**
 * Reads coordinates from "38.7139, -9.1334" or from map links (Google Maps "@lat,lon",
 * "!3dlat!4dlon", "q=lat,lon", "ll=", OpenStreetMap "mlat/mlon" and "#map=z/lat/lon"). Offline.
 */
export function parseCoordinates(text: string | null | undefined): LatLon | null {
  if (!text) return null;
  const s = decodeURIComponent(text.trim());
  const num = "(-?\\d{1,3}(?:\\.\\d+)?)";
  const patterns = [
    new RegExp(`!3d${num}!4d${num}`),
    new RegExp(`@${num},${num}`),
    new RegExp(`[?&](?:q|query|ll|center|destination)=${num},\\s*${num}`),
    new RegExp(`#map=\\d+(?:\\.\\d+)?/${num}/${num}`),
    new RegExp(`^${num}\\s*[,;\\s]\\s*${num}$`),
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    if (m) return valid(Number(m[1]), Number(m[2]));
  }
  const mlat = /[?&]mlat=(-?\d+(?:\.\d+)?)/.exec(s);
  const mlon = /[?&]mlon=(-?\d+(?:\.\d+)?)/.exec(s);
  if (mlat && mlon) return valid(Number(mlat[1]), Number(mlon[1]));
  return null;
}

export type LegMode = "flight" | "drive" | "ground";

export interface RoutePoint {
  key: string;
  kind: "airport" | "stay" | "activity";
  label: string;
  pos: LatLon;
  optionId: string | null;
}

export interface Leg {
  from: RoutePoint;
  to: RoutePoint;
  mode: LegMode;
  km: number;
  /** Straight line × road factor instead of a measured distance. */
  estimated: boolean;
  at: Instant | null;
  optionId: string | null;
}

export interface Route {
  points: RoutePoint[];
  legs: Leg[];
  km: Record<LegMode, number>;
  /** Stays in the plan without coordinates (missing from map and distances). */
  missingStays: PlanItem[];
  /** IATA codes not found in the offline airport list. */
  unknownAirports: string[];
}

interface Visit {
  point: RoutePoint;
  at: Instant;
  /** Departure and arrival of the same flight segment are joined by the flight, not by ground travel. */
  segment: { id: string; role: "dep" | "arr" } | null;
}

export function itemPosition(item: PlanItem): LatLon | null {
  const d = item.accommodation ?? item.activity;
  if (d && d.lat !== null && d.lon !== null) return valid(d.lat, d.lon);
  return parseCoordinates(item.accommodation?.map_url);
}

export function buildRoute(
  items: PlanItem[],
  airport: (iata: string) => (LatLon & { name?: string }) | null,
  tz: string,
): Route {
  const points = new Map<string, RoutePoint>();
  const legs: Leg[] = [];
  const visits: Visit[] = [];
  const unknown = new Set<string>();
  const missingStays: PlanItem[] = [];

  const airportPoint = (code: string | null): RoutePoint | null => {
    if (!code) return null;
    const a = airport(code);
    if (!a) {
      unknown.add(code);
      return null;
    }
    const key = `airport:${code}`;
    const p = points.get(key) ?? {
      key,
      kind: "airport" as const,
      label: code,
      pos: { lat: a.lat, lon: a.lon },
      optionId: null,
    };
    points.set(key, p);
    return p;
  };

  for (const item of items) {
    for (const s of item.segments) {
      const from = airportPoint(s.segment.from_airport);
      const to = airportPoint(s.segment.to_airport);
      if (!from || !to) continue;
      legs.push({
        from,
        to,
        mode: "flight",
        km: haversineKm(from.pos, to.pos),
        estimated: false,
        at: s.depart,
        optionId: item.option.id,
      });
      if (s.depart) visits.push({ point: from, at: s.depart, segment: { id: s.segment.id, role: "dep" } });
      if (s.arrive) visits.push({ point: to, at: s.arrive, segment: { id: s.segment.id, role: "arr" } });
    }
    if (item.accommodation || item.activity) {
      const pos = itemPosition(item);
      if (!pos) {
        if (item.accommodation) missingStays.push(item);
        continue;
      }
      const kind = item.accommodation ? ("stay" as const) : ("activity" as const);
      const point: RoutePoint = {
        key: `${kind}:${item.option.id}`,
        kind,
        label: item.option.title,
        pos,
        optionId: item.option.id,
      };
      points.set(point.key, point);
      if (kind === "stay") {
        if (item.start) visits.push({ point, at: item.start, segment: null });
        if (item.end) visits.push({ point, at: item.end, segment: null });
      }
    }
  }

  // Ground travel between consecutive places in time order.
  const cars = items.filter((i) => i.rentalCar && i.startDate && i.endDate);
  const hasCar = (day: PlainDate) =>
    cars.some(
      (c) => compareDate(c.startDate as PlainDate, day) <= 0 && compareDate(c.endDate as PlainDate, day) >= 0,
    );
  visits.sort((a, b) => a.at.epochMilliseconds - b.at.epochMilliseconds);
  for (let k = 1; k < visits.length; k++) {
    const a = visits[k - 1] as Visit;
    const b = visits[k] as Visit;
    if (a.segment?.role === "dep" && b.segment?.role === "arr" && a.segment.id === b.segment.id) continue;
    // Inside a flight (departure seen, arrival not yet): nothing happens on the ground.
    if (a.segment?.role === "dep") continue;
    const straight = haversineKm(a.point.pos, b.point.pos);
    if (straight < SAME_PLACE_KM) continue;
    const day = b.at.toZonedDateTimeISO(tz).toPlainDate();
    legs.push({
      from: a.point,
      to: b.point,
      mode: hasCar(day) ? "drive" : "ground",
      km: straight * ROAD_FACTOR,
      estimated: true,
      at: a.at,
      optionId: null,
    });
  }
  legs.sort((x, y) => (x.at?.epochMilliseconds ?? 0) - (y.at?.epochMilliseconds ?? 0));
  const km: Record<LegMode, number> = { flight: 0, drive: 0, ground: 0 };
  for (const l of legs) km[l.mode] += l.km;
  return { points: [...points.values()], legs, km, missingStays, unknownAirports: [...unknown].sort() };
}
