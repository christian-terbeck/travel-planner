// @vitest-environment jsdom

import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { addFlight, addSlot, graph, preferAll } from "@/domain/fixture.test-util";
import i18n from "@/i18n";
import { api } from "@/test/api-mock";
import { renderInTrip } from "@/test/render";
import { CopyTripDialog } from "./CopyTripDialog";

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

describe("copy trip", () => {
  it("moves the copy a year ahead on the same weekday by default", async () => {
    const user = userEvent.setup();
    const g = graph();
    addFlight(g, addSlot(g, "flight"), 1, [["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"]]);
    preferAll(g);
    const { model } = renderInTrip(g, <span />);
    cleanup();
    renderInTrip(g, <CopyTripDialog model={model} onClose={() => {}} />);
    expect((await screen.findByLabelText("New start date")).getAttribute("value")).toBe("2028-06-08");
    await user.click(screen.getByLabelText("Travelers"));
    await user.click(screen.getByRole("button", { name: "Create copy" }));
    await waitFor(() => expect(api.copyTrip).toHaveBeenCalledTimes(1));
    expect(api.copyTrip.mock.calls[0]?.[0]).toMatchObject({
      title: "Portugal Road Trip (copy)",
      shift_days: 364,
      include_options: true,
      include_travelers: false,
    });
  });
});
