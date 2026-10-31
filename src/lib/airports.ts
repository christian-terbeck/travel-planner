// Offline airport lookup (IATA → name, city, country, IANA zone), loaded on first use from the
// bundled public/airports.json.

import { useEffect, useState } from "react";

export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
  tz: string;
  lat: number;
  lon: number;
}

let cache: Promise<Map<string, Airport>> | null = null;

export function loadAirports(): Promise<Map<string, Airport>> {
  cache ??= fetch("/airports.json")
    .then((r) => r.json() as Promise<Array<[string, string, string, string, string, number, number]>>)
    .then(
      (rows) =>
        new Map(
          rows.map(([iata, name, city, country, tz, lat, lon]) => [
            iata,
            { iata, name, city, country, tz, lat, lon },
          ]),
        ),
    )
    .catch(() => new Map<string, Airport>());
  return cache;
}

export function useAirports(): Map<string, Airport> | null {
  const [map, setMap] = useState<Map<string, Airport> | null>(null);
  useEffect(() => {
    let alive = true;
    void loadAirports().then((m) => alive && setMap(m));
    return () => {
      alive = false;
    };
  }, []);
  return map;
}

export function searchAirports(map: Map<string, Airport>, query: string, limit = 8): Airport[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const exact = map.get(q.toUpperCase());
  const out: Airport[] = exact ? [exact] : [];
  for (const a of map.values()) {
    if (out.length >= limit) break;
    if (a === exact) continue;
    if (a.city.toLowerCase().startsWith(q) || a.name.toLowerCase().includes(q)) out.push(a);
  }
  return out;
}
