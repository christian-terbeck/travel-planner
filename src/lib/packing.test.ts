import { describe, expect, it } from "vitest";
import type { PackingItem } from "@/api/bindings/PackingItem";
import {
  BUILT_IN_LISTS,
  builtInItems,
  groupByCategory,
  mergeItems,
  progress,
  templateFrom,
  templateItems,
} from "./packing";

const row = (title: string, over: Partial<PackingItem> = {}): PackingItem => ({
  id: title,
  trip_id: "trip",
  traveler_id: null,
  category: null,
  title,
  quantity: null,
  packed: false,
  sort: 0,
  ...over,
});

describe("packing lists", () => {
  it("has every built-in item in both languages", () => {
    for (const list of BUILT_IN_LISTS) {
      expect(builtInItems(list, "de").map((i) => i.title)).not.toEqual(
        builtInItems(list, "en").map((i) => i.title),
      );
      for (const i of list.items)
        expect(i.title.en && i.title.de && i.category.en && i.category.de).toBeTruthy();
    }
  });

  it("adds only what is not on the list yet for the same person", () => {
    const existing = [row("Socks", { sort: 4 }), row("Hat", { traveler_id: "anna" })];
    const added = mergeItems(
      "trip",
      existing,
      [
        { category: "Clothes", title: " socks ", quantity: 3 },
        { category: "Clothes", title: "Hat", quantity: null },
        { category: " ", title: "Hat", quantity: null },
        { category: null, title: "", quantity: null },
      ],
      null,
    );
    expect(added.map((i) => [i.title, i.category, i.sort, i.packed])).toEqual([["Hat", "Clothes", 5, false]]);
  });

  it("saves a list once per title without people and reads it back", () => {
    const t = templateFrom(" Beach ", [
      row("Towel", { sort: 2, traveler_id: "anna", packed: true }),
      row("Swimwear", { sort: 1, category: "Beach", quantity: 2 }),
      row("towel", { sort: 3, traveler_id: "ben" }),
    ]);
    expect(t.name).toBe("Beach");
    expect(templateItems(t)).toEqual([
      { category: "Beach", title: "Swimwear", quantity: 2 },
      { category: null, title: "Towel", quantity: null },
    ]);
    expect(templateItems({ ...t, items: "broken" })).toEqual([]);
  });

  it("groups by category with uncategorised items last and counts progress", () => {
    const items = [
      row("A", { sort: 1 }),
      row("B", { category: "Docs", sort: 2, packed: true }),
      row("C", { category: "Docs", sort: 3 }),
    ];
    expect(groupByCategory(items).map((g) => [g.category, g.items.map((i) => i.title)])).toEqual([
      ["Docs", ["B", "C"]],
      [null, ["A"]],
    ]);
    expect(progress(items)).toEqual({ packed: 1, total: 3 });
  });
});
