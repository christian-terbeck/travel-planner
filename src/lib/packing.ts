// Packing lists: built-in starting lists, grouping, progress and merging of lists into a trip.

import type { PackingItem } from "@/api/bindings/PackingItem";
import type { PackingTemplate } from "@/api/bindings/PackingTemplate";
import type { PackingTemplateItem } from "@/api/bindings/PackingTemplateItem";
import type { Language } from "@/i18n";
import { newId, nowIso } from "./rows";

type Text = Record<Language, string>;

interface BuiltIn {
  id: string;
  name: Text;
  items: Array<{ category: Text; title: Text; quantity?: number }>;
}

const DOCS: Text = { en: "Documents", de: "Dokumente" };
const TECH: Text = { en: "Electronics", de: "Elektronik" };
const CARE: Text = { en: "Toiletries & health", de: "Hygiene & Gesundheit" };
const CLOTHES: Text = { en: "Clothes", de: "Kleidung" };
const BEACH: Text = { en: "Beach", de: "Strand" };
const SNOW: Text = { en: "Snow", de: "Schnee" };
const KIDS: Text = { en: "Children", de: "Kinder" };
const DAY: Text = { en: "On the go", de: "Unterwegs" };

const item = (category: Text, en: string, de: string, quantity?: number) => ({
  category,
  title: { en, de },
  quantity,
});

export const BUILT_IN_LISTS: BuiltIn[] = [
  {
    id: "essentials",
    name: { en: "Essentials", de: "Grundausstattung" },
    items: [
      item(DOCS, "Passport / ID card", "Reisepass / Personalausweis"),
      item(DOCS, "Driving licence", "Führerschein"),
      item(DOCS, "Health insurance card", "Krankenversicherungskarte"),
      item(DOCS, "Tickets and booking confirmations", "Tickets und Buchungsbestätigungen"),
      item(DOCS, "Credit card and cash", "Kreditkarte und Bargeld"),
      item(TECH, "Phone charger", "Handy-Ladegerät"),
      item(TECH, "Power bank", "Powerbank"),
      item(TECH, "Travel adapter", "Reiseadapter"),
      item(TECH, "Headphones", "Kopfhörer"),
      item(CARE, "Toothbrush and toothpaste", "Zahnbürste und Zahnpasta"),
      item(CARE, "Deodorant", "Deo"),
      item(CARE, "Medication", "Medikamente"),
      item(CARE, "First-aid kit", "Reiseapotheke"),
      item(CLOTHES, "Underwear", "Unterwäsche"),
      item(CLOTHES, "Socks", "Socken"),
      item(CLOTHES, "T-shirts", "T-Shirts"),
      item(CLOTHES, "Trousers", "Hosen"),
      item(CLOTHES, "Pyjamas", "Schlafsachen"),
      item(CLOTHES, "Jacket", "Jacke"),
    ],
  },
  {
    id: "beach",
    name: { en: "Beach holiday", de: "Strandurlaub" },
    items: [
      item(BEACH, "Swimwear", "Badesachen", 2),
      item(BEACH, "Beach towel", "Strandtuch"),
      item(BEACH, "Sunscreen", "Sonnencreme"),
      item(BEACH, "After-sun lotion", "After-Sun-Lotion"),
      item(BEACH, "Sunglasses", "Sonnenbrille"),
      item(BEACH, "Sun hat", "Sonnenhut"),
      item(BEACH, "Flip-flops", "Badeschuhe"),
      item(BEACH, "Beach bag", "Strandtasche"),
      item(BEACH, "Snorkel gear", "Schnorchelausrüstung"),
    ],
  },
  {
    id: "winter",
    name: { en: "Ski and winter", de: "Ski und Winter" },
    items: [
      item(SNOW, "Ski jacket", "Skijacke"),
      item(SNOW, "Ski trousers", "Skihose"),
      item(SNOW, "Thermal underwear", "Funktionsunterwäsche", 2),
      item(SNOW, "Ski socks", "Skisocken", 3),
      item(SNOW, "Gloves", "Handschuhe"),
      item(SNOW, "Beanie", "Mütze"),
      item(SNOW, "Ski goggles", "Skibrille"),
      item(SNOW, "Helmet", "Helm"),
      item(SNOW, "Lip balm with SPF", "Lippenpflege mit Lichtschutz"),
      item(SNOW, "Snow chains", "Schneeketten"),
    ],
  },
  {
    id: "city",
    name: { en: "City trip", de: "Städtereise" },
    items: [
      item(DAY, "Comfortable shoes", "Bequeme Schuhe"),
      item(DAY, "Day backpack", "Tagesrucksack"),
      item(DAY, "Umbrella", "Regenschirm"),
      item(DAY, "Water bottle", "Trinkflasche"),
      item(DAY, "Offline maps", "Offline-Karten"),
    ],
  },
  {
    id: "kids",
    name: { en: "Travelling with children", de: "Reisen mit Kindern" },
    items: [
      item(KIDS, "Snacks", "Snacks"),
      item(KIDS, "Favourite toy", "Lieblingskuscheltier"),
      item(KIDS, "Books and games", "Bücher und Spiele"),
      item(KIDS, "Wet wipes", "Feuchttücher"),
      item(KIDS, "Spare clothes", "Wechselkleidung"),
      item(KIDS, "Children's medication", "Kindermedikamente"),
      item(KIDS, "Child ID / passport", "Kinderreisepass"),
      item(KIDS, "Car seat", "Kindersitz"),
    ],
  },
];

export function builtInItems(list: BuiltIn, lang: Language): PackingTemplateItem[] {
  return list.items.map((i) => ({
    category: i.category[lang],
    title: i.title[lang],
    quantity: i.quantity ?? null,
  }));
}

export function templateItems(t: PackingTemplate): PackingTemplateItem[] {
  try {
    const v: unknown = JSON.parse(t.items);
    return Array.isArray(v) ? (v as PackingTemplateItem[]) : [];
  } catch {
    return [];
  }
}

const key = (title: string) => title.trim().toLocaleLowerCase();

/**
 * New rows for the items of a list that the trip does not have yet for that traveler (or
 * shared). Items already on the list are not added twice.
 */
export function mergeItems(
  tripId: string,
  existing: PackingItem[],
  items: PackingTemplateItem[],
  travelerId: string | null,
): PackingItem[] {
  const have = new Set(existing.filter((i) => i.traveler_id === travelerId).map((i) => key(i.title)));
  let sort = existing.reduce((m, i) => Math.max(m, i.sort), 0);
  const out: PackingItem[] = [];
  for (const i of items) {
    if (!i.title.trim() || have.has(key(i.title))) continue;
    have.add(key(i.title));
    out.push({
      id: newId(),
      trip_id: tripId,
      traveler_id: travelerId,
      category: i.category?.trim() || null,
      title: i.title.trim(),
      quantity: i.quantity,
      packed: false,
      sort: ++sort,
    });
  }
  return out;
}

/** A reusable list from a trip's items: each title once, without who packs it. */
export function templateFrom(name: string, items: PackingItem[]): PackingTemplate {
  const seen = new Set<string>();
  const list: PackingTemplateItem[] = [];
  for (const i of [...items].sort((a, b) => a.sort - b.sort)) {
    if (seen.has(key(i.title))) continue;
    seen.add(key(i.title));
    list.push({ category: i.category, title: i.title, quantity: i.quantity });
  }
  return { id: newId(), name: name.trim(), items: JSON.stringify(list), created_at: nowIso() };
}

/** Items grouped by category (in order of first appearance; items without one last). */
export function groupByCategory(
  items: PackingItem[],
): Array<{ category: string | null; items: PackingItem[] }> {
  const groups = new Map<string | null, PackingItem[]>();
  for (const i of [...items].sort((a, b) => a.sort - b.sort)) {
    const c = i.category?.trim() || null;
    groups.set(c, [...(groups.get(c) ?? []), i]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => Number(a === null) - Number(b === null))
    .map(([category, items]) => ({ category, items }));
}

export function progress(items: PackingItem[]): { packed: number; total: number } {
  return { packed: items.filter((i) => i.packed).length, total: items.length };
}
