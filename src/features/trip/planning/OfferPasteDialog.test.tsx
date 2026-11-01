// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { addSlot, graph } from "@/domain/fixture.test-util";
import type { OptionBundle } from "@/domain/types";
import i18n from "@/i18n";
import { api } from "@/test/api-mock";
import { renderInTrip } from "@/test/render";
import { PlanningView } from "../PlanningView";

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

describe("pasting an offer", () => {
  it("fills a new stay from a Booking.com link and saves it after checking", async () => {
    const user = userEvent.setup();
    const g = graph();
    addSlot(g, "accommodation", { title: "Stay Lisbon" });
    renderInTrip(g, <PlanningView />);

    await user.click(await screen.findByRole("button", { name: "Paste a link or offer" }));
    // Pasting, not typing: the text arrives at once.
    fireEvent.change(screen.getByLabelText("Link or offer text"), {
      target: {
        value:
          "https://www.booking.com/hotel/pt/casa-do-alfama.html?checkin=2027-06-10&checkout=2027-06-14&group_adults=2\nTotal 620 €",
      },
    });
    expect(screen.getByText("Casa Do Alfama")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Read with Claude" }), "Claude is off by default").toBeNull();
    await user.click(screen.getByRole("button", { name: "Fill in the form" }));

    expect(((await screen.findByLabelText("Name")) as HTMLInputElement).value).toBe("Casa Do Alfama");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const saved = api.saveOption.mock.calls[0]?.[0] as OptionBundle;
    expect(saved.option).toMatchObject({
      title: "Casa Do Alfama",
      platform: "Booking.com",
      price_minor: 62000,
      party_size: 2,
      url: expect.stringContaining("booking.com/hotel/pt/casa-do-alfama"),
    });
    expect(saved.accommodation).toMatchObject({ check_in: "2027-06-10", check_out: "2027-06-14" });
    expect(api.extractOffer).not.toHaveBeenCalled();
  });
});
