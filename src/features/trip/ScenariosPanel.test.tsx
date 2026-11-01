// @vitest-environment jsdom

import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { addFlight, addSlot, graph } from "@/domain/fixture.test-util";
import i18n from "@/i18n";
import { renderInTrip } from "@/test/render";
import { ScenariosPanel } from "./ScenariosPanel";

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
afterEach(cleanup);

describe("combination explorer", () => {
  it("orders by price until other measures are weighted", async () => {
    const user = userEvent.setup();
    const g = graph();
    const fs = addSlot(g, "flight");
    addFlight(
      g,
      fs,
      25_000,
      [
        ["FRA", "MAD", "2027-06-10T06:00", "2027-06-10T08:30"],
        ["MAD", "LIS", "2027-06-10T10:00", "2027-06-10T10:30"],
      ],
      { title: "Via Madrid" },
    );
    addFlight(g, fs, 32_000, [["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"]], { title: "Direct" });
    renderInTrip(g, <ScenariosPanel />);
    await user.click(await screen.findByRole("button", { name: "Explore combinations" }));
    const firstRow = () => screen.getAllByRole("row")[1] as HTMLElement;
    expect(within(firstRow()).getByText("Via Madrid")).toBeTruthy();
    expect(within(firstRow()).getByText(/1 change/)).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Time on the way & changes"), "3");
    // Equally important: a tie, broken by price.
    expect(within(firstRow()).getByText("Via Madrid")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Price"), "1");
    expect(within(firstRow()).getByText("Direct")).toBeTruthy();
    expect(within(firstRow()).getByText("Best by your weights")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Back to price only" }));
    expect(within(firstRow()).getByText("Via Madrid")).toBeTruthy();
  });

  it("compares travel dates when the alternatives allow several", async () => {
    const user = userEvent.setup();
    const g = graph();
    const fs = addSlot(g, "flight");
    addFlight(g, fs, 30_000, [
      ["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"],
      ["LIS", "FRA", "2027-06-17T18:00", "2027-06-17T22:00"],
    ]);
    addFlight(g, fs, 22_000, [
      ["FRA", "LIS", "2027-06-12T07:00", "2027-06-12T09:00"],
      ["LIS", "FRA", "2027-06-19T18:00", "2027-06-19T22:00"],
    ]);
    renderInTrip(g, <ScenariosPanel />);
    await user.click(await screen.findByRole("button", { name: "Explore combinations" }));
    const table = screen.getByRole("heading", { name: "Travel dates compared" }).parentElement as HTMLElement;
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText("+€80.00")).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText("Cheapest dates")).toBeTruthy();
  });
});
