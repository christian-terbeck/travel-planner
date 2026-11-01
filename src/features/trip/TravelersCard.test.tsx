// @vitest-environment jsdom

import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { graph } from "@/domain/fixture.test-util";
import i18n from "@/i18n";
import { api } from "@/test/api-mock";
import { renderInTrip } from "@/test/render";
import { TravelersCard } from "./TravelersCard";

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

describe("loyalty programmes of travelers", () => {
  it("needs a programme and a number, then saves the membership", async () => {
    const user = userEvent.setup();
    const g = graph();
    g.travelers.push({
      id: "anna",
      trip_id: g.trip.id,
      name: "Anna",
      category: "adult",
      birth_date: null,
      notes: null,
      sort: 0,
    });
    renderInTrip(g, <TravelersCard />);
    await user.click(await screen.findByRole("button", { name: "Add loyalty programme for Anna" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(api.save).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Programme"), "Miles & More");
    await user.type(screen.getByLabelText("Member number"), " 992 000 111 ");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    expect(api.save).toHaveBeenCalledWith({
      type: "loyalty_membership",
      row: expect.objectContaining({ traveler_id: "anna", program: "Miles & More", number: "992 000 111" }),
    });
  });
});
