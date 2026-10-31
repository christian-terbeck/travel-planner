#!/usr/bin/env node
// Builds public/airports.json from the mwgg/Airports dataset (MIT licence):
//   curl -L -o airports.json https://raw.githubusercontent.com/mwgg/Airports/master/airports.json
//   node scripts/build-airports.mjs path/to/airports.json
// Output rows: [IATA, name, city, country code, IANA time zone, lat, lon], airports with an IATA code only.
import { readFileSync, writeFileSync } from "node:fs";

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/build-airports.mjs <mwgg airports.json>");
  process.exit(1);
}
const data = JSON.parse(readFileSync(source, "utf8"));
const rows = Object.values(data)
  .filter((a) => /^[A-Z]{3}$/.test(a.iata ?? "") && a.tz)
  .map((a) => [
    a.iata,
    a.name,
    a.city || "",
    a.country || "",
    a.tz,
    Math.round(a.lat * 1e4) / 1e4,
    Math.round(a.lon * 1e4) / 1e4,
  ])
  .sort((a, b) => a[0].localeCompare(b[0]));
const unique = rows.filter((r, i) => i === 0 || r[0] !== rows[i - 1][0]);
writeFileSync(new URL("../public/airports.json", import.meta.url), JSON.stringify(unique));
console.log(`${unique.length} airports written`);
