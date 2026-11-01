// @vitest-environment jsdom
// The booking lifecycle in the real screens: an alternative is created, booked and cancelled, and
// a confirmation read by Claude lands in the usual forms. Only the Tauri commands are replaced.

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ExtractedBooking } from "@/api/bindings/ExtractedBooking";
import { addBooking, addFlight, addSlot, graph } from "@/domain/fixture.test-util";
import i18n from "@/i18n";
import { newBundle } from "@/lib/rows";
import { api, settings } from "@/test/api-mock";
import { renderInTrip } from "@/test/render";
import { BookingDialog } from "./BookingDialog";
import { BookingsView } from "./BookingsView";
import { OptionEditor } from "./OptionEditor";

vi.mock("@/api/client", async (original) => ({
  ...(await original<typeof import("@/api/client")>()),
  inDesktopApp: true,
  api: (await import("@/test/api-mock")).api,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => "C:\\mail\\tap.pdf"), save: vi.fn() }));

beforeAll(async () => {
  await i18n.changeLanguage("en");
  // Radix menus measure and capture pointers; jsdom has neither.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
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

function flightTrip() {
  const g = graph();
  const slot = addSlot(g, "flight", { title: "Flights" });
  const option = addFlight(g, slot, 28_000, [
    ["FRA", "LIS", "2027-06-10T07:00", "2027-06-10T09:00"],
    ["LIS", "FRA", "2027-06-17T18:00", "2027-06-17T22:00"],
  ]);
  return { g, slot, option };
}

describe("booking flow", () => {
  it("does not save an alternative without a name and saves a train journey with its means", async () => {
    const user = userEvent.setup();
    const g = graph();
    const slot = addSlot(g, "transport", { title: "Lisbon → Porto" });
    const bundle = newBundle(slot, "EUR", 0);
    renderInTrip(g, <OptionEditor bundle={bundle} slot={slot} booked={false} open onOpenChange={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Save" }));
    expect(screen.getByText("Required")).toBeTruthy();
    expect(api.saveOption).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Name"), "Alfa Pendular");
    await user.selectOptions(screen.getByLabelText("Means"), "bus");
    await user.type(screen.getAllByLabelText("From")[0] as HTMLElement, "Lisboa Oriente");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.saveOption).toHaveBeenCalledTimes(1));
    const [saved] = api.saveOption.mock.calls[0] as unknown as [typeof bundle];
    expect(saved.option.title).toBe("Alfa Pendular");
    expect(saved.segments[0]).toMatchObject({ mode: "bus", from_place: "Lisboa Oriente", seq: 1 });
  });

  it("books an alternative with the reference and all of its segments", async () => {
    const user = userEvent.setup();
    const { g, option } = flightTrip();
    const { model } = renderInTrip(g, <span />);
    cleanup();
    renderInTrip(g, <BookingDialog item={model.item(option.id)} onClose={() => {}} />);
    await user.type(await screen.findByLabelText("Booking reference"), "XK7Q2L");
    await user.click(screen.getByRole("button", { name: "Save booking" }));
    await waitFor(() => expect(api.createBooking).toHaveBeenCalledTimes(1));
    const [input] = api.createBooking.mock.calls[0] as unknown as [
      { booking: { reference: string; price_minor: number }; segment_ids: string[]; new_option: unknown },
    ];
    expect(input.booking.reference).toBe("XK7Q2L");
    expect(input.booking.price_minor).toBe(28_000);
    expect(input.segment_ids).toHaveLength(2);
    expect(input.new_option).toBeNull();
  });

  it("cancels a booking from the bookings list", async () => {
    const user = userEvent.setup();
    const { g, option } = flightTrip();
    const booking = addBooking(g, option, 29_500, { reference: "XK7Q2L" });
    renderInTrip(g, <BookingsView />);
    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Cancel booking" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel booking" }));
    await waitFor(() => expect(api.cancelBooking).toHaveBeenCalledTimes(1));
    expect(api.cancelBooking.mock.calls[0]?.[0]).toMatchObject({ booking_id: booking.id });
  });

  it("turns a confirmation read by Claude into a checked booking with the file attached", async () => {
    settings.push(["ai_import_enabled", "1"]);
    const extracted: ExtractedBooking = {
      kind: "flight",
      title: "TAP Frankfurt – Lisbon",
      provider: "TAP",
      platform: null,
      reference: "ABC123",
      booked_on: "2027-03-01",
      price: 280.5,
      currency: "EUR",
      paid: true,
      contact: null,
      segments: [
        {
          mode: "flight",
          carrier: "TAP",
          number: "TP 571",
          from: "FRA",
          to: "LIS",
          depart_local: "2027-06-10T07:00",
          depart_tz: "Europe/Berlin",
          arrive_local: "2027-06-10T09:00",
          arrive_tz: "Europe/Lisbon",
          cabin: null,
          seat: null,
          baggage: null,
        },
      ],
      stay: null,
      car: null,
      span: null,
      cancellation: null,
      travelers: [],
      notes: null,
    };
    api.extractConfirmation.mockResolvedValue(extracted);
    const user = userEvent.setup();
    renderInTrip(graph(), <BookingsView />);
    await user.click(await screen.findByRole("button", { name: "Import confirmation" }));
    await user.click(await screen.findByRole("button", { name: "Choose file…" }));
    expect(api.extractConfirmation).toHaveBeenCalledWith("C:\\mail\\tap.pdf", "en");
    await user.click(await screen.findByRole("button", { name: "Check and complete" }));

    // The usual option form, pre-filled; a new need was created for it.
    expect(await screen.findByDisplayValue("TAP Frankfurt – Lisbon")).toBeTruthy();
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ type: "slot" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByDisplayValue("ABC123")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save booking" }));
    await waitFor(() => expect(api.attachDocument).toHaveBeenCalledTimes(1));
    const [input] = api.createBooking.mock.calls[0] as unknown as [
      {
        booking: { reference: string; payment_status: string; price_minor: number };
        new_option: { segments: Array<{ from_airport: string }> };
      },
    ];
    expect(input.booking).toMatchObject({ reference: "ABC123", payment_status: "paid", price_minor: 28_050 });
    expect(input.new_option.segments[0]?.from_airport).toBe("FRA");
    expect(api.attachDocument.mock.calls[0]).toEqual([
      expect.any(String),
      "C:\\mail\\tap.pdf",
      null,
      "booking-1",
    ]);
    settings.pop();
  });
});
