// @vitest-environment jsdom

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { addBooking, addPayment, addSlot, addStay, graph } from "@/domain/fixture.test-util";
import type { CostShare, Expense, Settlement, TripGraph } from "@/domain/types";
import i18n from "@/i18n";
import { api } from "@/test/api-mock";
import { renderInTrip } from "@/test/render";
import { BudgetView } from "../BudgetView";
import { useTrip } from "../TripLayout";
import { QuickExpenseDialog } from "./QuickExpenseDialog";

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

function threeTravelers(): TripGraph {
  const g = graph();
  for (const [i, name] of ["Anna", "Ben", "Cleo"].entries())
    g.travelers.push({
      id: name.toLowerCase(),
      trip_id: g.trip.id,
      name,
      category: "adult",
      birth_date: null,
      notes: null,
      sort: i,
    });
  return g;
}

const saved = <T,>(type: string) =>
  api.save.mock.calls
    .map((c) => c[0] as { type: string; row: T })
    .filter((c) => c.type === type)
    .map((c) => c.row);

function Quick() {
  return <QuickExpenseDialog model={useTrip()} onClose={() => {}} />;
}

describe("quick expenses", () => {
  it("saves an expense paid by one traveler for two of them, then the next one", async () => {
    const user = userEvent.setup();
    renderInTrip(threeTravelers(), <Quick />);
    const amount = await screen.findByLabelText("Amount");
    expect(document.activeElement).toBe(amount);

    await user.click(screen.getByRole("button", { name: "Save and next" }));
    expect(screen.getByText("Enter the amount.")).toBeTruthy();
    expect(api.save).not.toHaveBeenCalled();

    await user.type(amount, "42,50");
    const paidBy = () => within(screen.getByRole("group", { name: "Paid by" }));
    await user.click(paidBy().getByRole("button", { name: "Ben" }));
    // Cleo was not there.
    await user.click(
      within(screen.getByRole("group", { name: "For whom" })).getByRole("button", { name: "Cleo" }),
    );
    await user.click(screen.getByRole("button", { name: "Save and next" }));

    await waitFor(() => expect(saved<Expense>("expense")).toHaveLength(1));
    const [e] = saved<Expense>("expense");
    expect(e).toMatchObject({
      kind: "actual",
      category: "food",
      title: "Food",
      amount_minor: 4250,
      paid_by: "ben",
    });
    expect(saved<CostShare>("cost_share").map((c) => c.traveler_id)).toEqual(["anna", "ben"]);
    expect(await screen.findByText("1 expense saved. Next one:")).toBeTruthy();
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("");
    expect(paidBy().getByRole("button", { name: "Ben" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("does not store shares when the expense is for everyone", async () => {
    const user = userEvent.setup();
    renderInTrip(threeTravelers(), <Quick />);
    await user.type(await screen.findByLabelText("Amount"), "9");
    await user.type(screen.getByLabelText("What for"), "Tram tickets");
    await user.click(screen.getByRole("button", { name: "Public transport" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved<Expense>("expense")).toHaveLength(1));
    expect(saved<Expense>("expense")[0]).toMatchObject({
      title: "Tram tickets",
      category: "public_transport",
    });
    expect(saved<CostShare>("cost_share")).toHaveLength(0);
  });
});

describe("settling up", () => {
  it("records a suggested transfer as paid", async () => {
    const user = userEvent.setup();
    const g = threeTravelers();
    g.travelers.pop();
    const b = addBooking(
      g,
      addStay(g, addSlot(g, "accommodation"), 60_000, "2027-06-10", "2027-06-17"),
      60_000,
    );
    addPayment(g, b, 60_000, { traveler_id: "anna" });
    renderInTrip(g, <BudgetView />);
    await user.click(await screen.findByRole("button", { name: "Mark as paid" }));
    await waitFor(() => expect(saved<Settlement>("settlement")).toHaveLength(1));
    expect(saved<Settlement>("settlement")[0]).toMatchObject({
      from_traveler_id: "ben",
      to_traveler_id: "anna",
      amount_minor: 30_000,
      currency: "EUR",
    });
  });
});
