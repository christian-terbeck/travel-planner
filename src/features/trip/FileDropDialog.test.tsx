// @vitest-environment jsdom

import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { addBooking, addFlight, addSlot, graph } from "@/domain/fixture.test-util";
import i18n from "@/i18n";
import { api, settings } from "@/test/api-mock";
import { renderInTrip } from "@/test/render";
import { BookingsView } from "./BookingsView";
import { FileDropDialog } from "./FileDropDialog";
import { useTrip } from "./TripLayout";

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
  settings.splice(1);
});

function Dropped({ paths }: { paths: string[] }) {
  return <FileDropDialog model={useTrip()} paths={paths} onClose={() => {}} />;
}

function bookedTrip() {
  const g = graph();
  const slot = addSlot(g, "flight", { title: "Flights" });
  const option = addFlight(g, slot, 28_000, [["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"]]);
  const booking = addBooking(g, option, 28_000, { reference: "ABC123" });
  return { g, booking };
}

describe("dropping files on a trip", () => {
  it("attaches dropped files to the chosen booking", async () => {
    const user = userEvent.setup();
    const { g, booking } = bookedTrip();
    renderInTrip(g, <Dropped paths={["C:\\mail\\ticket.pdf", "C:\\mail\\seat.png"]} />);
    expect(await screen.findByRole("dialog", { name: "2 files dropped" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Read as booking" }), "the import is off").toBeNull();
    await user.selectOptions(screen.getByLabelText("Attach to"), `b:${booking.id}`);
    await user.click(screen.getByRole("button", { name: "Attach as document" }));
    await waitFor(() => expect(api.attachDocument).toHaveBeenCalledTimes(2));
    expect(api.attachDocument).toHaveBeenCalledWith(g.trip.id, "C:\\mail\\ticket.pdf", null, booking.id);
  });

  it("offers reading one confirmation as a booking only when the import is on", async () => {
    settings.push(["ai_import_enabled", "1"]);
    renderInTrip(graph(), <Dropped paths={["C:\\mail\\ticket.pdf"]} />);
    expect(await screen.findByRole("button", { name: "Read as booking" })).toBeTruthy();
    cleanup();
    renderInTrip(graph(), <Dropped paths={["C:\\mail\\ticket.docx"]} />);
    await screen.findByRole("dialog", { name: "1 file dropped" });
    expect(screen.queryByRole("button", { name: "Read as booking" }), "Claude cannot read .docx").toBeNull();
  });

  it("reads a dropped confirmation at once on the bookings page", async () => {
    settings.push(["ai_import_enabled", "1"]);
    api.extractConfirmation.mockRejectedValue(new ApiError("ai_no_key", null, "no key"));
    renderInTrip(graph(), <BookingsView />, { importPath: "C:\\mail\\ticket.pdf" });
    await waitFor(() => expect(api.extractConfirmation).toHaveBeenCalledWith("C:\\mail\\ticket.pdf", "en"));
    expect(await screen.findByText("Store an Anthropic API key in Settings first.")).toBeTruthy();
  });
});
