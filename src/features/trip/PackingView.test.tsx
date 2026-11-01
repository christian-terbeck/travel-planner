// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PackingItem } from "@/api/bindings/PackingItem";
import { graph } from "@/domain/fixture.test-util";
import i18n from "@/i18n";
import { api } from "@/test/api-mock";
import { renderInTrip } from "@/test/render";
import { PackingView } from "./PackingView";

vi.mock("@/api/client", async (original) => ({
  ...(await original<typeof import("@/api/client")>()),
  inDesktopApp: true,
  api: (await import("@/test/api-mock")).api,
}));

beforeAll(async () => {
  await i18n.changeLanguage("en");
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const saved = () => api.save.mock.calls.map((c) => (c[0] as { row: PackingItem }).row);

describe("packing list", () => {
  it("adds an item, packs it and adds a suggested list without duplicates", async () => {
    const user = userEvent.setup();
    const g = graph();
    g.packing_items.push({
      id: "p1",
      trip_id: g.trip.id,
      traveler_id: null,
      category: "Beach",
      title: "Sunscreen",
      quantity: null,
      packed: false,
      sort: 1,
    });
    renderInTrip(g, <PackingView />);
    expect(await screen.findByText("0 of 1 packed")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Sunscreen" }));
    await waitFor(() => expect(saved()[0]).toMatchObject({ id: "p1", packed: true }));

    await user.type(screen.getByLabelText("Item"), "Book");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(saved()[1]).toMatchObject({ title: "Book", packed: false, sort: 2 }));

    await user.click(screen.getByRole("button", { name: "Add a list…" }));
    const dialog = await screen.findByRole("dialog");
    const beach = within(dialog).getByText("Beach holiday").closest("li") as HTMLElement;
    await user.click(within(beach).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const titles = saved()
      .slice(2)
      .map((r) => r.title);
    expect(titles).toContain("Beach towel");
    expect(titles).not.toContain("Sunscreen");
  });
});
