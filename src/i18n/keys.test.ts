// Every translation key used literally in the UI exists in the English texts.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SLOT_KINDS } from "@/lib/rows";
import de from "./de";
import en from "./en";
import { uiLanguage } from "./index";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !f.endsWith(".test.ts") ? [p] : [];
  });
}

function has(key: string): boolean {
  let node: unknown = en;
  const parts = key.split(".");
  for (const [i, part] of parts.entries()) {
    if (!node || typeof node !== "object") return false;
    const obj = node as Record<string, unknown>;
    if (i === parts.length - 1) return part in obj || `${part}_one` in obj || `${part}_other` in obj;
    node = obj[part];
  }
  return false;
}

describe("translations", () => {
  it("contain every literal key used in the source", () => {
    const keys = new Set<string>();
    for (const f of files(join(__dirname, ".."))) {
      for (const m of readFileSync(f, "utf8").matchAll(/\bt\(\s*"([a-zA-Z0-9_.]+)"/g))
        keys.add(m[1] as string);
    }
    const missing = [...keys].filter((k) => !has(k));
    expect(missing).toEqual([]);
  });

  it("contain every value of dynamically built keys", () => {
    const groups: Record<string, string[]> = {
      status: ["idea", "planned", "preferred", "booked", "cancelled", "completed", "archived", "rejected"],
      tripStatus: ["idea", "planning", "booked", "ongoing", "completed", "cancelled", "archived"],
      kind: SLOT_KINDS,
      slotDefault: SLOT_KINDS,
      "option.titlePlaceholder": SLOT_KINDS,
      "option.providerPlaceholder": SLOT_KINDS,
      transportMode: ["train", "bus", "ferry", "transfer", "other"],
      parking: ["title", "location", "date", "start", "endDate", "end"],
      "map.modes": ["flight", "transit", "drive", "ground"],
      warning: [
        "flight_overlap",
        "short_connection",
        "airport_change",
        "overnight_layover",
        "stay_outside_period",
        "stay_overlap",
        "accommodation_gap",
        "activity_outside_period",
        "activities_overlap",
        "activity_after_arrival",
        "activity_before_departure",
        "check_in_wait",
        "check_out_wait",
        "pickup_before_arrival",
        "pickup_tight",
        "return_after_departure",
        "return_tight",
        "rental_missing_on_transfer",
        "missing_required",
        "missing_price",
        "outside_date_limits",
        "nights_outside_limits",
        "duplicate_booking",
        "stay_outside_station",
        "insurance_not_covering",
        "document_expires",
        "passport_validity",
      ],
      reminder: [
        "cancellation_deadline",
        "departure",
        "payment_due",
        "activity",
        "missing_accommodation",
        "missing_document",
        "task_due",
        "price_target",
        "document_expiry",
        "passport_validity",
      ],
      "cancellation.state": [
        "free",
        "with_fee",
        "partial",
        "non_refundable",
        "deadline_passed",
        "unknown",
        "cancelled",
      ],
      payment: [
        "not_applicable",
        "unpaid",
        "partially_paid",
        "paid",
        "refunded",
        "partially_refunded",
        "unknown",
      ],
      "trip.tab": ["overview", "planning", "itinerary", "map", "bookings", "budget", "documents"],
    };
    const missing = Object.entries(groups)
      .flatMap(([g, vs]) => vs.map((v) => `${g}.${v}`))
      .filter((k) => !has(k));
    expect(missing).toEqual([]);
  });
});

describe("german", () => {
  function leaves(node: unknown, prefix = ""): [string, string][] {
    if (typeof node === "string") return [[prefix, node]];
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
      leaves(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

  it("uses the same placeholders as the English texts", () => {
    const german = new Map(leaves(de));
    const wrong = leaves(en)
      .filter(([k, v]) => JSON.stringify(vars(v)) !== JSON.stringify(vars(german.get(k) ?? "")))
      .map(([k]) => k);
    expect(wrong).toEqual([]);
  });

  it("is chosen for German formats unless set otherwise", () => {
    expect(uiLanguage(null, "de-AT")).toBe("de");
    expect(uiLanguage("", "en-GB")).toBe("en");
    expect(uiLanguage("en", "de-DE")).toBe("en");
    expect(uiLanguage("de", "fr-FR")).toBe("de");
  });
});
