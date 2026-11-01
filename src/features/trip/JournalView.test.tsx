// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { addBooking, addSlot, addStay, graph } from "@/domain/fixture.test-util";
import type { JournalEntry } from "@/domain/types";
import i18n from "@/i18n";
import { api } from "@/test/api-mock";
import { renderInTrip } from "@/test/render";
import { JournalView } from "./JournalView";

vi.mock("@/api/client", async (original) => ({
  ...(await original<typeof import("@/api/client")>()),
  inDesktopApp: true,
  api: (await import("@/test/api-mock")).api,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => ["C:\\fotos\\tram.jpg"]),
  save: vi.fn(),
}));

beforeAll(async () => {
  await i18n.changeLanguage("en");
  URL.createObjectURL ??= () => "blob:photo";
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

function lisbon() {
  const g = graph();
  const stay = addStay(g, addSlot(g, "accommodation"), 62_000, "2027-06-10", "2027-06-13", {
    title: "Casa do Alfama",
  });
  addBooking(g, stay, 62_000);
  return g;
}

const savedEntries = () =>
  api.save.mock.calls
    .map((c) => c[0] as { type: string; row: JournalEntry })
    .filter((c) => c.type === "journal_entry")
    .map((c) => c.row);

describe("travel journal", () => {
  it("lists every day of the trip with its stay and saves text when leaving the field", async () => {
    const user = userEvent.setup();
    renderInTrip(lisbon(), <JournalView />);
    const days = await screen.findAllByRole("heading", { level: 3 });
    expect(days.map((d) => d.textContent?.slice(0, 5))).toEqual(["Day 1", "Day 2", "Day 3", "Day 4"]);
    expect(days[0]?.textContent).toMatch(/10/);
    expect(days[3]?.textContent).toMatch(/13/);
    expect(screen.getAllByText("Casa do Alfama")).toHaveLength(3);

    const body = document.getElementById("j-body-2027-06-11") as HTMLTextAreaElement;
    await user.click(body);
    await user.tab();
    expect(savedEntries(), "an untouched day is not saved").toHaveLength(0);
    await user.type(body, "Tram 28, then sardines.");
    await user.tab();
    await waitFor(() => expect(savedEntries()).toHaveLength(1));
    expect(savedEntries()[0]).toMatchObject({
      day: "2027-06-11",
      body: "Tram 28, then sardines.",
      title: null,
    });
  });

  it("creates the entry before attaching photos and shows them", async () => {
    const user = userEvent.setup();
    const g = lisbon();
    renderInTrip(g, <JournalView />);
    const card = (await screen.findByRole("heading", { name: /Day 1/ })).closest(
      "div.rounded-xl",
    ) as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "Add photos" }));
    await waitFor(() => expect(api.attachDocument).toHaveBeenCalledTimes(1));
    const [entry] = savedEntries();
    expect(entry?.day).toBe("2027-06-10");
    expect(api.attachDocument).toHaveBeenCalledWith(g.trip.id, "C:\\fotos\\tram.jpg", null, null, entry?.id);
  });

  it("shows stored photos and keeps days outside the trip", async () => {
    const g = lisbon();
    g.journal_entries.push({
      id: "j1",
      trip_id: g.trip.id,
      day: "2027-06-20",
      title: "Back home",
      body: "",
      created_at: "2027-06-20T10:00:00Z",
      updated_at: "2027-06-20T10:00:00Z",
    });
    g.documents.push({
      id: "d1",
      trip_id: g.trip.id,
      option_id: null,
      booking_id: null,
      stored_name: "x.jpg",
      filename: "souvenirs.jpg",
      mime: "image/jpeg",
      size_bytes: 4,
      sha256: "0".repeat(64),
      notes: null,
      created_at: "2027-06-20T10:00:00Z",
      journal_entry_id: "j1",
    });
    renderInTrip(g, <JournalView />);
    const headings = await screen.findAllByRole("heading", { level: 3 });
    expect(headings.at(-1)?.textContent, "a day outside the trip has no number").toMatch(/^\D*20\D*2027$/);
    expect(await screen.findByAltText("souvenirs.jpg")).toBeTruthy();
    expect(api.documentImage).toHaveBeenCalledWith("d1");
  });
});
