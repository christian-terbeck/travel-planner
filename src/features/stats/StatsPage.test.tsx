// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { addBooking, addFlight, addSlot, addStay, graph, trip } from "@/domain/fixture.test-util";
import i18n from "@/i18n";
import { api } from "@/test/api-mock";
import { renderInTrip } from "@/test/render";
import { StatsPage } from "./StatsPage";

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

describe("statistics page", () => {
  it("shows taken trips with their days and spending", async () => {
    const g = graph(trip({ id: "past", title: "Lisbon 2025" }));
    const f = addFlight(g, addSlot(g, "flight"), 28_000, [
      ["FRA", "LIS", "2025-06-10T07:00", "2025-06-10T09:00"],
      ["LIS", "FRA", "2025-06-17T18:00", "2025-06-17T22:00"],
    ]);
    addBooking(g, f, 28_000);
    addBooking(g, addStay(g, addSlot(g, "accommodation"), 62_000, "2025-06-10", "2025-06-17"), 62_000);
    api.listTrips.mockResolvedValueOnce([g]);
    renderInTrip(graph(), <StatsPage />);
    expect(await screen.findByRole("link", { name: "Lisbon 2025" })).toBeTruthy();
    expect(screen.getAllByText("€900.00").length).toBeGreaterThan(0);
    expect(screen.getByText("7 nights away")).toBeTruthy();
  });

  it("explains when nothing has been travelled yet", async () => {
    api.listTrips.mockResolvedValueOnce([]);
    renderInTrip(graph(), <StatsPage />);
    expect(await screen.findByText("No trips taken yet")).toBeTruthy();
  });
});
